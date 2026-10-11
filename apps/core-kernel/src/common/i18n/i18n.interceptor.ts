import { CallHandler, ExecutionContext, Injectable, NestInterceptor, Optional } from '@nestjs/common';
import { from, Observable, switchMap } from 'rxjs';
import { I18nContext, i18nStorage, parseAcceptLanguage } from './i18n-context';

/** Байгууллагын орчуулгын засварыг ачаалагч (§0.7 I18nOverridesService) — алга бол зөвхөн кодын анхдагч */
export abstract class I18nOverridesLoader {
  abstract load(tenantId: string): Promise<ReadonlyMap<string, string>>;
}

/**
 * Хүсэлт бүрийг хэлний контекстоор ороох (APP_INTERCEPTOR). Хэл = Accept-Language; tenant тодорхой бол
 * байгууллагын засварыг (≤60с cache) ачаална. Сервис, AppError нь `t()`-г синхрон дуудна.
 */
@Injectable()
export class I18nInterceptor implements NestInterceptor {
  constructor(@Optional() private readonly overrides?: I18nOverridesLoader) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const req = context.switchToHttp().getRequest<{ headers: Record<string, string | string[] | undefined>; user?: { tenantId?: string } }>();
    const lang = parseAcceptLanguage(req.headers['accept-language']);
    const tenantId = req.user?.tenantId;
    const load = tenantId && this.overrides ? this.overrides.load(tenantId).catch(() => undefined) : Promise.resolve(undefined);
    return from(load).pipe(
      switchMap(
        (overrides) =>
          new Observable<unknown>((observer) => {
            const ctx: I18nContext = { lang, overrides };
            i18nStorage.run(ctx, () => {
              next.handle().subscribe({
                next: (v) => observer.next(v),
                error: (e) => observer.error(e),
                complete: () => observer.complete(),
              });
            });
          }),
      ),
    );
  }
}
