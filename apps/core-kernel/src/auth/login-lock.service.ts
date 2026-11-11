import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SystemPrismaService } from '../db/system-prisma.service';

/** Бүртгэлийн түгжээний дүрэм (env-ээр; анхдагч = v0.2.1 PIL-07 hook-ийнх) */
export interface LoginLockRules {
  /** Цонхны доторх буруу оролдлогын тоо → түгжинэ */
  maxFailures: number;
  /** Буруу оролдлого тоолох цонх (минут) */
  windowMinutes: number;
  /** Түгжих хугацаа (минут) */
  lockMinutes: number;
  /**
   * true = GoTrue-ийн `password_verification_attempt` hook (self-hosted, `deploy/*\/supabase/config.toml`) асаалттай:
   * буруу оролдлогыг hook тоолно — NestJS дахин тоолохгүй (давхар тоолохгүй). Шалгах, тэглэх нь хэвээр.
   */
  gotrueHook: boolean;
}

export const DEFAULT_LOGIN_LOCK_RULES: LoginLockRules = { maxFailures: 5, windowMinutes: 15, lockMinutes: 15, gotrueHook: false };

export interface LoginLockStatus {
  locked: boolean;
  lockedUntil: string | null;
  failedCount: number;
}

const intEnv = (raw: string | undefined, fallback: number, min: number, max: number): number => {
  const n = Number(raw);
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
};

export function parseLoginLockRules(get: (k: string) => string | undefined): LoginLockRules {
  const d = DEFAULT_LOGIN_LOCK_RULES;
  return {
    maxFailures: intEnv(get('AUTH_LOCK_MAX_FAILURES'), d.maxFailures, 1, 100),
    windowMinutes: intEnv(get('AUTH_LOCK_WINDOW_MINUTES'), d.windowMinutes, 1, 24 * 60),
    lockMinutes: intEnv(get('AUTH_LOCK_DURATION_MINUTES'), d.lockMinutes, 1, 24 * 60),
    gotrueHook: get('AUTH_LOCK_GOTRUE_HOOK') === 'true',
  };
}

/** Түгжээ дуусах хүртэлх минут (дээш тоймлоно, min 1) */
export const minutesUntil = (until: Date, now = Date.now()): number => Math.max(1, Math.ceil((until.getTime() - now) / 60_000));

/**
 * v0.2.5 H1 (#16) — бүртгэл (auth.users) тус бүрийн нууц үгийн түгжээ NestJS-д.
 * Supabase Cloud-ийн үнэгүй багцад GoTrue-ийн password hook байхгүй тул дүрмийг энд хэрэгжүүлнэ.
 * Төлөв = `auth_guard.password_failures` (migration 20261012006) — SYSTEM холболтоор л (app_user-д эрхгүй).
 * Tenant-аас хамааралгүй: нэг бүртгэл = нэг тоолуур.
 */
@Injectable()
export class LoginLockService {
  private readonly logger = new Logger(LoginLockService.name);
  readonly rules: LoginLockRules;

  constructor(
    private readonly system: SystemPrismaService,
    @Optional() config?: ConfigService,
  ) {
    this.rules = parseLoginLockRules((k) => config?.get<string>(k) ?? process.env[k]);
  }

  /** Идэвхтэй түгжээ → дуусах хугацаа, үгүй бол null */
  async lockedUntil(authId: string): Promise<Date | null> {
    const rows = await this.system.$queryRaw<{ locked_until: Date }[]>`
      SELECT locked_until FROM auth_guard.password_failures
      WHERE user_id = ${authId}::uuid AND locked_until > now()`;
    return rows[0]?.locked_until ?? null;
  }

  /**
   * Буруу оролдлого тоолох (нэг атомар statement). Идэвхтэй түгжээг өөрчлөхгүй (зэрэг хүсэлт түгжээг тэглэхгүй);
   * цонх эсвэл хуучин түгжээ дууссан бол 1-ээс. Буцаах = идэвхтэй түгжээний дуусах хугацаа эсвэл null.
   */
  async recordFailure(authId: string): Promise<Date | null> {
    const { maxFailures, windowMinutes, lockMinutes } = this.rules;
    // fresh = шинэ цонх (хуучин түгжээ эсвэл цонх дууссан) → тоолуур 1-ээс
    const rows = await this.system.$queryRaw<{ locked_until: Date | null }[]>`
      INSERT INTO auth_guard.password_failures AS f (user_id, failed_count, window_start, locked_until)
      VALUES (${authId}::uuid, 1, now(),
              CASE WHEN 1 >= ${maxFailures}::int THEN now() + make_interval(mins => ${lockMinutes}::int) END)
      ON CONFLICT (user_id) DO UPDATE SET
        failed_count = CASE
          WHEN f.locked_until > now() THEN f.failed_count
          WHEN f.locked_until IS NOT NULL OR f.window_start < now() - make_interval(mins => ${windowMinutes}::int) THEN 1
          ELSE f.failed_count + 1 END,
        window_start = CASE
          WHEN f.locked_until > now() THEN f.window_start
          WHEN f.locked_until IS NOT NULL OR f.window_start < now() - make_interval(mins => ${windowMinutes}::int) THEN now()
          ELSE f.window_start END,
        locked_until = CASE
          WHEN f.locked_until > now() THEN f.locked_until
          WHEN (CASE WHEN f.locked_until IS NOT NULL OR f.window_start < now() - make_interval(mins => ${windowMinutes}::int)
                     THEN 1 ELSE f.failed_count + 1 END) >= ${maxFailures}::int
            THEN now() + make_interval(mins => ${lockMinutes}::int)
          ELSE NULL END
      RETURNING locked_until`;
    const until = rows[0]?.locked_until ?? null;
    return until && until.getTime() > Date.now() ? until : null;
  }

  /** Зөв нэвтэрсэн → тоолуур тэглэнэ (алдаа → log; нэвтрэлтийг зогсоохгүй) */
  async reset(authId: string): Promise<void> {
    try {
      await this.system.$executeRaw`DELETE FROM auth_guard.password_failures WHERE user_id = ${authId}::uuid`;
    } catch (err) {
      this.logger.warn(`login lock тэглэхэд алдаа: ${(err as Error).message}`);
    }
  }

  /** Debug: төлөв */
  async status(authId: string): Promise<LoginLockStatus> {
    const rows = await this.system.$queryRaw<{ failed_count: number; window_start: Date; locked_until: Date | null }[]>`
      SELECT failed_count, window_start, locked_until FROM auth_guard.password_failures WHERE user_id = ${authId}::uuid`;
    const r = rows[0];
    if (!r) return { locked: false, lockedUntil: null, failedCount: 0 };
    const locked = !!r.locked_until && r.locked_until.getTime() > Date.now();
    const windowOpen = r.window_start.getTime() > Date.now() - this.rules.windowMinutes * 60_000;
    return {
      locked,
      lockedUntil: locked ? r.locked_until!.toISOString() : null,
      failedCount: locked || (windowOpen && !r.locked_until) ? r.failed_count : 0,
    };
  }

  /** Debug: түгжээ тайлах (тоолуур устгана). Буцаах = өмнө нь түгжээтэй байсан эсэх */
  async unlock(authId: string): Promise<{ wasLocked: boolean }> {
    const rows = await this.system.$queryRaw<{ locked_until: Date | null }[]>`
      DELETE FROM auth_guard.password_failures WHERE user_id = ${authId}::uuid RETURNING locked_until`;
    const until = rows[0]?.locked_until;
    return { wasLocked: !!until && until.getTime() > Date.now() };
  }
}
