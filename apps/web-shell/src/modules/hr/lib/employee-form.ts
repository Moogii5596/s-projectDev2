import type { OrgType } from '../api/camp-bridge'

/**
 * v0.2.3 Блок R8 (PIL-25) — ажилтан нэмэх маягт: «Код автоматаар олгох (HR ID-гүй)» (цэвэр).
 * Автомат үед `employeeCode`-ийг илгээхгүй → backend `<угтвар>0001` олгоно (R7).
 */

/** Гэрээт / туслан гүйцэтгэгч байгууллага → автомат кодыг санал болгоно (R8-b) */
export const suggestAutoCode = (orgType: OrgType | undefined): boolean => orgType === 'CONTRACTOR' || orgType === 'SUBCONTRACTOR'

/** Жишээ код (угтвар = кемпийн тохиргоо, анхдагч Z) */
export const autoCodeExample = (prefix: string | undefined): string => `${(prefix || 'Z').toUpperCase()}0001`

/** Кодын шаардлага: автомат үед хоосон байж болно */
export const codeReady = (autoCode: boolean, code: string): boolean => autoCode || code.trim().length > 0

/** Илгээх кодын хэсэг: автомат → талбар алга (backend олгоно) */
export const codePayload = (autoCode: boolean, code: string): { employeeCode?: string } => (autoCode ? {} : { employeeCode: code.trim() })
