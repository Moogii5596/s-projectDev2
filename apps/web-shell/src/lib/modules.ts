/**
 * v0.1.6 (B2) — Build-ийн үед идэвхжүүлэх модулиуд: `VITE_MODULES`
 *
 *   хоосон / "all" → бүгд (хөгжүүлэлт, анхдагч)
 *   "camp"         → зөвхөн Кемп (пилот) — цэс, route, нүүр хуудас (/camp) үүгээр шүүгдэнэ
 *   v0.2.2 H2: "hr" (Хүний нөөц) — Кемп ажилтны өгөгдлөө HR-ээс авдаг тул `camp` асаахад `hr` автоматаар асна
 *              (manifest-ийн `requires`; пилотын `VITE_MODULES=camp` өөрчлөгдөхгүй).
 *
 * Зөвхөн UI-г шүүнэ (backend эрх хэвээр). Цэвэр функц — unit тестлэгдэнэ (supabase import хийхгүй, FE-005).
 */
export interface FrontendModuleManifest {
  id: string;
  buildOrder: number | null;
  debugOnly: boolean;
  requires: readonly string[];
  homePath?: string;
  debugPath?: string;
  i18nPrefixes: readonly string[];
  widgets: readonly string[];
  navigation?: readonly {
    key: string;
    labelKey: string;
    path: string;
    mobileModules: boolean;
    order: number;
    visibility?: 'settings' | 'debug';
  }[];
  settingsSections?: readonly {
    key: string;
    labelKey: string;
    permission: string;
    order: number;
  }[];
  routes?: readonly {
    key: string;
    path: string;
    buildDependency?: string;
    featureFlag?: 'feed';
  }[];
}

