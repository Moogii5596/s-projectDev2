import { HttpStatus, Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { randomBytes, randomUUID } from 'node:crypto';
import { UserRole } from '@prisma/client';
import { PrismaTenantClientService } from '../db/prisma-tenant-client.service';
import { inTenantTx } from '../db/tenant-tx';
import { AppError, badRequest, conflict } from '../common/i18n/app-error';
import { internalEmail } from './invite-token';

export interface CreateUserInput {
  tenantId: string;
  tenantSlug: string;
  /** null → дотоод `.login.invalid` хаяг (ADR-003 §2.2) */
  email: string | null;
  /** null → санамсаргүй, хэн ч мэдэхгүй нууц үг (урилгаар тавина) */
  password: string | null;
  fullName: string | null;
  role?: UserRole;
  locale?: string;
}

/**
 * v0.2.2 Блок 3 — Supabase Auth + core_users хэрэглэгч үүсгэх ГАНЦ газар (SEC-005 нэгтгэл: `register`, ажилтны картаас).
 * GoTrue-д үүсгээд DB-д бичнэ; DB амжилтгүй бол GoTrue хэрэглэгчийг буцааж устгана.
 */
@Injectable()
export class UserAdminService {
  private readonly logger = new Logger(UserAdminService.name);
  private client: SupabaseClient | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaTenantClientService,
    /** AuthService-ийн client-ийг хуваалцах (нэг client — тестийн mock ч нэг) */
    @Optional() @Inject('SUPABASE_ADMIN_CLIENT') client?: SupabaseClient,
  ) {
    this.client = client ?? null;
  }

  admin(): SupabaseClient {
    this.client ??= createClient(
      this.config?.get<string>('SUPABASE_URL') ?? process.env['SUPABASE_URL'] ?? 'https://mock.supabase.co',
      this.config?.get<string>('SUPABASE_SERVICE_ROLE_KEY') ?? process.env['SUPABASE_SERVICE_ROLE_KEY'] ?? 'mock-service-role-key',
      { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
    );
    return this.client;
  }

  async createUser(input: CreateUserInput) {
    const email = (input.email ?? internalEmail(randomUUID(), input.tenantSlug)).trim().toLowerCase();
    const password = input.password ?? `${randomBytes(24).toString('base64url')}!aA1`;
    const { data, error } = await this.admin().auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: input.fullName ?? '' },
    });
    if (error || !data.user) {
      const msg = (error?.message ?? '').toLowerCase();
      const code = (error as { code?: string } | null)?.code;
      if (code === 'email_exists' || msg.includes('already')) throw conflict('auth.user_exists');
      // 400/422: имэйлийн хэлбэр г.м. (`.invalid` домэйныг GoTrue хүлээж авах эсэх — CI/staging-д шалгана)
      if (error?.status === 400 || error?.status === 422) throw badRequest('auth.user_invalid', { reason: error.message.slice(0, 120) });
      this.logger.error(`GoTrue createUser алдаа: ${error?.message}`);
      throw new AppError(HttpStatus.SERVICE_UNAVAILABLE, 'auth.service_unavailable');
    }
    const authId = data.user.id;
    try {
      return await inTenantTx(this.prisma, input.tenantId, (tx) =>
        tx.coreUser.create({
          data: {
            tenantId: input.tenantId,
            authId,
            email,
            fullName: input.fullName,
            role: input.role ?? UserRole.REQUESTER,
            locale: input.locale ?? 'mn',
            mustChangePassword: false,
          },
          select: { id: true, authId: true, email: true, fullName: true, role: true, tenantId: true },
        }),
      );
    } catch (err) {
      await this.admin().auth.admin.deleteUser(authId).catch((e: Error) => this.logger.error(`GoTrue rollback алдаа: ${e.message}`));
      throw err;
    }
  }

  async setPassword(authId: string, password: string): Promise<void> {
    const { error } = await this.admin().auth.admin.updateUserById(authId, { password });
    if (error) {
      if (error.status === 422 || error.status === 400) throw new AppError(HttpStatus.BAD_REQUEST, 'auth.password_weak');
      this.logger.error(`updateUserById алдаа: ${error.message}`);
      throw new AppError(HttpStatus.SERVICE_UNAVAILABLE, 'auth.service_unavailable');
    }
  }
}
