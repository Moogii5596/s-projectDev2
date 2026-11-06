import { Module } from '@nestjs/common';
import { CampCommonModule } from '../camp/common/camp-common.module';
import { CoreOrganizationsController } from './organizations/core-organizations.controller';
import { CoreOrganizationsService } from './organizations/core-organizations.service';
import { CoreFeedbackController } from './feedback/core-feedback.controller';
import { CoreFeedbackService } from './feedback/core-feedback.service';
import { CoreFeedbackAttachmentsService } from './feedback/core-feedback-attachments.service';
import { StorageModule } from '../../storage/storage.module';
import { ExchangeRatesController } from './exchange-rates/exchange-rates.controller';
import { ExchangeRatesService } from './exchange-rates/exchange-rates.service';

/**
 * Core — бүх модулийн суурь өгөгдөл: байгууллагууд (v0.2.2 H1, ADR-006). Хүснэгт `camp_organizations` (v0.3 хүртэл).
 * Ханш (v0.2.3 Блок 6б, V2-07) — `core_exchange_rates`.
 * Санал хүсэлт (v0.2.3 Блок F, FB-SYS-01a) — `core_feedback`; дэлгэцийн зураг (Блок 5) — `core_feedback_attachments`.
 */
@Module({
  imports: [CampCommonModule, StorageModule],
  controllers: [CoreOrganizationsController, CoreFeedbackController, ExchangeRatesController],
  providers: [CoreOrganizationsService, CoreFeedbackService, CoreFeedbackAttachmentsService, ExchangeRatesService],
  exports: [CoreOrganizationsService],
})
export class CoreModule {}