export const MODULE_MANIFESTS = [
  {
    id: 'core', buildOrder: null, debugOnly: false, requires: [], i18nPrefixes: [
      'access', 'approval', 'audit', 'auth', 'common', 'core', 'debug', 'delegation', 'devices', 'feedback', 'files',
      'nav', 'notify', 'perm', 'profile', 'settings', 'whatsnew',
    ], widgets: [],
    routes: [
      { key: 'home', path: '/' },
      { key: 'devices', path: '/account/devices' },
      { key: 'feedback', path: '/feedback' },
      { key: 'settings', path: '/settings' },
      { key: 'settings-section', path: '/settings/:section' },
      { key: 'debug-modules', path: '/debug/modules' },
      { key: 'debug', path: '/debug' },
      { key: 'debug-tab', path: '/debug/:tab' },
      { key: 'notifications', path: '/notifications' },
      { key: 'approvals', path: '/approvals' },
      { key: 'approval-detail', path: '/approvals/:id' },
      { key: 'profile', path: '/profile' },
      { key: 'legacy-org-settings', path: '/camp/system/organizations' },
      { key: 'legacy-role-settings', path: '/camp/system/roles' },
      { key: 'legacy-user-role-settings', path: '/camp/system/user-roles' },
      { key: 'legacy-translation-settings', path: '/camp/system/translations' },
      { key: 'legacy-building-settings', path: '/camp/system/building-types' },
      { key: 'legacy-asset-settings', path: '/camp/system/asset-categories' },
      { key: 'whats-new', path: '/whats-new' },
    ],
    settingsSections: [
      { key: 'profile', labelKey: 'settings.section.profile', permission: 'tenant-admin', order: 0 },
      { key: 'security', labelKey: 'settings.section.security', permission: 'tenant-admin', order: 1 },
      { key: 'modules', labelKey: 'settings.section.modules', permission: 'tenant-admin', order: 2 },
      { key: 'calendars', labelKey: 'settings.section.calendars', permission: 'tenant-admin', order: 3 },
      { key: 'approval-flows', labelKey: 'settings.section.approval-flows', permission: 'tenant-admin', order: 4 },
      { key: 'sites', labelKey: 'settings.section.sites', permission: 'tenant-admin', order: 5 },
      { key: 'attachment-patterns', labelKey: 'settings.section.attachment-patterns', permission: 'tenant-admin', order: 6 },
      { key: 'roles', labelKey: 'settings.section.roles', permission: 'tenant-admin', order: 7 },
      { key: 'user-roles', labelKey: 'settings.section.user-roles', permission: 'tenant-admin', order: 8 },
      { key: 'translations', labelKey: 'settings.section.translations', permission: 'tenant-admin', order: 14 },
    ],
    navigation: [
      { key: 'approvals', labelKey: 'nav.approvals', path: '/approvals', mobileModules: true, order: 3 },
      { key: 'settings', labelKey: 'nav.settings', path: '/settings', mobileModules: true, order: 4, visibility: 'settings' },
      { key: 'debug', labelKey: 'nav.debug', path: '/debug', mobileModules: true, order: 5, visibility: 'debug' },
      { key: 'feedback', labelKey: 'nav.feedback', path: '/feedback', mobileModules: true, order: 6 },
      { key: 'whats-new', labelKey: 'nav.whats_new', path: '/whats-new', mobileModules: true, order: 7 },
    ],
  },
  {
    id: 'hr', buildOrder: 2, debugOnly: false, requires: [], homePath: '/hr', i18nPrefixes: ['hr'], widgets: [],
    navigation: [{ key: 'hr', labelKey: 'nav.hr', path: '/hr', mobileModules: true, order: 1 }],
    routes: [{ key: 'hr', path: '/hr/*' }],
  },
  {
    id: 'camp', buildOrder: 1, debugOnly: false, requires: ['hr'], homePath: '/camp', i18nPrefixes: ['camp'], widgets: [],
    navigation: [{ key: 'camp', labelKey: 'nav.camp', path: '/camp', mobileModules: true, order: 2 }],
    settingsSections: [
      { key: 'organizations', labelKey: 'settings.section.organizations', permission: 'camp.master.manage', order: 9 },
      { key: 'contract-catalog', labelKey: 'camp.ct.catalog_title', permission: 'camp.contract.manage', order: 10 },
      { key: 'exchange-rates', labelKey: 'camp.ct.exchange_rates_title', permission: 'camp.contract.manage', order: 11 },
      { key: 'building-types', labelKey: 'settings.section.building-types', permission: 'camp.master.manage', order: 12 },
      { key: 'asset-categories', labelKey: 'settings.section.asset-categories', permission: 'camp.asset.manage', order: 13 },
    ],
    routes: [{ key: 'camp', path: '/camp/*' }],
  },
  {
    id: 'feed', buildOrder: null, debugOnly: false, requires: [], i18nPrefixes: ['feed'], widgets: [],
    navigation: [{ key: 'feed', labelKey: 'nav.feed', path: '/feed', mobileModules: false, order: 0 }],
    routes: [
      { key: 'feed', path: '/feed', featureFlag: 'feed' },
      { key: 'feed-reports', path: '/feed/reports', featureFlag: 'feed' },
      { key: 'feed-post', path: '/feed/:id', featureFlag: 'feed' },
    ],
  },
  {
    id: 'mr', buildOrder: 0, debugOnly: true, requires: [], homePath: '/debug/modules/mr',
    debugPath: '/debug/modules/mr', i18nPrefixes: [], widgets: [],
    routes: [
      { key: 'mr', path: '/debug/modules/mr' },
      { key: 'mr-new', path: '/debug/modules/mr/new' },
      { key: 'mr-detail', path: '/debug/modules/mr/:id' },
      { key: 'legacy-mr', path: '/requisitions' },
      { key: 'legacy-mr-new', path: '/requisitions/new' },
      { key: 'legacy-mr-detail', path: '/requisitions/:id' },
    ],
  },
  {
    id: 'workflow', buildOrder: null, debugOnly: true, requires: [],
    debugPath: '/debug/modules/workflow/approval-sla', i18nPrefixes: [], widgets: [],
    routes: [
      { key: 'approval-sla', path: '/debug/modules/workflow/approval-sla', buildDependency: 'mr' },
      { key: 'workflow-definitions', path: '/debug/modules/workflow/definitions', buildDependency: 'mr' },
      { key: 'delegations', path: '/debug/modules/workflow/delegations', buildDependency: 'mr' },
      { key: 'legacy-approval-sla', path: '/admin/approval-sla', buildDependency: 'mr' },
      { key: 'legacy-workflow-definitions', path: '/admin/workflow-definitions', buildDependency: 'mr' },
      { key: 'legacy-delegations', path: '/admin/delegations', buildDependency: 'mr' },
    ],
  },
  { id: 'budget', buildOrder: null, debugOnly: true, requires: [], i18nPrefixes: [], widgets: [] },
  {
    id: 'inventory', buildOrder: 3, debugOnly: true, requires: [], homePath: '/debug/modules/inventory',
    debugPath: '/debug/modules/inventory', i18nPrefixes: [], widgets: [],
    routes: [
      { key: 'inventory', path: '/debug/modules/inventory' },
      { key: 'legacy-inventory', path: '/inventory' },
    ],
  },
  {
    id: 'vendors', buildOrder: 4, debugOnly: true, requires: [], homePath: '/debug/modules/vendors',
    debugPath: '/debug/modules/vendors', i18nPrefixes: [], widgets: [],
    routes: [
      { key: 'vendors', path: '/debug/modules/vendors' },
      { key: 'legacy-vendors', path: '/vendors' },
    ],
  },
  {
    id: 'reports', buildOrder: 5, debugOnly: true, requires: [], homePath: '/debug/modules/reports',
    debugPath: '/debug/modules/reports', i18nPrefixes: [], widgets: [],
    routes: [
      { key: 'reports', path: '/debug/modules/reports' },
      { key: 'legacy-reports', path: '/reports' },
    ],
  },
  // v0.2.4 Q17/Q18: route-ingress (`/routes`) = MFE-ийн route бүртгэл — Debug-аас гадна хаалттай
  {
    id: 'mfe', buildOrder: 6, debugOnly: true, requires: [], homePath: '/debug/modules/mfe',
    debugPath: '/debug/modules/mfe', i18nPrefixes: [], widgets: [],
    routes: [
      { key: 'mfe', path: '/debug/modules/mfe/*' },
      { key: 'legacy-mfe', path: '/mfe/*' },
    ],
  },
] as const satisfies readonly FrontendModuleManifest[];

