import { describe, expect, it } from 'vitest';
import {
  PERMISSIONS,
  PERMISSION_CODES,
  RETIRED_PERMISSIONS,
  isPermission,
  permissionAvailableIn,
  permissionModule,
} from '../permission-registry';
import { TENANT_MODULES, type ModuleManifest } from '../../modules/module-registry';
import mn from '@s-project/i18n/web.mn.json';
import en from '@s-project/i18n/web.en.json';
import zh from '@s-project/i18n/web.zh.json';
import termsMn from '@s-project/i18n/terms.mn.json';
import termsEn from '@s-project/i18n/terms.en.json';
import termsZh from '@s-project/i18n/terms.zh.json';

describe('permission-registry (ADR-007)', () => {
  it('hr.* код 4, camp.roles.manage алга, модуль = кодын эхний хэсэг', () => {
    expect(PERMISSION_CODES.filter((c) => permissionModule(c) === 'hr')).toEqual([
      'hr.employee.manage', 'hr.employee.terminate', 'hr.attendance.import', 'hr.shift.adjust',
    ]);
    expect(isPermission('camp.roles.manage')).toBe(false);
    expect(RETIRED_PERMISSIONS).toEqual(['camp.roles.manage']);
  });

  it('хуучин болон retired код зөвшөөрөгдөхгүй', () => {
    expect(isPermission('camp.employee.manage')).toBe(false);
    expect(isPermission('camp.movement.import')).toBe(false);
    expect(isPermission('camp.roles.manage')).toBe(false);
    expect(isPermission(PERMISSIONS.EMPLOYEE_MANAGE)).toBe(true);
  });

  it('availableIn: V2 код нуугдана, үл мэдэгдэх → v2', () => {
    expect(permissionAvailableIn('hr.employee.manage')).toBe('v1');
    // v0.2.3 Блок 6а: хоолны захиалга гарсан → v1
    expect(permissionAvailableIn('camp.meal.order')).toBe('v1');
    expect(permissionAvailableIn('camp.meal.accept')).toBe('v1');
    expect(permissionAvailableIn('camp.contract.manage')).toBe('v1');
    expect(permissionAvailableIn('core.unknown.x')).toBe('v2');
  });

  it('permission catalog бүр module manifest-д яг нэг удаа зарлагдсан', () => {
    const declared = TENANT_MODULES.flatMap((module) => ('permissionCodes' in module ? module.permissionCodes : []));
    expect([...declared].sort()).toEqual([...PERMISSION_CODES].sort());
    expect(new Set(declared).size).toBe(declared.length);
  });

  it('approval, notification, attachment, feed capability төрөл бүр эзэмшигч manifest-д яг нэг удаа зарлагдсан', () => {
    const approvals = TENANT_MODULES.flatMap((module) => ('approvalTypes' in module ? module.approvalTypes ?? [] : []));
    const notifications = TENANT_MODULES.flatMap((module) => ('notificationTypes' in module ? module.notificationTypes ?? [] : []));
    const attachments = TENANT_MODULES.flatMap((module) => ('attachmentTypes' in module ? module.attachmentTypes?.map((t) => t.entityType) ?? [] : []));
    const feedObjects = TENANT_MODULES.flatMap((module) => ('feedObjectTypes' in module ? module.feedObjectTypes ?? [] : []));
    expect(approvals.sort()).toEqual(['CAMP_MEAL_ORDER', 'CAMP_MEAL_ORDER_CHANGE', 'MATERIAL_REQUISITION']);
    expect(notifications.sort()).toEqual([
      'camp.meal_order.change', 'camp.meal_order.reviewed', 'camp.meal_order.submitted',
      'core.approval.decided', 'core.approval.overdue', 'core.approval.requested', 'core.invite.accepted',
      'feed.link.status',
    ]);
    expect(attachments.sort()).toEqual(['CAMP_MAINTENANCE', 'TENANT_LOGO']);
    expect(feedObjects.sort()).toEqual(['CAMP_MAINTENANCE', 'CORE_FEEDBACK']);
    for (const list of [approvals, notifications, attachments, feedObjects]) expect(new Set(list).size).toBe(list.length);
  });

  it('settings, import/export, report, cron, and numbering metadata are declared once', () => {
    const manifests: readonly ModuleManifest[] = TENANT_MODULES;
    const flatten = (key: 'settingsSections' | 'importTypes' | 'exportTypes' | 'reportDatasets' | 'cronJobs') =>
      manifests.flatMap((module) => module[key] ?? []);
    const imports = flatten('importTypes');
    const exports = flatten('exportTypes');
    const settings = flatten('settingsSections');
    const reportDatasets = flatten('reportDatasets');
    const cronJobs = flatten('cronJobs');
    const numberingPatterns = manifests.flatMap((module) => module.numberingPatterns ?? []);

    expect([...imports].sort()).toEqual([
      'building-types', 'buildings', 'departments', 'employees', 'former-employees',
      'positions', 'room-allocations', 'rooms',
    ]);
    expect([...exports].sort()).toEqual([...imports].sort());
    expect([...settings].sort()).toEqual([
      'approval-flows', 'asset-categories', 'attachment-patterns', 'building-types', 'calendars',
      'contract-catalog', 'exchange-rates', 'modules', 'organizations', 'profile', 'roles',
      'security', 'sites', 'translations', 'user-roles',
    ]);
    expect(reportDatasets).toEqual(['summary']);
    expect(cronJobs).toEqual(['outbox-poller', 'notification-mail', 'approval-sla']);
    expect(numberingPatterns).toEqual([
      { key: 'maintenance.request_no', pattern: 'ZAS-{campCode}-{YYYY}-{NNNN}' },
      { key: 'material_requisition.number', pattern: 'MR-{YYYY}-{NNNN}' },
    ]);

    for (const list of [settings, imports, exports, reportDatasets, cronJobs]) {
      expect(new Set(list).size).toBe(list.length);
    }
  });

  it('every declared translation prefix exists in the three web catalogs', () => {
    const manifests: readonly ModuleManifest[] = TENANT_MODULES;
    const catalogs = [mn, en, zh] as const;
    const declaredPrefixes = [...new Set(manifests.flatMap((module) => module.i18nPrefixes ?? []))].sort();
    const catalogPrefixes = [...new Set(Object.keys(mn).map((key) => key.split('.')[0]))].sort();
    expect(declaredPrefixes).toEqual(catalogPrefixes);

    for (const module of manifests) {
      for (const prefix of module.i18nPrefixes ?? []) {
        for (const catalog of catalogs) {
          expect(Object.keys(catalog).some((key) => key.startsWith(`${prefix}.`)), `${module.id}: ${prefix}`).toBe(true);
        }
      }
    }
  });

  it('every term group belongs to one module and exists in all term catalogs', () => {
    const manifests: readonly ModuleManifest[] = TENANT_MODULES;
    const groups = manifests.flatMap((module) => module.termGroups ?? []);
    const actualGroups = Object.keys(termsMn).map((key) => key.split('.')[1]).filter(Boolean);
    expect([...groups].sort()).toEqual([...new Set(actualGroups)].sort());
    expect(new Set(groups).size).toBe(groups.length);
    for (const group of groups) {
      for (const catalog of [termsMn, termsEn, termsZh]) {
        expect(Object.keys(catalog).some((key) => key.startsWith(`term.${group}.`)), group).toBe(true);
      }
    }
  });
});
