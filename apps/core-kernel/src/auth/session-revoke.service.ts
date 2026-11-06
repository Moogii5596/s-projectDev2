import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { SystemPrismaService } from '../db/system-prisma.service';
import { AppError } from '../common/i18n/app-error';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Нэвтэрсэн төхөөрөмж (GoTrue `auth.sessions` мөр) */
export interface DeviceSession {
  id: string;
  /** Энэ хүсэлтийг илгээж буй төхөөрөмж */
  current: boolean;
  userAgent: string | null;
  ip: string | null;
  createdAt: string | null;
  /** refreshed_at → updated_at → created_at */
  lastActiveAt: string | null;
}

/**
 * v0.2.3 Блок 4б (PIL-15) — нэвтэрсэн төхөөрөмжүүд (GoTrue session) харах, цуцлах.
 *
 * - Хэрэглэгч өөрөө «Нэвтэрсэн төхөөрөмжүүд» дэлгэцээс бусад төхөөрөмжөө гаргана (`revokeOne` / `revokeOthers`).
 * - Нууц үг СОЛИХОД session цуцлахгүй (D-1) боловч GoTrue өөрөө дуудагчаас бусдыг устгадаг (OPS-013) —
 *   тиймээс `SignInService.changePassword` хэрэглэгчийн өөрийн токеноор солино.
 * - Урилга хүлээн авах / сэргээх (`accept`) → `revokeAll` (D-2).
 * - `auth.sessions`-ийг `to_jsonb` — GoTrue-ийн хувилбараас хамаарч багана (user_agent, ip, refreshed_at) байхгүй байж болно.
 */
@Injectable()
export class SessionRevokeService {
  private readonly logger = new Logger(SessionRevokeService.name);

  constructor(private readonly system: SystemPrismaService) {}

  /** `Authorization: Bearer <jwt>` → jwt */
  static bearerToken(authorization: string | null | undefined): string | null {
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
    return token.length > 0 ? token : null;
  }

  /** JWT payload-ийн `session_id` (uuid). Баталгаажуулалт хийхгүй — TenantAuthGuard аль хэдийн шалгасан. */
  static sessionIdFromJwt(jwt: string | null | undefined): string | null {
    const part = jwt?.split('.')[1];
    if (!part) return null;
    try {
      const payload = JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as { session_id?: unknown };
      return typeof payload.session_id === 'string' && UUID_RE.test(payload.session_id) ? payload.session_id : null;
    } catch {
      return null;
    }
  }

  static sessionIdFromAuthHeader(authorization: string | null | undefined): string | null {
    return SessionRevokeService.sessionIdFromJwt(SessionRevokeService.bearerToken(authorization));
  }

  /** Хэрэглэгчийн бүх төхөөрөмж; сүүлд ашигласан нь эхэнд */
  async list(authId: string, currentSessionId: string | null): Promise<DeviceSession[]> {
    if (!UUID_RE.test(authId)) return [];
    const rows = await this.system.$queryRaw<{ r: Record<string, unknown> }[]>`
      SELECT to_jsonb(s) AS r FROM auth.sessions s WHERE s.user_id = ${authId}::uuid`;
    const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
    return rows
      .map(({ r }) => {
        const createdAt = str(r['created_at']);
        return {
          id: String(r['id']),
          current: currentSessionId !== null && r['id'] === currentSessionId,
          userAgent: str(r['user_agent']),
          ip: str(r['ip']),
          createdAt,
          lastActiveAt: str(r['refreshed_at']) ?? str(r['updated_at']) ?? createdAt,
        };
      })
      .sort((a, b) => (b.lastActiveAt ?? '').localeCompare(a.lastActiveAt ?? ''));
  }

  /** Нэг төхөөрөмжийг гаргана. Одоогийн төхөөрөмж → 400; олдохгүй / өөр хүний → 404. DB алдаа → 503. */
  async revokeOne(authId: string, sessionId: string, currentSessionId: string | null): Promise<void> {
    if (!UUID_RE.test(authId) || !UUID_RE.test(sessionId)) throw new AppError(HttpStatus.NOT_FOUND, 'auth.session_not_found');
    if (currentSessionId !== null && sessionId === currentSessionId) throw new AppError(HttpStatus.BAD_REQUEST, 'auth.session_current');
    const n = await this.deleteSessions(authId, { only: sessionId });
    if (n === 0) throw new AppError(HttpStatus.NOT_FOUND, 'auth.session_not_found');
  }

  /** Одоогийнхоос бусад бүх төхөөрөмжийг гаргана; устсан тоог буцаана. DB алдаа → 503. */
  async revokeOthers(authId: string, currentSessionId: string | null): Promise<number> {
    if (!UUID_RE.test(authId)) return 0;
    return this.deleteSessions(authId, { except: currentSessionId });
  }

  /** Бүх session (урилга / сэргээлт хүлээн авсан). Нэвтрэлтийг зогсоохгүй — алдаа зөвхөн log. */
  async revokeAll(authId: string): Promise<void> {
    if (!UUID_RE.test(authId)) return;
    try {
      await this.deleteSessions(authId, {});
    } catch (err) {
      this.logger.warn(`revokeAll алдаа — authId=${authId}: ${(err as Error).message}`);
    }
  }

  /** Нэг session-ыг чимээгүй устгана (нууц үг солих үеийн шалгалтын нэмэлт session). Алдаа → log. */
  async dropQuietly(authId: string, sessionId: string | null): Promise<void> {
    if (!sessionId) return;
    try {
      await this.deleteSessions(authId, { only: sessionId });
    } catch (err) {
      this.logger.warn(`session устгах алдаа — authId=${authId}: ${(err as Error).message}`);
    }
  }

  private async deleteSessions(authId: string, opts: { only?: string; except?: string | null }): Promise<number> {
    const only = opts.only && UUID_RE.test(opts.only) ? opts.only : null;
    const except = opts.except && UUID_RE.test(opts.except) ? opts.except : null;
    let deleted: { id: string }[];
    try {
      deleted = await this.system.$queryRaw<{ id: string }[]>`
        DELETE FROM auth.sessions
        WHERE user_id = ${authId}::uuid
          AND (${only}::uuid IS NULL OR id = ${only}::uuid)
          AND (${except}::uuid IS NULL OR id <> ${except}::uuid)
        RETURNING id::text AS id`;
    } catch (err) {
      this.logger.error(`auth.sessions устгах алдаа — authId=${authId}: ${(err as Error).message}`);
      throw new AppError(HttpStatus.SERVICE_UNAVAILABLE, 'auth.service_unavailable');
    }
    // GoTrue FK нь CASCADE; session-гүй үлдсэн refresh token байвал цэвэрлэнэ — алдаа зогсоохгүй
    try {
      await this.system.$executeRaw`
        DELETE FROM auth.refresh_tokens
        WHERE user_id = ${authId}
          AND session_id IS NOT NULL
          AND session_id NOT IN (SELECT id FROM auth.sessions)`;
    } catch (err) {
      this.logger.warn(`refresh token цэвэрлэгээ алдаа — authId=${authId}: ${(err as Error).message}`);
    }
    return deleted.length;
  }
}
