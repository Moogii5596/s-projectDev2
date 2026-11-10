import { Injectable } from '@nestjs/common';
import { getModuleManifest } from '../modules/module-registry';
import { CORE_NOTIFICATION_TYPES, NOTIFICATION_TYPE_RE, type NotificationTypeDef } from './notification-types';

/** Мэдэгдлийн төрлийн runtime бүртгэл — модуль бүр өөрийн төрлөө нэмнэ (цөмийн кодыг өөрчлөхгүй). */
@Injectable()
export class NotificationTypeRegistry {
  private readonly types = new Map<string, NotificationTypeDef>();

  constructor() {
    for (const def of CORE_NOTIFICATION_TYPES) this.register(def);
  }

  register(def: NotificationTypeDef): void {
    if (!NOTIFICATION_TYPE_RE.test(def.type)) throw new Error(`Notification type буруу: ${def.type}`);
    const manifest = getModuleManifest(def.module);
    if (!manifest) throw new Error(`Notification module manifest-д байхгүй: ${def.module}`);
    if (!manifest.notificationTypes?.includes(def.type)) throw new Error(`Notification type manifest-д бүртгэгдээгүй: ${def.type}`);
    const existing = this.types.get(def.type);
    if (existing && existing.module !== def.module) throw new Error(`Notification type давхардсан: ${def.type}`);
    this.types.set(def.type, def);
  }

  get(type: string): NotificationTypeDef | undefined {
    return this.types.get(type);
  }

  list(): NotificationTypeDef[] {
    return [...this.types.values()].sort((a, b) => a.type.localeCompare(b.type));
  }
}
