/**
 * v0.2.2 H2 — «Хүний нөөц» цэсний хэсгүүд ба хуучин Кемпийн хаягийн зураглал (ADR-006 §5.1).
 * Цэвэр функц — unit тестлэгдэнэ (react/supabase import хийхгүй).
 *
 * Зам: `/hr/:campId/<section>` — `campId` = «үндсэн ажлын байр» (H-Q1; v0.3-т site ерөнхий болно).
 * Албан тушаал tenant-түвшний каталог боловч цэсний тасралтгүй байдлын үүднээс ажлын байрны layout дотор харуулна.
 */
export const HR_SECTIONS = ['employees', 'users', 'departments', 'crews', 'shifts', 'attendance', 'import', 'positions'] as const
export type HrSection = (typeof HR_SECTIONS)[number]

export const HR_DEFAULT_SECTION: HrSection = 'employees'

export function isHrSection(s: string | undefined | null): s is HrSection {
  return !!s && (HR_SECTIONS as readonly string[]).includes(s)
}

export const hrPath = (campId: string, section: HrSection = HR_DEFAULT_SECTION): string => `/hr/${campId}/${section}`

/** Ажлын байр солиход ижил хэсэгт үлдэнэ: `/hr/A/crews` → `crews` (танихгүй бол анхдагч) */
export function sectionFromPath(pathname: string): HrSection {
  const s = pathname.split('/')[3]
  return isHrSection(s) ? s : HR_DEFAULT_SECTION
}

/**
 * Хуучин Кемпийн хаяг → «Хүний нөөц» (v0.2.1 хүртэлх bookmark, e2e).
 * `/camp/:campId/{employees,attendance,shifts,departments,crews}`, `/camp/:campId/settings/{departments,crews}`.
 */
export const LEGACY_CAMP_SECTIONS = ['employees', 'attendance', 'shifts', 'departments', 'crews'] as const
export type LegacyCampSection = (typeof LEGACY_CAMP_SECTIONS)[number]

export function legacyCampToHr(campId: string, section: LegacyCampSection, search = ''): string {
  return `${hrPath(campId, section)}${search}`
}
