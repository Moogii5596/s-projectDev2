import { Injectable } from '@nestjs/common';
import type { Tx } from '../../camp/common/camp-tx';

/** Профайлд харуулах өрөөний хуваарилалт (Кемпийнх) */
export interface ProfileRoomAllocation {
  id: string;
  roomNo: string;
  buildingName: string;
  startDate: string;
  endDate: string | null;
}

/**
 * v0.2.2 Блок 5 (D-07, ADR-006 §5) — ажилтны амьдралын мөчлөг ↔ ажлын байрны (Кемп) өгөгдөл.
 * HR нь Кемпийг import хийхгүй; Кемп өөрийн хэрэгжүүлэлтийг `HrEmployeeHooks.registerSitePort`-оор бүртгэнэ.
 * Бүх метод HR-ийн бичилттэй НЭГ transaction (`tx`) дотор дуудагдана.
 */
export interface EmployeeSitePort {
  /**
   * Ажлаас гарах (`date` = сүүлийн ажлын өдөр биш, гарсан өдөр): өрөөний хуваарилалт —
   * `date`-ээс эхлэх → устгана, `date`-ийг хамарсан / нээлттэй → `date − 1`-ээр хаана (тэр шөнө хонохгүй).
   */
  releaseOnTermination(tx: Tx, tenantId: string, employeeId: string, date: string): Promise<{ closed: number; removed: number }>;
  /** Профайл: өрөөний хуваарилалтын түүх (шинэ нь эхэнд, ≤ limit) */
  roomHistory(tx: Tx, tenantId: string, employeeId: string, limit: number): Promise<ProfileRoomAllocation[]>;
}

/** HR-ийн өргөтгөлийн цэг — Кемп `onModuleInit`-д бүртгэнэ (`CampHrBridge`) */
@Injectable()
export class HrEmployeeHooks {
  private sitePort?: EmployeeSitePort;

  registerSitePort(port: EmployeeSitePort): void {
    this.sitePort = port;
  }

  get site(): EmployeeSitePort {
    if (!this.sitePort) throw new Error('HrEmployeeHooks: site port бүртгэгдээгүй (CampModule ачаалагдсан эсэхийг шалгана уу)');
    return this.sitePort;
  }
}
