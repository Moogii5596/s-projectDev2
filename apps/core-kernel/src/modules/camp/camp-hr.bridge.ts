import { Injectable, OnModuleInit } from '@nestjs/common';
import { HrAttendanceHooks } from '../hr/attendance/stay-store';
import { HrEmployeeHooks } from '../hr/employees/employee-hooks';
import { HrDataImportService } from '../hr/import/hr-data-import.service';
import { CampStayStore } from './attendance/camp-stays.service';
import { CampEmployeeSite } from './attendance/camp-employee-site';
import { buildingsHandler, buildingTypesHandler, roomsHandler } from './data/facilities.handlers';
import { roomAllocationsHandler } from './data/room-allocations.handler';

/**
 * v0.2.2 H1 (ADR-006 §5, H-Q2) — Кемп HR-д өөрийгөө бүртгэнэ (HR → Кемп хамааралгүй):
 *  - ирцийн бичилт → `camp_stays` (нэг transaction)
 *  - HR-ийн импорт/экспортод өрөөний тохиргоо (байрны төрөл, байр, өрөө) ба өрөөнд байрлуулалт (v0.2.3 Блок D)
 *  - v0.2.2 Блок 5: ажлаас гарахад өрөө чөлөөлөх, профайлын өрөөний түүх (`EmployeeSitePort`)
 */
@Injectable()
export class CampHrBridge implements OnModuleInit {
  constructor(
    private readonly hooks: HrAttendanceHooks,
    private readonly data: HrDataImportService,
    private readonly stayStore: CampStayStore,
    private readonly employeeHooks: HrEmployeeHooks,
    private readonly employeeSite: CampEmployeeSite,
  ) {}

  onModuleInit(): void {
    this.hooks.registerStayStore(this.stayStore);
    this.employeeHooks.registerSitePort(this.employeeSite);
    this.data.registerHandler('building-types', buildingTypesHandler);
    this.data.registerHandler('buildings', buildingsHandler);
    this.data.registerHandler('rooms', roomsHandler);
    this.data.registerHandler('room-allocations', roomAllocationsHandler);
  }
}
