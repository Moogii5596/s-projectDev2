import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import Redis from 'ioredis';
import { CoreInviteChannel, CoreInvitePurpose } from '@prisma/client';
import { REDIS_CLIENT } from '../db/redis.module';
import { SystemPrismaService } from '../db/system-prisma.service';
import { PrismaTenantClientService } from '../db/prisma-tenant-client.service';
import { inTenantTx } from '../db/tenant-tx';
import { AppError, badRequest } from '../common/i18n/app-error';
import { TenantCacheService } from './tenant-cache.service';
import { SignInService } from './sign-in.service';
import { UserAdminService } from './user-admin.service';
import { MailerService } from './mailer.service';
import { mailLang, renderAuthMail } from './auth-mail';
import { parseLoginIdentifier } from './login-identifier';
import { INVITE_TTL_MS, RESET_TTL_MS, TOKEN_RE, generateToken, hashToken, isInternalEmail, loginHint } from './invite-token';

export interface CreatedInvite {
  inviteId: string;
  purpose: CoreInvitePurpose;
  channel: CoreInviteChannel;
  expiresAt: Date;
  /** LINK: `/invite/<token>` (админ хуулна). EMAIL: null (токен зөвхөн имэйлд) */
  path: string | null;
  /** PUBLIC_APP_URL тохируулсан бол бүтэн хаяг */
  url: string | null;
}

/** "Нууц үг мартсан": нэвтрэх нэрээр цагт 5, IP-ээр цагт 20 (бүх хүсэлт) */
export const FORGOT_LIMITS = { identifier: { limit: 5, ttlSec: 3600 }, ip: { limit: 20, ttlSec: 3600 } } as const;

/**
 * v0.2.2 Блок 3 (ADR-003 §2.3, D-03, D-04) — урилга / нууц үг сэргээх.
 * Токен = 32 байт, DB-д SHA-256 л; нэг удаа (атом UPDATE … WHERE used_at IS NULL); нэг хэрэглэгч × зорилгод идэвхтэй ганц.
 */
