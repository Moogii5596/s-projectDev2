export interface ModuleManifest {
  id: string;
  defaultActive: boolean;
  required: boolean;
  debugOnly: boolean;
  requires: readonly string[];
  apiPrefixes: readonly string[];
  permissionCodes?: readonly string[];
  approvalTypes?: readonly string[];
  notificationTypes?: readonly string[];
  attachmentTypes?: readonly { entityType: string; pii: boolean }[];
  feedObjectTypes?: readonly string[];
  settingsSections?: readonly string[];
  i18nPrefixes?: readonly string[];
  termGroups?: readonly string[];
  auditEntityTypes?: readonly string[];
  importTypes?: readonly string[];
  exportTypes?: readonly string[];
  reportDatasets?: readonly string[];
  cronJobs?: readonly string[];
  numberingPatterns?: readonly { key: string; pattern: string }[];
}

export const TENANT_MODULES = [
  {
    id: 'core', defaultActive: true, required: true, debugOnly: false, requires: [], apiPrefixes: [],
    permissionCodes: [
      'core.debug.view', 'core.debug.manage', 'core.organization.manage', 'core.exchange_rate.manage',
    ],
    notificationTypes: ['core.approval.requested', 'core.approval.decided', 'core.approval.overdue', 'core.invite.accepted'],
    attachmentTypes: [{ entityType: 'TENANT_LOGO', pii: false }],
    feedObjectTypes: ['CORE_FEEDBACK'],
    settingsSections: [
      'profile', 'security', 'modules', 'calendars', 'approval-flows',
      'sites', 'attachment-patterns', 'roles', 'user-roles', 'translations',
    ],
    i18nPrefixes: [
      'access', 'approval', 'audit', 'auth', 'common', 'core', 'debug', 'delegation', 'devices', 'feedback', 'files',
      'nav', 'notify', 'perm', 'profile', 'settings', 'whatsnew',
    ],
    termGroups: ['approval', 'attachment', 'calendar', 'currency', 'feedback', 'notification', 'permission', 'role', 'site', 'user'],
    auditEntityTypes: [
      'tenant_settings', 'installed_module', 'holiday_calendar', 'calendar_holiday',
      'approval_definition', 'approval_delegation', 'site', 'attachment_name_pattern',
      'debug_action', 'user_account', 'user_invite',
    ],
    cronJobs: ['outbox-poller', 'notification-mail', 'approval-sla'],
  },
  {
    id: 'hr', defaultActive: true, required: false, debugOnly: false, requires: [], apiPrefixes: ['/hr'],
    permissionCodes: ['hr.employee.manage', 'hr.employee.terminate', 'hr.attendance.import', 'hr.shift.adjust'],
    i18nPrefixes: ['hr'],
    termGroups: ['attendance', 'crew', 'department', 'employee', 'position', 'roster', 'shift'],
    auditEntityTypes: ['employee', 'department', 'crew', 'position_setting'],
    importTypes: ['employees', 'former-employees', 'departments', 'positions'],
    exportTypes: ['employees', 'former-employees', 'departments', 'positions'],
  },
  {
    id: 'camp', defaultActive: true, required: false, debugOnly: false, requires: ['hr'], apiPrefixes: ['/camp'],
    permissionCodes: [
      'camp.settings.manage', 'camp.master.manage', 'camp.contract.manage', 'camp.room.manage',
      'camp.asset.manage', 'camp.maintenance.create', 'camp.maintenance.parts', 'camp.maintenance.close',
      'camp.haul.create', 'camp.haul.approve', 'camp.meal.order', 'camp.meal.accept', 'camp.report.view',
    ],
    approvalTypes: ['CAMP_MEAL_ORDER', 'CAMP_MEAL_ORDER_CHANGE'],
    notificationTypes: ['camp.meal_order.submitted', 'camp.meal_order.reviewed', 'camp.meal_order.change'],
    attachmentTypes: [{ entityType: 'CAMP_MAINTENANCE', pii: false }],
    feedObjectTypes: ['CAMP_MAINTENANCE'],
    settingsSections: ['organizations', 'contract-catalog', 'exchange-rates', 'building-types', 'asset-categories'],
    i18nPrefixes: ['camp'],
    termGroups: [
      'asset', 'building', 'camp', 'contract', 'exchange_rate', 'invoice', 'maintenance_request', 'meal',
      'meal_location', 'organization', 'payment', 'room', 'service_type', 'spare_part', 'unit',
    ],
    auditEntityTypes: ['building', 'room', 'role', 'role_apply', 'user_role', 'user_permission', 'position_template'],
    importTypes: ['building-types', 'buildings', 'rooms', 'room-allocations'],
    exportTypes: ['building-types', 'buildings', 'rooms', 'room-allocations'],
    numberingPatterns: [{ key: 'maintenance.request_no', pattern: 'ZAS-{campCode}-{YYYY}-{NNNN}' }],
  },
  {
    id: 'feed', defaultActive: true, required: false, debugOnly: false, requires: [], apiPrefixes: ['/core/feed'],
    permissionCodes: ['feed.content.moderate'],
    notificationTypes: ['feed.link.status'],
    i18nPrefixes: ['feed'],
  },
  {
    id: 'mr', defaultActive: false, required: false, debugOnly: true, requires: [], apiPrefixes: ['/requisitions'],
    permissionCodes: ['mr.request.approve'],
    approvalTypes: ['MATERIAL_REQUISITION'],
    numberingPatterns: [{ key: 'material_requisition.number', pattern: 'MR-{YYYY}-{NNNN}' }],
  },
  { id: 'workflow', defaultActive: false, required: false, debugOnly: true, requires: [], apiPrefixes: ['/workflow', '/reports/approval-sla'], termGroups: ['workflow'] },
  { id: 'budget', defaultActive: false, required: false, debugOnly: true, requires: [], apiPrefixes: ['/budget'] },
  { id: 'inventory', defaultActive: false, required: false, debugOnly: true, requires: [], apiPrefixes: ['/inventory'] },
  { id: 'vendors', defaultActive: false, required: false, debugOnly: true, requires: [], apiPrefixes: ['/vendors'], termGroups: ['vendor'] },
  { id: 'reports', defaultActive: false, required: false, debugOnly: true, requires: [], apiPrefixes: ['/reports'], reportDatasets: ['summary'], termGroups: ['report'] },
  // v0.2.4 Q17/Q18: route-ingress (`/routes`) = MFE-ийн route бүртгэл — Debug-аас гадна хаалттай
  { id: 'mfe', defaultActive: false, required: false, debugOnly: true, requires: [], apiPrefixes: ['/routes'] },
] as const satisfies readonly ModuleManifest[];

export type TenantModuleId = (typeof TENANT_MODULES)[number]['id'];

export function isTenantModuleId(value: string): value is TenantModuleId {
  return TENANT_MODULES.some((module) => module.id === value);
}

export function getModuleManifest(id: string): ModuleManifest | undefined {
  return TENANT_MODULES.find((module) => module.id === id);
}

export function moduleForApiPath(path: string): TenantModuleId | undefined {
  const matches = TENANT_MODULES.flatMap((module) =>
    module.apiPrefixes.map((prefix) => ({ id: module.id, prefix })),
  ).sort((a, b) => b.prefix.length - a.prefix.length);
  return matches.find(({ prefix }) => path === prefix || path.startsWith(`${prefix}/`))?.id;
}
