import { Module } from '@nestjs/common';
import { CampAccessService } from './common/camp-access.service';
import { CampRbacController } from './rbac/camp-rbac.controller';
import { CampRbacService } from './rbac/camp-rbac.service';
import { CampSettingsController } from './settings/camp-settings.controller';
import { CampSettingsService } from './settings/camp-settings.service';
import { CampMasterController, CampOrganizationsController, CampsController } from './master/camp-master.controller';
import { CampsService } from './master/camps.service';
import { CampFacilitiesService } from './master/camp-facilities.service';
import { CampOrganizationsService } from './master/camp-organizations.service';
import { CampDepartmentsService } from './master/camp-departments.service';
import { CampCrewsService } from './master/camp-crews.service';
import { CampEmployeesService } from './master/camp-employees.service';
import { CampAttendanceController } from './attendance/camp-attendance.controller';
import { CampAttendanceService } from './attendance/camp-attendance.service';
import { CampShiftsService } from './attendance/camp-shifts.service';
import { CampRoomsService } from './attendance/camp-rooms.service';
import { CampPresenceService } from './attendance/camp-presence.service';

/**
 * Camp Module — Шат 2 (эрх, тохиргоо, мастер өгөгдөл), Шат 3 (ирц, ээлж, өрөө, хоолны суурь тоо). DatabaseModule, AppCacheModule нь global.
 * Guard/interceptor нь APP_GUARD-аар (RULE-07) — controller-д decorator хэрэггүй.
 */
@Module({
  controllers: [CampRbacController, CampSettingsController, CampsController, CampOrganizationsController, CampMasterController, CampAttendanceController],
  providers: [
    CampAccessService,
    CampRbacService,
    CampSettingsService,
    CampsService,
    CampFacilitiesService,
    CampOrganizationsService,
    CampDepartmentsService,
    CampCrewsService,
    CampEmployeesService,
    CampAttendanceService,
    CampShiftsService,
    CampRoomsService,
    CampPresenceService,
  ],
  exports: [CampAccessService, CampPresenceService],
})
export class CampModule {}
