import { Module } from '@nestjs/common';
import { CampCommonModule } from './common/camp-common.module';
import { CoreModule } from '../core/core.module';
import { HrModule } from '../hr/hr.module';
import { CAMP_HR_LEGACY_CONTROLLERS } from './legacy/hr-legacy.controller';
import { CampHrBridge } from './camp-hr.bridge';
import { CampStayStore, CampStaysService } from './attendance/camp-stays.service';
import { CampAuditController } from './audit/camp-audit.controller';
import { CampRbacController } from './rbac/camp-rbac.controller';
import { CampRbacService } from './rbac/camp-rbac.service';
import { CampEmployeeLoginService } from './rbac/camp-employee-login.service';
import { CampUserAccessService } from './rbac/camp-user-access.service';
import { CampSettingsController } from './settings/camp-settings.controller';
import { CampSettingsService } from './settings/camp-settings.service';
import { CampMasterController, CampsController } from './master/camp-master.controller';
import { CampsService } from './master/camps.service';
import { CampFacilitiesService } from './master/camp-facilities.service';
import { CampAttendanceController } from './attendance/camp-attendance.controller';
import { CampRoomsService } from './attendance/camp-rooms.service';
import { CampPresenceService } from './attendance/camp-presence.service';
import { CampAssetCategoriesController, CampAssetsController } from './assets/camp-assets.controller';
import { CampAssetsService } from './assets/camp-assets.service';
import { CampMaintenanceController } from './maintenance/camp-maintenance.controller';
import { CampMaintenanceService } from './maintenance/camp-maintenance.service';

/**
 * Camp Module — Шат 2 (эрх, тохиргоо, мастер өгөгдөл), Шат 3 (ирц, ээлж, өрөө, хоолны суурь тоо),
 * Шат 4 (үндсэн хөрөнгө, засвар + сэлбэгийн зардал). DatabaseModule, AppCacheModule нь global.
 * Guard/interceptor нь APP_GUARD-аар (RULE-07) — controller-д decorator хэрэггүй.
 * v0.2.2 H1 (ADR-006): ажилтан/хэлтэс/бригад/албан тушаал/ирц/импорт → `HrModule`, байгууллага → `CoreModule`.
 * Кемп HR-ийг ашиглана; хуучин `/camp/...` HR замууд `legacy/` (нэг хувилбар), байрлалт/rooms экспорт → `CampHrBridge`.
 */
import { CampBuildingTypesController, CampPositionSettingsController } from './catalog/camp-catalog.controller';
import { CampCatalogService } from './catalog/camp-catalog.service';

@Module({
  imports: [CampCommonModule, CoreModule, HrModule],
  controllers: [
    CampBuildingTypesController,
    CampPositionSettingsController,
    CampRbacController,
    CampSettingsController,
    CampsController,
    CampMasterController,
    CampAttendanceController,
    CampAssetCategoriesController,
    CampAssetsController,
    CampMaintenanceController,
    CampAuditController,
    ...CAMP_HR_LEGACY_CONTROLLERS,
  ],
  providers: [
    CampCatalogService,
    CampRbacService,
    CampEmployeeLoginService,
    CampUserAccessService,
    CampSettingsService,
    CampsService,
    CampFacilitiesService,
    CampRoomsService,
    CampPresenceService,
    CampAssetsService,
    CampMaintenanceService,
    CampStayStore,
    CampStaysService,
    CampHrBridge,
  ],
  exports: [CampCommonModule, CampPresenceService],
})
export class CampModule {}
