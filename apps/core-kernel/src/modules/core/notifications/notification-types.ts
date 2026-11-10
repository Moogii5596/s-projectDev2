/**
 * v0.2.4 Блок 7 (NTF-01) — мэдэгдлийн төрлийн бүртгэл.
 * Модуль бүр өөрийн төрлийг `NotificationTypeRegistry.register()`-ээр бүртгэнэ (onModuleInit). Цөмийн төрлүүд энд.
 * `type` = `<модуль>.<объект>.<үйл явдал>`; `labelKey` = профайлын тохиргоонд харагдах нэр (web.*.json).
 */
export interface NotificationTypeDef {
  type: string;
  /** Модуль идэвхгүй бол профайлд харуулахгүй, мэдэгдэл үүсгэхгүй (`TENANT_MODULES`-ийн id) */
  module: string;
  labelKey: string;
  defaultInApp: boolean;
  defaultEmail: boolean;
}

export const NOTIFICATION_TYPE_RE = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/;

export const CORE_NOTIFICATION_TYPES: readonly NotificationTypeDef[] = [
  { type: 'core.approval.requested', module: 'core', labelKey: 'notify.type.core.approval.requested', defaultInApp: true, defaultEmail: true },
  { type: 'core.approval.decided', module: 'core', labelKey: 'notify.type.core.approval.decided', defaultInApp: true, defaultEmail: true },
  { type: 'core.approval.overdue', module: 'core', labelKey: 'notify.type.core.approval.overdue', defaultInApp: true, defaultEmail: true },
  { type: 'core.invite.accepted', module: 'core', labelKey: 'notify.type.core.invite.accepted', defaultInApp: true, defaultEmail: false },
];
