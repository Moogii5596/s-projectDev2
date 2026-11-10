/**
 * v0.1.6 (B2) — VITE_MODULES / нүүр зам / same-origin Supabase URL
 */
import { describe, expect, it } from 'vitest';
import { APP_MODULES, DEBUG_MODULES, debugModulePath, filterModuleNavigation, homePath, isBuildModule, isDebugOnlyModule, MODULE_MANIFESTS, MODULE_NAVIGATION, MODULE_ROUTES, MODULE_SETTINGS_SECTIONS, moduleHomePath, moduleRoutesForBuild, parseModules, resolveSupabaseUrl } from '../modules';
import mn from '@s-project/i18n/web.mn.json';
import en from '@s-project/i18n/web.en.json';
import zh from '@s-project/i18n/web.zh.json';

describe('module manifest', () => {
  it('preserves build module order and derives home/debug paths from the manifest', () => {
    expect(APP_MODULES).toEqual(['mr', 'camp', 'hr', 'inventory', 'vendors', 'reports', 'mfe']);
    expect(DEBUG_MODULES).toEqual(['mr', 'workflow', 'budget', 'inventory', 'vendors', 'reports', 'mfe']);
    expect(moduleHomePath('camp')).toBe('/camp');
    expect(debugModulePath('workflow')).toBe('/debug/modules/workflow/approval-sla');
    expect(debugModulePath('budget')).toBeUndefined();
    expect(isBuildModule('camp')).toBe(true);
    expect(isBuildModule('feed')).toBe(false);
  });

  it('keeps route, navigation, and settings registrations unique and module-owned', () => {
    expect(new Set(MODULE_ROUTES.map(({ key }) => key)).size).toBe(MODULE_ROUTES.length);
    expect(new Set(MODULE_ROUTES.map(({ path }) => path)).size).toBe(MODULE_ROUTES.length);
    expect(new Set(MODULE_NAVIGATION.map(({ key }) => key)).size).toBe(MODULE_NAVIGATION.length);
    expect(MODULE_NAVIGATION.map(({ order }) => order)).toEqual([...MODULE_NAVIGATION.map(({ order }) => order)].sort((a, b) => a - b));
    expect(new Set(MODULE_SETTINGS_SECTIONS.map(({ key }) => key)).size).toBe(MODULE_SETTINGS_SECTIONS.length);

    for (const route of MODULE_ROUTES) {
      expect(MODULE_MANIFESTS.some((module) => module.id === route.module)).toBe(true);
    }
    for (const item of [...MODULE_NAVIGATION, ...MODULE_SETTINGS_SECTIONS]) {
      expect(MODULE_MANIFESTS.some((module) => module.id === item.module)).toBe(true);
    }
  });

  it('keeps declared translation prefixes and manifest labels in all web locales', () => {
    const catalogs = [mn, en, zh] as const;
    const declaredPrefixes = [...new Set(MODULE_MANIFESTS.flatMap((module) => module.i18nPrefixes))].sort();
    const catalogPrefixes = [...new Set(Object.keys(mn).map((key) => key.split('.')[0]))].sort();
    expect(declaredPrefixes).toEqual(catalogPrefixes);

    for (const module of MODULE_MANIFESTS) {
      for (const prefix of module.i18nPrefixes) {
        for (const catalog of catalogs) {
          expect(Object.keys(catalog).some((key) => key.startsWith(`${prefix}.`)), `${module.id}: ${prefix}`).toBe(true);
        }
      }
    }

    const labels = [
      ...MODULE_NAVIGATION.map((item) => item.labelKey),
      ...MODULE_SETTINGS_SECTIONS.map((section) => section.labelKey),
    ];
    for (const key of labels) {
      for (const catalog of catalogs) expect(catalog).toHaveProperty(key);
    }
  });

  it('filters routes and navigation by build, tenant, permission, and feature flags', () => {
    const enabled = parseModules('camp');
    const routes = moduleRoutesForBuild(enabled, false);
    expect(routes.map(({ module }) => module)).toContain('camp');
    expect(routes.map(({ module }) => module)).toContain('hr');
    expect(routes.some(({ module }) => module === 'feed')).toBe(false);
    expect(routes.some(({ module }) => module === 'mr')).toBe(false);

    const navigation = filterModuleNavigation({
      enabledModules: enabled,
      installedModules: new Set(['core', 'camp', 'hr', 'feed']),
      permissionVisibleModules: new Set(['camp', 'hr']),
      feedEnabled: false,
      settingsVisible: false,
      debugVisible: false,
    });
    expect(navigation.map(({ key }) => key)).toEqual(['hr', 'camp', 'approvals', 'feedback', 'whats-new']);

    const tenantFiltered = filterModuleNavigation({
      enabledModules: enabled,
      installedModules: new Set(['core', 'hr', 'feed']),
      permissionVisibleModules: new Set(['camp', 'hr']),
      feedEnabled: true,
      settingsVisible: true,
      debugVisible: true,
    });
    expect(tenantFiltered.map(({ key }) => key)).toEqual([
      'feed', 'hr', 'approvals', 'settings', 'debug', 'feedback', 'whats-new',
    ]);

    const permissionFiltered = filterModuleNavigation({
      enabledModules: enabled,
      installedModules: new Set(['core', 'camp', 'hr']),
      permissionVisibleModules: new Set(['camp']),
      feedEnabled: false,
      settingsVisible: false,
      debugVisible: false,
    });
    expect(permissionFiltered.map(({ key }) => key)).toContain('camp');
    expect(permissionFiltered.map(({ key }) => key)).not.toContain('hr');
  });
});

