import { Module } from '@nestjs/common';
import { CampCommonModule } from '../camp/common/camp-common.module';
import { HrOrgController } from './org/hr-org.controller';
import { HrDepartmentsService } from './org/hr-departments.service';
import { HrCrewsService } from './org/hr-crews.service';
import { HrEmployeesController } from './employees/hr-employees.controller';
import { HrEmployeesService } from './employees/hr-employees.service';
import { HrPositionsController } from './positions/hr-positions.controller';
import { HrPositionsService } from './positions/hr-positions.service';
import { HrAttendanceController } from './attendance/hr-attendance.controller';
import { HrAttendanceService } from './attendance/hr-attendance.service';
import { HrShiftsService } from './attendance/hr-shifts.service';
import { HrAttendanceHooks } from './attendance/stay-store';
import { HrEmployeeHooks } from './employees/employee-hooks';
import { HrEmployeeLifecycleService } from './employees/hr-employee-lifecycle.service';
import { HrDataController } from './import/hr-data.controller';
import { HrDataImportService } from './import/hr-data-import.service';
import { CoreModule } from '../core/core.module';

const SERVICES = [
  HrDepartmentsService,
  HrCrewsService,
  HrEmployeesService,
  HrPositionsService,
  HrAttendanceService,
  HrShiftsService,
  HrAttendanceHooks,
  HrEmployeeHooks,
  HrEmployeeLifecycleService,
  HrDataImportService,
];

/**
 * HR — системийн суурь (ADR-006): ажилтан, хэлтэс, бригад, албан тушаал, ээлж, ирц, импорт. API: `/api/v1/hr/...`.
 * v0.2.2 H1: кодын эзэмшил л шилжсэн — хүснэгт (`camp_*`), эрхийн код (`camp.*`) v0.3 хүртэл хэвээр (`@@map`).
 * Кемп нь HR-ийг ашиглана (HR → Кемп хамааралгүй); Кемпийн байрлалт `HrAttendanceHooks`-оор холбогдоно.
 */
@Module({
  imports: [CampCommonModule, CoreModule],
  controllers: [HrOrgController, HrEmployeesController, HrPositionsController, HrAttendanceController, HrDataController],
  providers: SERVICES,
  exports: SERVICES,
})
export class HrModule {}
