import { Injectable, OnModuleInit } from '@nestjs/common';
import { HrAttendanceHooks } from '../hr/attendance/stay-store';
import { HrDataImportService } from '../hr/import/hr-data-import.service';
import { CampStayStore } from './attendance/camp-stays.service';
import { exportRooms, ROOMS_SPEC } from './data/rooms.export';

/**
 * v0.2.2 H1 (ADR-006 §5, H-Q2) — Кемп HR-д өөрийгөө бүртгэнэ (HR → Кемп хамааралгүй):
 *  - ирцийн бичилт → `camp_stays` (нэг transaction)
 *  - HR-ийн экспортод `rooms`
 */
@Injectable()
export class CampHrBridge implements OnModuleInit {
  constructor(
    private readonly hooks: HrAttendanceHooks,
    private readonly data: HrDataImportService,
    private readonly stayStore: CampStayStore,
  ) {}

  onModuleInit(): void {
    this.hooks.registerStayStore(this.stayStore);
    this.data.registerExport('rooms', { spec: ROOMS_SPEC, rows: exportRooms });
  }
}
