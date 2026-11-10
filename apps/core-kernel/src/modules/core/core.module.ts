import { Module } from '@nestjs/common';
import { FeedModule } from '../feed/feed.module';
import { CampCommonModule } from '../camp/common/camp-common.module';
import { CoreOrganizationsController } from './organizations/core-organizations.controller';
import { CoreOrganizationsService } from './organizations/core-organizations.service';
import { CoreFeedbackController } from './feedback/core-feedback.controller';
import { CoreFeedbackService } from './feedback/core-feedback.service';
import { CoreFeedbackAttachmentsService } from './feedback/core-feedback-attachments.service';
import { StorageModule } from '../../storage/storage.module';
import { ExchangeRatesController } from './exchange-rates/exchange-rates.controller';
import { ExchangeRatesService } from './exchange-rates/exchange-rates.service';
import { CoreTenantSettingsController } from './settings/core-tenant-settings.controller';
import { CoreTenantSettingsService } from './settings/core-tenant-settings.service';
import { CoreTenantModulesController } from './modules/core-tenant-modules.controller';
import { CoreTenantModulesService } from './modules/core-tenant-modules.service';
import { EnvConfig } from '../../config/env.config';
import { CoreCalendarController } from './calendars/core-calendar.controller';
import { CoreCalendarService } from './calendars/core-calendar.service';
import { NotificationsController } from './notifications/notifications.controller';
import { NotificationService } from './notifications/notification.service';
import { NotificationTypeRegistry } from './notifications/notification-type.registry';
import { NotificationMailScheduler } from './notifications/notification-mail.scheduler';
import { CoreSitesController } from './sites/core-sites.controller';
import { CoreSitesService } from './sites/core-sites.service';
import { ApprovalsController } from './approvals/approvals.controller';
import { ApprovalsService } from './approvals/approvals.service';
import { ApprovalEngineService } from './approvals/approval-engine.service';
import { ApprovalEntityRegistry } from './approvals/approval-entity.registry';
import { ApprovalSlaScheduler } from './approvals/approval-sla.scheduler';
import { AttachmentsController } from './attachments/attachments.controller';
import { AttachmentsService } from './attachments/attachments.service';
import { AttachmentTypeRegistry } from './attachments/attachment-type.registry';
import { TENANT_LOGO_ATTACHMENT } from './attachments/tenant-logo.attachment';
import { DebugController } from './debug/debug.controller';
import { DebugService } from './debug/debug.service';
import { DebugAccessGuard } from './debug/debug-access.guard';
import { DataTransferRegistry } from './import-export/data-transfer.registry';
import { SequenceService } from './sequences/sequence.service';
import { ScheduledJobRegistry } from './scheduler/scheduled-job.registry';

/**
 * Core — бүх модулийн суурь өгөгдөл: байгууллагууд (v0.2.2 H1, ADR-006). Хүснэгт `camp_organizations` (v0.3 хүртэл).
 * Ханш (v0.2.3 Блок 6б, V2-07) — `core_exchange_rates`.
 * Санал хүсэлт (v0.2.3 Блок F, FB-SYS-01a) — `core_feedback`; дэлгэцийн зураг (Блок 5) — `core_feedback_attachments`.
 */
@Module({
  imports: [CampCommonModule, StorageModule, FeedModule],
  controllers: [CoreOrganizationsController, CoreFeedbackController, ExchangeRatesController, CoreTenantSettingsController, CoreTenantModulesController, CoreCalendarController, NotificationsController, ApprovalsController, CoreSitesController, AttachmentsController, DebugController],
  providers: [
    EnvConfig,
    CoreOrganizationsService,
    CoreFeedbackService,
    CoreFeedbackAttachmentsService,
    ExchangeRatesService,
    CoreTenantSettingsService,
    CoreTenantModulesService,
    CoreCalendarService,
    NotificationTypeRegistry,
    NotificationService,
    NotificationMailScheduler,
    ApprovalEntityRegistry,
    ApprovalEngineService,
    ApprovalsService,
    ApprovalSlaScheduler,
    CoreSitesService,
    AttachmentsService,
    {
      provide: AttachmentTypeRegistry,
      useFactory: () => {
        const registry = new AttachmentTypeRegistry();
        registry.register(TENANT_LOGO_ATTACHMENT);
        return registry;
      },
    },
    DebugService,
    DebugAccessGuard,
    DataTransferRegistry,
    SequenceService,
    ScheduledJobRegistry,
  ],
  exports: [CoreOrganizationsService, CoreTenantModulesService, NotificationService, NotificationTypeRegistry, ApprovalEngineService, ApprovalEntityRegistry, AttachmentsService, AttachmentTypeRegistry, DataTransferRegistry, SequenceService, ScheduledJobRegistry],
})
export class CoreModule {}
