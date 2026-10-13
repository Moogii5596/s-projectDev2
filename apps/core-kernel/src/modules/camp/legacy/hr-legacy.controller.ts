import { Controller, UseInterceptors } from '@nestjs/common';
import { DeprecatedRouteInterceptor } from '../common/deprecated-route.interceptor';
import { CoreOrganizationsController } from '../../core/organizations/core-organizations.controller';
import { HrOrgController } from '../../hr/org/hr-org.controller';
import { HrEmployeesController } from '../../hr/employees/hr-employees.controller';
import { HrPositionsController } from '../../hr/positions/hr-positions.controller';
import { HrAttendanceController } from '../../hr/attendance/hr-attendance.controller';
import { HrDataController } from '../../hr/import/hr-data.controller';

/*
 * v0.2.2 H1 (ADR-006 §5.1, H-Q4) — хуучин `/api/v1/camp/...` замууд НЭГ хувилбарын турш (хуучин кэштэй утас эвдрэхгүй).
 * Логик хуулахгүй: HR/Core controller-ийг өвлөж зөвхөн замыг өөрчилнө; хариунд `Deprecation: true`. v0.2.3-т устгана.
 */

@Controller('camp/organizations')
@UseInterceptors(DeprecatedRouteInterceptor)
export class CampOrganizationsController extends CoreOrganizationsController {}

@Controller('camp/positions')
@UseInterceptors(DeprecatedRouteInterceptor)
export class CampPositionsController extends HrPositionsController {}

@Controller('camp/camps/:campId')
@UseInterceptors(DeprecatedRouteInterceptor)
export class CampHrOrgLegacyController extends HrOrgController {}

@Controller('camp/camps/:campId')
@UseInterceptors(DeprecatedRouteInterceptor)
export class CampHrEmployeesLegacyController extends HrEmployeesController {}

@Controller('camp/camps/:campId')
@UseInterceptors(DeprecatedRouteInterceptor)
export class CampHrAttendanceLegacyController extends HrAttendanceController {}

@Controller('camp/camps/:campId')
@UseInterceptors(DeprecatedRouteInterceptor)
export class CampDataController extends HrDataController {}

export const CAMP_HR_LEGACY_CONTROLLERS = [
  CampOrganizationsController,
  CampPositionsController,
  CampHrOrgLegacyController,
  CampHrEmployeesLegacyController,
  CampHrAttendanceLegacyController,
  CampDataController,
];
