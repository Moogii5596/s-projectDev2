import { Injectable } from '@nestjs/common';
import type { Tx } from '../../camp/common/camp-tx';

/** Ажилтны кемпэд байх хугацаа (stay) — ирцээс (ирсэн/явсан) үүснэ, хадгалалт нь Кемпийнх (`camp_stays`) */
export interface StayRow {
  id: string;
  employeeId: string;
  startDate: Date;
  endDate: Date | null;
}

export interface NewStay {
  tenantId: string;
  campId: string;
  employeeId: string;
  arrivalMovementId: string;
  departureMovementId: string | null;
  startDate: Date;
  endDate: Date | null;
}

/**
 * v0.2.2 H1 (ADR-006 §5, H-Q2) — HR ирц ↔ Кемпийн байрлалтын порт.
 * HR нь Кемп модулийг import хийхгүй; Кемп өөрийн хэрэгжүүлэлтийг `HrAttendanceHooks.registerStayStore`-оор бүртгэнэ.
 * Бүх метод ирцийн бичилттэй НЭГ transaction (`tx`) дотор дуудагдана.
 */
export interface AttendanceStayStore {
  /** Ажилтнуудын нээлттэй эсвэл `since`-ээс хойш хаагдсан stay-ууд */
  findForPlanner(tx: Tx, tenantId: string, employeeIds: string[], since: Date): Promise<StayRow[]>;
  createMany(tx: Tx, rows: NewStay[]): Promise<void>;
  /** Нээлттэй stay-г хаана; өөрчлөгдсөн мөрийн тоо (1 биш бол зэрэгцээ өөрчлөлт) */
  close(tx: Tx, tenantId: string, stayId: string, endDate: Date, departureMovementId: string): Promise<number>;
  /** Ирэлтийн бүртгэл устгагдах үед: түүгээр нээгдсэн (хаагдаагүй) stay-г устгана */
  undoArrival(tx: Tx, tenantId: string, arrivalMovementId: string): Promise<void>;
  /** Явалтын бүртгэл устгагдах үед: түүгээр хаагдсан stay-г дахин нээнэ */
  undoDeparture(tx: Tx, tenantId: string, departureMovementId: string): Promise<void>;
}

/** HR-ийн өргөтгөлийн цэг (observer/port бүртгэл) — Кемп `onModuleInit`-д бүртгэнэ */
@Injectable()
export class HrAttendanceHooks {
  private stayStore?: AttendanceStayStore;

  registerStayStore(store: AttendanceStayStore): void {
    this.stayStore = store;
  }

  get stays(): AttendanceStayStore {
    if (!this.stayStore) throw new Error('HrAttendanceHooks: stay store бүртгэгдээгүй (CampModule ачаалагдсан эсэхийг шалгана уу)');
    return this.stayStore;
  }
}