describe('parseModules', () => {
  it('хоосон / all → бүх модуль', () => {
    expect([...parseModules(undefined)]).toEqual([...APP_MODULES]);
    expect([...parseModules(' ALL ')]).toEqual([...APP_MODULES]);
  });

  it('camp → кемп + hr (v0.2.2 H2 хамаарал); таслалаар олон', () => {
    expect([...parseModules('camp')]).toEqual(['camp', 'hr']);
    expect([...parseModules(' Camp , reports ')]).toEqual(['camp', 'reports', 'hr']);
  });

  it('hr дангаараа → зөвхөн hr (кемпийг асаахгүй)', () => {
    expect([...parseModules('hr')]).toEqual(['hr']);
    expect([...parseModules('hr,camp')]).toEqual(['hr', 'camp']);
  });

  it('үл мэдэгдэх модуль → алдаа (бичгийн алдааг чимээгүй өнгөрөөхгүй)', () => {
    expect(() => parseModules('camp,kemp')).toThrow(/kemp/);
  });
});

describe('homePath', () => {
  it('debug-only модулийг нүүр болгохгүй; үндсэн модулийн нүүрийг сонгоно', () => {
    expect(homePath(parseModules(''))).toBe('/camp');
    expect(homePath(parseModules('camp'))).toBe('/camp');
    expect(homePath(parseModules('reports,camp'))).toBe('/camp');
  });

  it('H2: camp асаахад нүүр /camp хэвээр (hr нүүр болохгүй); зөвхөн hr → /hr', () => {
    expect(homePath(parseModules('camp'))).toBe('/camp');
    expect(homePath(parseModules('hr'))).toBe('/hr');
  });

  it('debug-only модуль дангаараа → нүүр болохгүй', () => {
    expect(() => homePath(parseModules('mfe'))).toThrow(/үндсэн модуль/);
    expect(isDebugOnlyModule('inventory')).toBe(true);
    expect(isDebugOnlyModule('camp')).toBe(false);
  });
});

describe('resolveSupabaseUrl', () => {
  it('same-origin → origin; бусад нь хэвээр', () => {
    expect(resolveSupabaseUrl('same-origin', 'https://pilot.example.ts.net')).toBe('https://pilot.example.ts.net');
    expect(resolveSupabaseUrl(' http://localhost:54321 ', 'x')).toBe('http://localhost:54321');
    expect(resolveSupabaseUrl(undefined, 'x')).toBe('');
  });
});
