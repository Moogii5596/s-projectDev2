import { Global, Module } from '@nestjs/common';
import { I18nInterceptor, I18nOverridesLoader } from './i18n.interceptor';
import { I18nOverridesService } from './i18n-overrides.service';
import { I18nController } from './i18n.controller';

/** v0.2.0 §0.7 — олон хэл (global). APP_INTERCEPTOR-ийг AppModule-д useExisting-ээр (RULE-07). */
@Global()
@Module({
  controllers: [I18nController],
  providers: [
    I18nOverridesService,
    { provide: I18nOverridesLoader, useExisting: I18nOverridesService },
    I18nInterceptor,
  ],
  exports: [I18nInterceptor, I18nOverridesService],
})
export class I18nModule {}