type ManifestEntry = (typeof MODULE_MANIFESTS)[number];
type ManifestRoutes<M> = M extends { id: infer Id; routes: readonly (infer Route)[] }
  ? Route & Omit<NonNullable<FrontendModuleManifest['routes']>[number], 'key' | 'path'> & { module: Id }
  : never;
type ManifestNavigation<M> = M extends { id: infer Id; navigation: readonly (infer Item)[] }
  ? Item & Omit<NonNullable<FrontendModuleManifest['navigation']>[number], 'key' | 'labelKey' | 'path' | 'mobileModules' | 'order'> & { module: Id }
  : never;
type ManifestSettingsSections<M> = M extends { id: infer Id; settingsSections: readonly (infer Section)[] }
  ? Section & { module: Id }
  : never;
const OPTIONAL_MANIFEST_FIELDS: readonly FrontendModuleManifest[] = MODULE_MANIFESTS;

export type TenantModuleId = (typeof MODULE_MANIFESTS)[number]['id'];
type BuildManifest = Extract<(typeof MODULE_MANIFESTS)[number], { buildOrder: number }>;
export type AppModule = BuildManifest['id'];
export const TENANT_MODULE_IDS = MODULE_MANIFESTS.map((module) => module.id);
export const APP_MODULES = MODULE_MANIFESTS
  .filter((module): module is BuildManifest => module.buildOrder !== null)
  .sort((a, b) => a.buildOrder - b.buildOrder)
  .map((module) => module.id);
