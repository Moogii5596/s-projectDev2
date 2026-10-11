/**
 * v0.2.2 (ADR-003 §2.4, D-09) — роль-загвар ↔ олголтын бодит эрхийн зөрүү. DB/API импортгүй цэвэр функц (FE-005).
 */

/** Олголтын одоогийн TEMPLATE эрх → загварын эрх болгоход нэмэгдэх / хасагдах */
export function diffTemplate(current: readonly string[], template: readonly string[]): { add: string[]; remove: string[] } {
  const cur = new Set(current);
  const tpl = new Set(template);
  return {
    add: [...tpl].filter((c) => !cur.has(c)).sort(),
    remove: [...cur].filter((c) => !tpl.has(c)).sort(),
  };
}

export interface AssignmentRow {
  userRoleId: string;
  userId: string;
  campId: string | null;
  /** олголтын одоогийн TEMPLATE эрх */
  current: string[];
}

export interface ApplyPreviewItem {
  userRoleId: string;
  userId: string;
  campId: string | null;
  add: string[];
  remove: string[];
}

/** Зөвхөн өөрчлөгдөх олголтууд; affectedUsers = давтагдашгүй хэрэглэгчийн тоо */
export function buildApplyPreview(rows: readonly AssignmentRow[], template: readonly string[]) {
  const items: ApplyPreviewItem[] = [];
  for (const r of rows) {
    const d = diffTemplate(r.current, template);
    if (d.add.length > 0 || d.remove.length > 0) items.push({ userRoleId: r.userRoleId, userId: r.userId, campId: r.campId, ...d });
  }
  return { items, affectedUsers: new Set(items.map((i) => i.userId)).size };
}
