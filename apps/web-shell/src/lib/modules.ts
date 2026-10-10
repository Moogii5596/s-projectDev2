/**
 * v0.1.6 (B2) — Build-ийн үед идэвхжүүлэх модулиуд: `VITE_MODULES`
 *
 *   хоосон / "all" → бүгд (хөгжүүлэлт, анхдагч)
 *   "camp"         → зөвхөн Кемп (пилот) — цэс, route, нүүр хуудас (/camp) үүгээр шүүгдэнэ
 *
 * Зөвхөн UI-г шүүнэ (backend эрх хэвээр). Цэвэр функц — unit тестлэгдэнэ (supabase import хийхгүй, FE-005).
 */
export const APP_MODULES = ['mr', 'camp', 'inventory', 'vendors', 'reports', 'mfe'] as const;
export type AppModule = (typeof APP_MODULES)[number];

/** Модуль бүрийн нүүр зам — эхний идэвхтэй модуль нь апп-ын нүүр болно */
export const MODULE_HOME: Record<AppModule, string> = {
  mr: '/requisitions',
  camp: '/camp',
  inventory: '/inventory',
  vendors: '/vendors',
  reports: '/reports',
  mfe: '/mfe',
};

export function parseModules(raw: string | undefined): ReadonlySet<AppModule> {
  const value = (raw ?? '').trim().toLowerCase();
  if (!value || value === 'all') return new Set(APP_MODULES);
  const picked = value.split(',').map((s) => s.trim()).filter(Boolean);
  const unknown = picked.filter((m) => !(APP_MODULES as readonly string[]).includes(m));
  if (unknown.length > 0) {
    throw new Error(`VITE_MODULES буруу: ${unknown.join(', ')} (${APP_MODULES.join(', ')} эсвэл all)`);
  }
  return new Set(picked as AppModule[]);
}

export function homePath(modules: ReadonlySet<AppModule>): string {
  const first = APP_MODULES.find((m) => modules.has(m) && m !== 'mfe');
  if (!first) throw new Error('VITE_MODULES: дор хаяж нэг үндсэн модуль (mfe-ээс бусад) шаардлагатай');
  return MODULE_HOME[first];
}

/** `VITE_SUPABASE_URL=same-origin` → апп-ын origin (пилот: Caddy /auth/v1 → Supabase Auth; домэйн build-д хамаарахгүй) */
export function resolveSupabaseUrl(raw: string | undefined, origin: string): string {
  const value = (raw ?? '').trim();
  return value === 'same-origin' ? origin : value;
}
