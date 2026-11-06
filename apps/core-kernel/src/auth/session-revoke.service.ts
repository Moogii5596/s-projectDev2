import { Injectable, Logger } from '@nestjs/common';
import { SystemPrismaService } from '../db/system-prisma.service';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * v0.2.3 Блок 4 (PIL-15) — нууц үг солих / урилгыг хүлээн авахад GoTrue session-уудыг цуцлах.
 *
 * - `auth.sessions`-igi системийн холболтоор шууд устгана. Refresh token-ууд session-гүй болж
 *   цааш сэргэх боломжгүй.
 * - NB: GoTrue `admin.updateUserById({password})` өөрөө бүх session-ыг устгадаг (баталсан —
 *   DELETE 0 мөр-impact: мөрүүд аль хэдийн байхгүй байсан). `keepSessionId`-г хамгаалалтын байдлаар
 *   хадгална; одоогийн access token JWT нь хугацаа дуусахад validity-ээ алдана (guard session биш JWT шалгана).
 * - DB алдаа (жишээ нь auth schema-гүй орчин) → зөвхөн log, нэвтрэх / нууц үг солихыг битгий зогсооно.
 */
@Injectable()
export class SessionRevokeService {
  private readonly logger = new Logger(SessionRevokeService.name);

  constructor(private readonly system: SystemPrismaService) {}

  /**
   * `Authorization: Bearer <jwt>` → JWT payload-ийн `session_id` (uuid).
   * Баталгаажуулалт хийгэхгүй — TenantAuthGuard аль хэдийн `auth.getUser`-аар шалгасан.
   */
  static sessionIdFromAuthHeader(authorization: string | null | undefined): string | null {
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
    const part = token.split('.')[1];
    if (!part) return null;
    try {
      const payload = JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as { session_id?: unknown };
      return typeof payload.session_id === 'string' && UUID_RE.test(payload.session_id) ? payload.session_id : null;
    } catch {
      return null;
    }
  }

  /** `keepSessionId`-ээс бусад бүх session-ыг устгана; null бол бүгд */
  async revokeOthers(authId: string, keepSessionId: string | null): Promise<void> {
    await this.revoke(authId, keepSessionId);
  }

  /** Хэрэглэгчийн бүх session-ыг устгана (урилга / reset хүлээн авсан) */
  async revokeAll(authId: string): Promise<void> {
    await this.revoke(authId, null);
  }

  private async revoke(authId: string, keepSessionId: string | null): Promise<void> {
    if (!UUID_RE.test(authId)) return;
    const keep = keepSessionId && UUID_RE.test(keepSessionId) ? keepSessionId : null;
    try {
      await this.system.$executeRaw`
        DELETE FROM auth.sessions
        WHERE user_id = ${authId}::uuid
          AND (${keep}::uuid IS NULL OR id <> ${keep}::uuid)`;
    } catch (err) {
      this.logger.warn(`session цуцлах (auth.sessions) алдаа — authId=${authId}: ${(err as Error).message}`);
      return;
    }
    // Хоёрдогч цэвэрлэгээ: session-гүй болсон refresh token-уудыг устгана — алдаа зогсоохгүй
    try {
      await this.system.$executeRaw`
        DELETE FROM auth.refresh_tokens
        WHERE user_id = ${authId}
          AND session_id NOT IN (SELECT id FROM auth.sessions)`;
    } catch (err) {
      this.logger.warn(`refresh token цэвэрлэгээ алдаа — authId=${authId}: ${(err as Error).message}`);
    }
  }
}