export const DEBUG_MODULES = MODULE_MANIFESTS.filter((module) => module.debugOnly).map((module) => module.id);
export const MODULE_ROUTES = OPTIONAL_MANIFEST_FIELDS.flatMap((module) =>
  (module.routes ?? []).map((route) => ({ ...route, module: module.id })),
 ) as ManifestRoutes<ManifestEntry>[];
export const MODULE_NAVIGATION = OPTIONAL_MANIFEST_FIELDS.flatMap((module) =>
  (module.navigation ?? []).map((item) => ({ ...item, module: module.id })),
 ) as ManifestNavigation<ManifestEntry>[];
MODULE_NAVIGATION.sort((a, b) => a.order - b.order);
export const MODULE_SETTINGS_SECTIONS = OPTIONAL_MANIFEST_FIELDS.flatMap((module) =>
  (module.settingsSections ?? []).map((section) => ({ ...section, module: module.id })),
 ) as ManifestSettingsSections<ManifestEntry>[];
MODULE_SETTINGS_SECTIONS.sort((a, b) => a.order - b.order);

export function moduleRoutesForBuild(enabledModules: ReadonlySet<AppModule>, feedEnabled: boolean) {
  return MODULE_ROUTES.filter(({ module, buildDependency, featureFlag }) => {
    if (featureFlag === 'feed' && !feedEnabled) return false;
    if (buildDependency && (!isBuildModule(buildDependency) || !enabledModules.has(buildDependency))) return false;
    return module === 'core' || module === 'feed' || !isBuildModule(module) || enabledModules.has(module);
  });
}

export function filterModuleNavigation(options: {
  enabledModules: ReadonlySet<AppModule>;
  installedModules: ReadonlySet<TenantModuleId>;
  permissionVisibleModules: ReadonlySet<AppModule>;
  feedEnabled: boolean;
  settingsVisible: boolean;
  debugVisible: boolean;
}) {
  return MODULE_NAVIGATION.filter((item) => {
    if (item.visibility === 'settings') return options.settingsVisible;
    if (item.visibility === 'debug') return options.debugVisible;
    if (item.module === 'core') return true;
    if (item.module === 'feed') return options.feedEnabled && options.installedModules.has('feed');
    return isBuildModule(item.module) &&
      options.enabledModules.has(item.module) &&
      options.installedModules.has(item.module) &&
      options.permissionVisibleModules.has(item.module);
  });
}

export function getModuleManifest(module: string): FrontendModuleManifest | undefined {
  return MODULE_MANIFESTS.find((manifest) => manifest.id === module);
}

export function isDebugOnlyModule(module: string): boolean {
  return getModuleManifest(module)?.debugOnly ?? false;
}

export function isBuildModule(module: string): module is AppModule {
  const manifest = getModuleManifest(module);
  return manifest !== undefined && manifest.buildOrder !== null;
}

export function moduleHomePath(module: AppModule): string {
  const path = getModuleManifest(module)?.homePath;
  if (!path) throw new Error(`Frontend module home path бүртгэгдээгүй: ${module}`);
  return path;
}

export function debugModulePath(module: TenantModuleId): string | undefined {
  return getModuleManifest(module)?.debugPath;
}

function withRequired(picked: Iterable<AppModule>): Set<AppModule> {
  const out = new Set<AppModule>(picked);
  for (const m of [...out]) {
    for (const dep of getModuleManifest(m)?.requires ?? []) {
      if (isBuildModule(dep)) out.add(dep);
    }
  }
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
  const first = APP_MODULES.find((m) => modules.has(m) && !isDebugOnlyModule(m));
  if (!first) throw new Error('VITE_MODULES: дор хаяж нэг үндсэн модуль шаардлагатай');
  return moduleHomePath(first);
}

/** `VITE_SUPABASE_URL=same-origin` → апп-ын origin (пилот: Caddy /auth/v1 → Supabase Auth; домэйн build-д хамаарахгүй) */
export function resolveSupabaseUrl(raw: string | undefined, origin: string): string {
  const value = (raw ?? '').trim();
  return value === 'same-origin' ? origin : value;
}
