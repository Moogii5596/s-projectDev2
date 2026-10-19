import { Module } from '@nestjs/common';
import { CampCommonModule } from '../camp/common/camp-common.module';
import { CoreOrganizationsController } from './organizations/core-organizations.controller';
import { CoreOrganizationsService } from './organizations/core-organizations.service';
import { CoreFeedbackController } from './feedback/core-feedback.controller';
import { CoreFeedbackService } from './feedback/core-feedback.service';

/**
 * Core — бүх модулийн суурь өгөгдөл: байгууллагууд (v0.2.2 H1, ADR-006). Хүснэгт `camp_organizations` (v0.3 хүртэл).
 * Санал хүсэлт (v0.2.3 Блок F, FB-SYS-01a) — `core_feedback`.
 */
@Module({
  imports: [CampCommonModule],
  controllers: [CoreOrganizationsController, CoreFeedbackController],
  providers: [CoreOrganizationsService, CoreFeedbackService],
  exports: [CoreOrganizationsService],
})
export class CoreModule {}
