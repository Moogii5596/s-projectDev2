import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { SystemPrismaService } from '../../../db/system-prisma.service';
import { MailerService } from '../../../auth/mailer.service';
import { isInternalEmail } from '../../../auth/invite-token';
import { mailLang } from '../../../auth/auth-mail';
import { I18nOverridesService } from '../../../common/i18n/i18n-overrides.service';
import { i18nStorage } from '../../../common/i18n/i18n-context';
import type { I18nParams } from '../../../common/i18n/translate';
import { renderNotificationMail } from './notification-mail';
import { ScheduledJobRegistry } from '../scheduler/scheduled-job.registry';

const BATCH = 20;
const MAX_ATTEMPTS = 5;
/** Барьсан мөрийг бусад instance дахин авахгүй байх хугацаа (илгээлт дуусахаас өмнө process унтарвал дахин оролдоно) */
const CLAIM_MS = 5 * 60_000;

interface ClaimedRow {
  id: string;
  tenant_id: string;
  title_key: string;
  body_key: string | null;
  params: unknown;
  link: string | null;
  email_attempts: number;
  email: string;
  locale: string | null;
  is_active: boolean;
}

/**
 * v0.2.4 Блок 7 (NTF-01) — мэдэгдлийн имэйл илгээгч (минут бүр).
 *   - `FOR UPDATE SKIP LOCKED` + email_next_at-аар барьж авна (олон instance давхар илгээхгүй)
 *   - SMTP тохируулаагүй / дотоод (.invalid) хаяг / идэвхгүй хэрэглэгч → SKIPPED
 *   - алдаа → дахин оролдлого (1, 2, 4, 8 мин …), MAX_ATTEMPTS-ийн дараа FAILED
 *   - `NOTIFICATION_MAIL_CRON=off` → cron алгасна (integration тест `sendPending()`-ийг шууд дуудна)
 */
@Injectable()
export class NotificationMailScheduler {
  private readonly logger = new Logger(NotificationMailScheduler.name);

  constructor(
    private readonly prisma: SystemPrismaService,
    private readonly mailer: MailerService,
    private readonly overrides: I18nOverridesService,
    private readonly jobs: ScheduledJobRegistry,
    private readonly config?: ConfigService,
  ) {
    this.jobs.register({ id: 'notification-mail', module: 'core', cron: '0 * * * * *' });
  }

  @Cron('0 * * * * *', { name: 'notification-mail' })
  async onTick(): Promise<void> {
    if (this.config?.get<string>('NOTIFICATION_MAIL_CRON')?.trim().toLowerCase() === 'off') return;
    await this.jobs.run('notification-mail', async () => {
      try {
        return await this.sendPending();
      } catch (err) {
        this.logger.error(`Мэдэгдлийн имэйл: ${(err as Error).message}`);
        throw err;
      }
    });
  }

  async sendPending(): Promise<{ sent: number; skipped: number; failed: number }> {
    const rows = await this.prisma.$queryRaw<ClaimedRow[]>`
      WITH picked AS (
        SELECT n.id FROM core_notifications n
        WHERE n.email_status = 'PENDING' AND (n.email_next_at IS NULL OR n.email_next_at <= now())
        ORDER BY n.created_at
        LIMIT ${BATCH}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE core_notifications n
      SET email_next_at = now() + (${CLAIM_MS}::int * interval '1 millisecond')
      FROM picked, core_users u
      WHERE n.id = picked.id AND u.tenant_id = n.tenant_id AND u.id = n.user_id
      RETURNING n.id::text AS id, n.tenant_id::text AS tenant_id, n.title_key, n.body_key, n.params, n.link,
                n.email_attempts, u.email, u.locale, u.is_active`;

    const stats = { sent: 0, skipped: 0, failed: 0 };
    const base = this.publicUrl();
    for (const row of rows) {
      if (!this.mailer.isEnabled() || !row.is_active || !row.email || isInternalEmail(row.email)) {
        await this.finish(row.id, 'SKIPPED', null);
        stats.skipped += 1;
        continue;
      }
      try {
        const map = await this.overrides.load(row.tenant_id);
        const lang = mailLang(row.locale);
        const params = (row.params && typeof row.params === 'object' && !Array.isArray(row.params) ? row.params : {}) as I18nParams;
        const mail = i18nStorage.run({ lang, overrides: map }, () =>
          renderNotificationMail(lang, { titleKey: row.title_key, bodyKey: row.body_key, params, url: base && row.link ? `${base}${row.link}` : null }),
        );
        await this.mailer.send(row.email, mail);
        await this.finish(row.id, 'SENT', null);
        stats.sent += 1;
      } catch (err) {
        const attempts = row.email_attempts + 1;
        const message = (err as Error).message.slice(0, 500);
        if (attempts >= MAX_ATTEMPTS) {
          await this.finish(row.id, 'FAILED', message, attempts);
          stats.failed += 1;
        } else {
          const delayMs = 60_000 * 2 ** (attempts - 1);
          await this.prisma.$executeRaw`
            UPDATE core_notifications
            SET email_attempts = ${attempts}, email_error = ${message},
                email_next_at = now() + (${delayMs}::int * interval '1 millisecond')
            WHERE id = ${row.id}::uuid`;
        }
        this.logger.warn(`Мэдэгдлийн имэйл амжилтгүй (оролдлого ${attempts}): ${message}`);
      }
    }
    return stats;
  }

  private async finish(id: string, status: 'SENT' | 'SKIPPED' | 'FAILED', error: string | null, attempts?: number) {
    await this.prisma.$executeRaw`
      UPDATE core_notifications
      SET email_status = ${status}, email_error = ${error}, email_next_at = NULL,
          email_attempts = COALESCE(${attempts ?? null}::smallint, email_attempts)
      WHERE id = ${id}::uuid`;
  }

  private publicUrl(): string | null {
    const v = (this.config?.get<string>('PUBLIC_APP_URL') ?? process.env['PUBLIC_APP_URL'] ?? '').trim().replace(/\/+$/, '');
    return /^https?:\/\//.test(v) ? v : null;
  }
}
