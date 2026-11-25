import { Module } from '@nestjs/common';
import { PlatformModule } from '../../core/platform/platform.module';
import { SiteDataTransferScope } from './site-data-transfer.scope';

/**
 * Ажлын байр (кемп)-ийн хүрээтэй модулиудын (Кемп, HR) хуваалцах хэсэг. Эрх шалгах / audit нь цөмийн
 * `PlatformModule`-д (C1, 2026-11-25) — энд дахин экспортолно; нэмэлт: импорт/экспортын хүрээ (CORE-10).
 */
@Module({
  imports: [PlatformModule],
  providers: [SiteDataTransferScope],
  exports: [PlatformModule, SiteDataTransferScope],
})
export class CampCommonModule {}
