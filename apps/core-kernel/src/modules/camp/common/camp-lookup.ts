import { Tx } from './camp-tx';
import { badRequest, notFound } from '../../../common/i18n/app-error';

/** Кемп tenant-д байгаа эсэх (404). Эрх шалгахаас ӨМНӨ дуудахгүй — эрхгүй хэрэглэгчид оршин буйг илчлэхгүй */
export async function getCampOr404(tx: Tx, tenantId: string, campId: string) {
  const camp = await tx.camp.findFirst({ where: { id: campId, tenantId }, select: { id: true, code: true, name: true, isActive: true } });
  if (!camp) throw notFound('camp.err.lookup.1');
  return camp;
}

/** Хоол идэх байршил тухайн кемпийнх, идэвхтэй эсэх (400) */
export async function assertMealLocation(tx: Tx, tenantId: string, campId: string, id: string) {
  const loc = await tx.campMealLocation.findFirst({ where: { id, tenantId, campId }, select: { id: true, isActive: true } });
  if (!loc) throw badRequest('camp.err.lookup.2');
  if (!loc.isActive) throw badRequest('camp.err.lookup.3');
}

/** Кемпийн тохиргоо (байхгүй бол анхдагч) — ростер/ээлжийн тооцоонд */
export async function getRosterSettings(tx: Tx, tenantId: string, campId: string) {
  const s = await tx.campSetting.findFirst({
    where: { tenantId, campId },
    select: { rosterOnDays: true, rosterOffDays: true, changeoverWeekday: true, defaultMealLocationId: true },
  });
  return {
    rosterOnDays: s?.rosterOnDays ?? 14,
    rosterOffDays: s?.rosterOffDays ?? 14,
    changeoverWeekday: s?.changeoverWeekday ?? 3,
    defaultMealLocationId: s?.defaultMealLocationId ?? null,
  };
}