@Injectable()
export class InviteService {
  private readonly logger = new Logger(InviteService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaTenantClientService,
    private readonly system: SystemPrismaService,
    private readonly userAdmin: UserAdminService,
    private readonly mailer: MailerService,
    private readonly tenantCache: TenantCacheService,
    private readonly signIn: SignInService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  /** `PUBLIC_APP_URL` (ADR-005) — төгсгөлийн `/`-гүй; http(s) биш бол null */
  publicUrl(): string | null {
    const v = (this.config?.get<string>('PUBLIC_APP_URL') ?? process.env['PUBLIC_APP_URL'] ?? '').trim().replace(/\/+$/, '');
    return /^https?:\/\/[^\s/]+/.test(v) ? v : null;
  }

  options() {
    return { emailEnabled: this.mailer.isEnabled() && !!this.publicUrl(), publicUrl: this.publicUrl() };
  }

  async createInvite(p: { tenantId: string; userId: string; purpose: CoreInvitePurpose; channel: CoreInviteChannel; createdBy: string | null }): Promise<CreatedInvite> {
    const user = await inTenantTx(this.prisma, p.tenantId, (tx) =>
      tx.coreUser.findFirst({
        where: { id: p.userId, tenantId: p.tenantId },
        select: { id: true, email: true, fullName: true, locale: true, phone: true, username: true, isActive: true },
      }),
    );
    if (!user) throw badRequest('camp.err.rbac.5');
    if (!user.isActive) throw badRequest('camp.err.rbac.6');
    const base = this.publicUrl();
    if (p.channel === 'EMAIL') {
      if (isInternalEmail(user.email)) throw badRequest('auth.invite_no_email');
      if (!this.mailer.isEnabled()) throw badRequest('auth.mail_disabled');
      if (!base) throw badRequest('auth.public_url_missing');
    }

    const { token, hash } = generateToken();
    const expiresAt = new Date(Date.now() + (p.purpose === 'INVITE' ? INVITE_TTL_MS : RESET_TTL_MS));
    const row = await inTenantTx(this.prisma, p.tenantId, async (tx) => {
      // нэг хэрэглэгч × зорилгод идэвхтэй ганц токен
      await tx.coreUserInvite.updateMany({
        where: { tenantId: p.tenantId, userId: p.userId, purpose: p.purpose, usedAt: null, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return tx.coreUserInvite.create({
        data: { tenantId: p.tenantId, userId: p.userId, tokenHash: hash, purpose: p.purpose, channel: p.channel, expiresAt, createdBy: p.createdBy },
        select: { id: true },
      });
    });
    const path = `/${p.purpose === 'INVITE' ? 'invite' : 'reset'}/${token}`;
    const url = base ? `${base}${path}` : null;

    if (p.channel === 'EMAIL') {
      const mail = renderAuthMail(p.purpose === 'INVITE' ? 'invite' : 'reset', mailLang(user.locale), {
        name: user.fullName?.trim() || user.email,
        url: url!,
        login: loginHint(user),
        hours: INVITE_TTL_MS / 3600_000,
        minutes: RESET_TTL_MS / 60_000,
      });
      try {
        await this.mailer.send(user.email, mail);
      } catch {
        await inTenantTx(this.prisma, p.tenantId, (tx) => tx.coreUserInvite.update({ where: { id: row.id }, data: { revokedAt: new Date() } }));
        throw new AppError(HttpStatus.SERVICE_UNAVAILABLE, 'auth.mail_failed');
      }
      return { inviteId: row.id, purpose: p.purpose, channel: p.channel, expiresAt, path: null, url: null };
    }
    return { inviteId: row.id, purpose: p.purpose, channel: p.channel, expiresAt, path, url };
  }

  private async findByToken(token: string) {
    if (!TOKEN_RE.test(token)) return null;
    type Row = {
      id: string; tenant_id: string; user_id: string; purpose: CoreInvitePurpose; expires_at: Date; expired: boolean; used: boolean; revoked: boolean;
      auth_id: string; email: string; full_name: string | null; phone: string | null; username: string | null; is_active: boolean;
    };
    const rows = await this.system.$queryRaw<Row[]>`
      -- хугацаа / төлвийг DB-ийн цагаар (JS Date ↔ timestamptz хөрвүүлэлтээс хамаарахгүй)
      SELECT i.id, i.tenant_id, i.user_id, i.purpose, i.expires_at,
             (i.expires_at <= now()) AS expired, (i.used_at IS NOT NULL) AS used, (i.revoked_at IS NOT NULL) AS revoked,
             u.auth_id, u.email, u.full_name, u.phone, u.username, u.is_active
      FROM core_user_invites i JOIN core_users u ON u.tenant_id = i.tenant_id AND u.id = i.user_id
      WHERE i.token_hash = ${hashToken(token)} LIMIT 1`;
    return rows[0] ?? null;
  }

  /** GET /auth/invites/:token — нэвтрэлтгүй. Зөвхөн токен эзэмшигчид: нэр, нэвтрэх нэр */
  async inspect(token: string) {
    const r = await this.findByToken(token);
    if (!r || !r.is_active) return { valid: false as const, reason: 'invalid' as const };
    const state = r.used ? 'used' : r.revoked ? 'revoked' : r.expired ? 'expired' : 'ok';
    if (state !== 'ok') return { valid: false as const, reason: state };
    return {
      valid: true as const,
      purpose: r.purpose,
      expiresAt: r.expires_at,
      name: r.full_name,
      login: loginHint({ phone: r.phone, username: r.username, email: r.email }),
    };
  }

  /** POST /auth/invites/:token/accept — атомаар "ашигласан" болгоод нууц үг тавина; амжилтгүй бол буцаана */
  async accept(token: string, password: string) {
    if (!TOKEN_RE.test(token)) throw badRequest('auth.invite_invalid');
    const claimed = await this.system.$queryRaw<{ id: string; tenant_id: string; user_id: string }[]>`
      UPDATE core_user_invites SET used_at = now(), updated_at = now()
      WHERE token_hash = ${hashToken(token)} AND used_at IS NULL AND revoked_at IS NULL AND expires_at > now()
      RETURNING id, tenant_id, user_id`;
    const c = claimed[0];
    if (!c) throw badRequest('auth.invite_invalid');
    const users = await this.system.$queryRaw<{ auth_id: string; email: string; phone: string | null; username: string | null; is_active: boolean }[]>`
      SELECT auth_id, email, phone, username, is_active FROM core_users WHERE tenant_id = ${c.tenant_id}::uuid AND id = ${c.user_id}::uuid`;
    const u = users[0];
    if (!u || !u.is_active) throw badRequest('auth.invite_invalid');
    try {
      await this.userAdmin.setPassword(u.auth_id, password);
    } catch (err) {
      await this.system.$executeRaw`UPDATE core_user_invites SET used_at = NULL, updated_at = now() WHERE id = ${c.id}::uuid`;
      throw err;
    }
    await this.system.$executeRaw`
      UPDATE core_users SET must_change_password = false, updated_at = now() WHERE tenant_id = ${c.tenant_id}::uuid AND id = ${c.user_id}::uuid`;
    // бусад идэвхтэй токен (урилга / reset) цуцлагдана
    await this.system.$executeRaw`
      UPDATE core_user_invites SET revoked_at = now(), updated_at = now()
      WHERE tenant_id = ${c.tenant_id}::uuid AND user_id = ${c.user_id}::uuid AND id <> ${c.id}::uuid AND used_at IS NULL AND revoked_at IS NULL`;
    await this.tenantCache.invalidateMember(c.tenant_id, u.auth_id);
    return { done: true as const, login: loginHint(u) };
  }

  private async hit(key: string, ttlSec: number): Promise<number> {
    try {
      const n = await this.redis.incr(key);
      if (n === 1) await this.redis.pexpire(key, ttlSec * 1000);
      return n;
    } catch (err) {
      this.logger.warn(`forgot limiter Redis алдаа — fail-open: ${(err as Error).message}`);
      return 0;
    }
  }

  /**
   * POST /auth/forgot-password — нэвтрэлтгүй. Хариу ҮРГЭЛЖ ижил (хэрэглэгч байгаа эсэх, имэйлтэй эсэхийг задруулахгүй).
   * Жинхэнэ имэйлтэй + SMTP + PUBLIC_APP_URL бол reset линк илгээнэ (арын горимд — хугацаагаар ч задрахгүй).
   */
  async forgot(host: string | undefined, clientIp: string | undefined, identifier: string): Promise<{ ok: true }> {
    const parsed = parseLoginIdentifier(identifier);
    const key = parsed?.value ?? identifier.trim().toLowerCase();
    const h = (v: string) => createHash('sha256').update(v).digest('hex').slice(0, 32);
    const byId = await this.hit(`forgot:id:${h(key)}`, FORGOT_LIMITS.identifier.ttlSec);
    const byIp = clientIp ? await this.hit(`forgot:ip:${h(clientIp)}`, FORGOT_LIMITS.ip.ttlSec) : 0;
    if (byId > FORGOT_LIMITS.identifier.limit || byIp > FORGOT_LIMITS.ip.limit) {
      throw new AppError(HttpStatus.TOO_MANY_REQUESTS, 'auth.too_many_attempts');
    }
    const tenantId = await this.signIn.tenantIdFromHost(host);
    if (!tenantId || !parsed || !this.options().emailEnabled) return { ok: true };
    void this.sendReset(tenantId, parsed).catch((e: Error) => this.logger.warn(`reset илгээгээгүй: ${e.message}`));
    return { ok: true };
  }

  private async sendReset(tenantId: string, parsed: NonNullable<ReturnType<typeof parseLoginIdentifier>>) {
    const found = await this.signIn.findLoginUser(tenantId, parsed);
    if (!found || isInternalEmail(found.email)) return;
    const rows = await this.system.$queryRaw<{ id: string }[]>`
      SELECT id FROM core_users WHERE tenant_id = ${tenantId}::uuid AND auth_id = ${found.authId}::uuid AND is_active LIMIT 1`;
    if (!rows[0]) return;
    await this.createInvite({ tenantId, userId: rows[0].id, purpose: 'RESET', channel: 'EMAIL', createdBy: null });
  }
}
