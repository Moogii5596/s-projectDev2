/**
 * v0.1.6 (B2) — Build-ийн үед идэвхжүүлэх модулиуд: `VITE_MODULES`
 *
 *   хоосон / "all" → бүгд (хөгжүүлэлт, анхдагч)
 *   "camp"         → зөвхөн Кемп (пилот) — цэс, route, нүүр хуудас (/camp) үүгээр шүүгдэнэ
 *   v0.2.2 H2: "hr" (Хүний нөөц) — Кемп ажилтны өгөгдлөө HR-ээс авдаг тул `camp` асаахад `hr` автоматаар асна
 *              (MODULE_REQUIRES; пилотын `VITE_MODULES=camp` өөрчлөгдөхгүй).
 *
 * Зөвхөн UI-г шүүнэ (backend эрх хэвээр). Цэвэр функц — unit тестлэгдэнэ (supabase import хийхгүй, FE-005).
 */
export const APP_MODULES = ['mr', 'camp', 'hr', 'inventory', 'vendors', 'reports', 'mfe'] as const;
export type AppModule = (typeof APP_MODULES)[number];

/** Модуль бүрийн нүүр зам — эхний идэвхтэй модуль нь апп-ын нүүр болно */
export const MODULE_HOME: Record<AppModule, string> = {
  mr: '/requisitions',
  camp: '/camp',
  hr: '/hr',
  inventory: '/inventory',
  vendors: '/vendors',
  reports: '/reports',
  mfe: '/mfe',
};

/** Модулийн хамаарал: түлхүүр модуль асвал утга дахь модулиуд мөн асна (H2: camp → hr) */
export const MODULE_REQUIRES: Partial<Record<AppModule, readonly AppModule[]>> = {
  camp: ['hr'],
};

function withRequired(picked: Iterable<AppModule>): Set<AppModule> {
  const out = new Set<AppModule>(picked);
  for (const m of [...out]) for (const dep of MODULE_REQUIRES[m] ?? []) out.add(dep);
  return out;
}

export function parseModules(raw: string | undefined): ReadonlySet<AppModule> {
  const value = (raw ?? '').trim().toLowerCase();
  if (!value || value === 'all') return new Set(APP_MODULES);
  const picked = value.split(',').map((s) => s.trim()).filter(Boolean);
  const unknown = picked.filter((m) => !(APP_MODULES as readonly string[]).includes(m));
  if (unknown.length > 0) {
    throw new Error(`VITE_MODULES буруу: ${unknown.join(', ')} (${APP_MODULES.join(', ')} эсвэл all)`);
  }
  return withRequired(picked as AppModule[]);
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
