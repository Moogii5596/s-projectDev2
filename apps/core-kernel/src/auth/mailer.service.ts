import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, Transporter } from 'nodemailer';
import type { MailContent } from './auth-mail';

/** Тест: transport орлуулах */
const MAIL_TRANSPORT = 'MAIL_TRANSPORT';

/**
 * v0.2.2 Блок 3 (D-04) — системийн имэйл (SMTP). `.env`: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM.
 * Тохируулаагүй бол идэвхгүй — урилга зөвхөн "линк хуулах"-аар. Нууц үгийг логт хэзээ ч бичихгүй.
 */
@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private transport: Transporter | null = null;

  constructor(
    private readonly config: ConfigService,
    @Optional() @Inject(MAIL_TRANSPORT) private readonly injected?: Pick<Transporter, 'sendMail'>,
  ) {}

  private get(k: string): string | undefined {
    const v = this.config?.get<string>(k) ?? process.env[k];
    return v && v.trim() ? v.trim() : undefined;
  }

  get from(): string | undefined {
    return this.get('SMTP_FROM') ?? this.get('SMTP_USER');
  }

  isEnabled(): boolean {
    return !!this.injected || !!(this.get('SMTP_HOST') && this.from);
  }

  private tx(): Pick<Transporter, 'sendMail'> {
    if (this.injected) return this.injected;
    if (!this.transport) {
      const port = Number(this.get('SMTP_PORT') ?? 587);
      const user = this.get('SMTP_USER');
      this.transport = createTransport({
        host: this.get('SMTP_HOST'),
        port,
        secure: port === 465,
        requireTLS: port !== 465 && port !== 25,
        auth: user ? { user, pass: this.get('SMTP_PASS') } : undefined,
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 20_000,
      });
    }
    return this.transport;
  }

  /** Амжилтгүй бол throw (дуудагч нь токеныг цуцлах/503) */
  async send(to: string, mail: MailContent): Promise<void> {
    if (!this.isEnabled()) throw new Error('SMTP тохируулаагүй');
    try {
      await this.tx().sendMail({ from: this.from, to, subject: mail.subject, text: mail.text, html: mail.html });
    } catch (err) {
      this.logger.error(`имэйл илгээх алдаа: ${(err as Error).message}`);
      throw err;
    }
  }
}
