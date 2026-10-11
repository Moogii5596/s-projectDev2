/**
 * FB-11 (v0.2.0) — сүүлд орсон кемп (хэрэглэгч бүрт, энэ төхөөрөмжид). /camp → тэр кемп рүү шууд.
 * Эрхгүй/идэвхгүй/устсан кемп бол жагсаалт харуулна. localStorage алдаа (хувийн цонх) → санахгүй.
 */
const key = (userId: string) => `s-project.camp.last.${userId}`

export function getLastCamp(userId: string | null | undefined): string | null {
  if (!userId) return null
  try {
    return localStorage.getItem(key(userId))
  } catch {
    return null
  }
}

export function setLastCamp(userId: string | null | undefined, campId: string): void {
  if (!userId) return
  try {
    localStorage.setItem(key(userId), campId)
  } catch {
    /* санахгүй ч ажиллана */
  }
}

/** Сүүлийн кемп жагсаалтад идэвхтэй байвал түүнийг, эс бөгөөс null */
export function resolveLastCamp(last: string | null, camps: { id: string; isActive: boolean }[]): string | null {
  if (!last) return null
  return camps.some((c) => c.id === last && c.isActive) ? last : null
}
