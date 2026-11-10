import { Injectable } from '@nestjs/common';
import { CampAuditAction } from '@prisma/client';
import { badRequest, notFound } from '../../../common/i18n/app-error';
import { SystemPrismaService } from '../../../db/system-prisma.service';
import { PrismaTenantClientService } from '../../../db/prisma-tenant-client.service';
import { CampAccessService } from '../../camp/common/camp-access.service';
import { CampAuditService } from '../../camp/common/camp-audit.service';
import { inTenantTx } from '../../camp/common/camp-tx';
import { TenantSecurityPolicyService } from '../../../auth/tenant-security-policy.service';
import { UpdateTenantProfileDto, UpdateTenantSecurityPolicyDto } from './core-tenant-settings.dto';

const PROFILE_FIELDS = ['name', 'logoPath', 'timeZone', 'defaultLanguage', 'activeLanguages', 'baseCurrency', 'dateFormat'] as const;
const SECURITY_FIELDS = ['passwordMinLength', 'loginFailureLimit', 'loginLockoutMinutes', 'sessionDurationMinutes'] as const;
const SETTINGS_SELECT = {
  organizationName: true,
  logoPath: true,
  timeZone: true,
  defaultLanguage: true,
  activeLanguages: true,
  baseCurrency: true,
  dateFormat: true,
  passwordMinLength: true,
  loginFailureLimit: true,
  loginLockoutMinutes: true,
  sessionDurationMinutes: true,
  updatedAt: true,
} as const;

type SettingsRow = {
  organizationName: string;
  logoPath: string | null;
  timeZone: string;
  defaultLanguage: string;
  activeLanguages: string[];
  baseCurrency: string;
  dateFormat: string;
  passwordMinLength: number;
  loginFailureLimit: number;
  loginLockoutMinutes: number;
  sessionDurationMinutes: number;
  updatedAt: Date;
};

@Injectable()
export class CoreTenantSettingsService {
  constructor(
    private readonly prisma: PrismaTenantClientService,
    private readonly system: SystemPrismaService,
    private readonly access: CampAccessService,
    private readonly audit: CampAuditService,
    private readonly securityPolicy: TenantSecurityPolicyService,
  ) {}

  async get(tenantId: string, authId: string) {
    const tenantName = await this.tenantName(tenantId);
    return inTenantTx(this.prisma, tenantId, async (tx) => {
      await this.access.requireTenantAdmin(tx, tenantId, authId);
      const settings = await tx.coreTenantSettings.upsert({
        where: { tenantId },
        create: { tenantId, organizationName: tenantName },
        update: {},
        select: SETTINGS_SELECT,
      });
      return this.toView(settings);
    });
  }

  async updateProfile(tenantId: string, authId: string, dto: UpdateTenantProfileDto) {
    const tenantName = await this.tenantName(tenantId);
    const result = await inTenantTx(this.prisma, tenantId, async (tx) => {
      const actorUserId = await this.access.requireTenantAdmin(tx, tenantId, authId);
      const current = await tx.coreTenantSettings.upsert({
        where: { tenantId },
        create: { tenantId, organizationName: tenantName },
        update: {},
        select: SETTINGS_SELECT,
      });
      const next = {
        name: dto.name?.trim() ?? current.organizationName,
        logoPath: dto.logoPath === undefined ? current.logoPath : dto.logoPath,
        timeZone: dto.timeZone ?? current.timeZone,
        defaultLanguage: dto.defaultLanguage ?? current.defaultLanguage,
        activeLanguages: dto.activeLanguages ?? current.activeLanguages,
        baseCurrency: dto.baseCurrency ?? current.baseCurrency,
        dateFormat: dto.dateFormat ?? current.dateFormat,
      };
      if (!next.name) throw badRequest('core.settings.profile_name_required');
      if (!next.activeLanguages.includes(next.defaultLanguage)) {
        throw badRequest('core.settings.default_language_not_active');
      }
      this.assertTimeZone(next.timeZone);
      const updated = await tx.coreTenantSettings.update({
        where: { tenantId },
        data: {
          organizationName: next.name,
          logoPath: next.logoPath,
          timeZone: next.timeZone,
          defaultLanguage: next.defaultLanguage,
          activeLanguages: next.activeLanguages,
          baseCurrency: next.baseCurrency,
          dateFormat: next.dateFormat,
        },
        select: SETTINGS_SELECT,
      });
      await this.audit.record(tx, {
        tenantId,
        campId: null,
        entityType: 'tenant_settings',
        entityId: tenantId,
        action: CampAuditAction.UPDATE,
        actorUserId,
        fields: PROFILE_FIELDS,
        before: this.profileAudit(current),
        after: this.profileAudit(updated),
      });
      return this.toView(updated);
    });
    await this.securityPolicy.invalidate(tenantId);
    return result;
  }

