import { Injectable, ConflictException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

export interface ModuleManifest {
  module_id:    string;
  version:      string;
  dependencies: string[];
  api_routes: {
    base_path:    string;
    target_port:  number;
    target_host?: string;
  };
  permissions: string[];
}

export type RouteStatus = 'ACTIVE' | 'DRAINING' | 'OFFLINE';

export interface RouteEntry {
  target:       string;
  status:       RouteStatus;
  moduleId:     string;
  registeredAt: Date;
}

@Injectable()
export class DynamicIngressRouterService {
  private readonly routes = new Map<string, RouteEntry>();

  constructor(private readonly events: EventEmitter2) {}

  registerModule(manifest: ModuleManifest): void {
    const target =
      manifest.api_routes.target_host ??
      `http://svc-${manifest.module_id}:${manifest.api_routes.target_port}`;

    const existing = this.routes.get(manifest.api_routes.base_path);
    if (existing && existing.status !== 'OFFLINE') {
      throw new ConflictException(
        `CONFLICT: Route prefix ${manifest.api_routes.base_path} is already claimed by ${existing.moduleId}.`,
      );
    }

    this.routes.set(manifest.api_routes.base_path, {
      target,
      status:       'ACTIVE',
      moduleId:     manifest.module_id,
      registeredAt: new Date(),
    });

    this.events.emit('gateway.route.updated', { manifest, target });
  }

  resolveRoute(path: string): RouteEntry | undefined {
    for (const [prefix, entry] of this.routes.entries()) {
      if (path.startsWith(prefix)) return entry;
    }
    return undefined;
  }

  setStatus(basePath: string, status: RouteStatus): void {
    const entry = this.routes.get(basePath);
    if (entry) {
      entry.status = status;
      if (status === 'DRAINING') {
        this.events.emit('gateway.route.draining', {
          basePath,
          moduleId: entry.moduleId,
        });
      }
    }
  }

  getRoutes(): Map<string, RouteEntry> {
    return this.routes;
  }
}