  async updateSecurity(tenantId: string, authId: string, dto: UpdateTenantSecurityPolicyDto) {
    const tenantName = await this.tenantName(tenantId);
    const result = await inTenantTx(this.prisma, tenantId, async (tx) => {
      const actorUserId = await this.access.requireTenantAdmin(tx, tenantId, authId);
      const current = await tx.coreTenantSettings.upsert({
        where: { tenantId },
        create: { tenantId, organizationName: tenantName },
        update: {},
        select: SETTINGS_SELECT,
      });
      const updated = await tx.coreTenantSettings.update({
        where: { tenantId },
        data: {
          ...(dto.passwordMinLength !== undefined ? { passwordMinLength: dto.passwordMinLength } : {}),
          ...(dto.loginFailureLimit !== undefined ? { loginFailureLimit: dto.loginFailureLimit } : {}),
          ...(dto.loginLockoutMinutes !== undefined ? { loginLockoutMinutes: dto.loginLockoutMinutes } : {}),
          ...(dto.sessionDurationMinutes !== undefined ? { sessionDurationMinutes: dto.sessionDurationMinutes } : {}),
        },
        select: SETTINGS_SELECT,
      });
      await this.audit.record(tx, {
        tenantId,
        campId: null,
        entityType: 'tenant_settings',
        entityId: tenantId,
        action: CampAuditAction.UPDATE,
        actorUserId,
        fields: SECURITY_FIELDS,
        before: this.securityAudit(current),
        after: this.securityAudit(updated),
      });
      return this.toView(updated);
    });
    await this.securityPolicy.invalidate(tenantId);
    return result;
  }

  private async tenantName(tenantId: string): Promise<string> {
    const rows = await this.system.$queryRaw<{ name: string }[]>`
      SELECT name FROM tenants WHERE id = ${tenantId}::uuid LIMIT 1`;
    if (!rows[0]) throw notFound('core.settings.tenant_not_found');
    return rows[0].name;
  }

  private assertTimeZone(value: string) {
    try {
      new Intl.DateTimeFormat('en', { timeZone: value });
    } catch (error) {
      if (error instanceof RangeError) throw badRequest('core.settings.invalid_time_zone');
      throw error;
    }
  }

  private profileAudit(s: SettingsRow) {
    return {
      name: s['organizationName'],
      logoPath: s['logoPath'],
      timeZone: s['timeZone'],
      defaultLanguage: s['defaultLanguage'],
      activeLanguages: s['activeLanguages'],
      baseCurrency: s['baseCurrency'],
      dateFormat: s['dateFormat'],
    };
  }

  private securityAudit(s: SettingsRow) {
    return {
      passwordMinLength: s['passwordMinLength'],
      loginFailureLimit: s['loginFailureLimit'],
      loginLockoutMinutes: s['loginLockoutMinutes'],
      sessionDurationMinutes: s['sessionDurationMinutes'],
    };
  }

  private toView(s: {
    organizationName: string;
    logoPath: string | null;
    timeZone: string;
    defaultLanguage: string;
    activeLanguages: string[];
    baseCurrency: string;
    dateFormat: string;
    passwordMinLength: number;
    loginFailureLimit: number;
    loginLockoutMinutes: number;
    sessionDurationMinutes: number;
    updatedAt: Date;
  }) {
    return {
      profile: {
        name: s.organizationName,
        logoPath: s.logoPath,
        timeZone: s.timeZone,
        defaultLanguage: s.defaultLanguage,
        activeLanguages: s.activeLanguages,
        baseCurrency: s.baseCurrency,
        dateFormat: s.dateFormat,
      },
      security: {
        passwordMinLength: s.passwordMinLength,
        loginFailureLimit: s.loginFailureLimit,
        loginLockoutMinutes: s.loginLockoutMinutes,
        sessionDurationMinutes: s.sessionDurationMinutes,
      },
      updatedAt: s.updatedAt,
    };
  }
}
