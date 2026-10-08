import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { DynamicIngressRouterService } from './dynamic-ingress-router.service';
import type { RouteEntry } from './dynamic-ingress-router.service';

@Injectable()
export class DrainingInterceptor implements NestInterceptor {
  private readonly inflight = new Map<string, number>();

  constructor(private readonly router: DynamicIngressRouterService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req   = context.switchToHttp().getRequest<{ path: string; method: string }>();
    const res   = context.switchToHttp().getResponse<{ setHeader(k: string, v: string): void }>();
    const route = this.router.resolveRoute(req.path);

    if (!route) return next.handle();

    const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);

    if (route.status === 'DRAINING' && isMutation) {
      res.setHeader('Retry-After', '15');
      throw new ServiceUnavailableException({
        code:    'SERVICE_DRAINING',
        message: 'Module is currently updating. Mutations are paused. Retry in 15s.',
      });
    }

    const count = (this.inflight.get(route.target) ?? 0) + 1;
    this.inflight.set(route.target, count);

    return next.handle().pipe(
      tap({
        complete: () => this.decrementInflight(route),
        error:    () => this.decrementInflight(route),
      }),
    );
  }

  private decrementInflight(route: RouteEntry): void {
    const count = (this.inflight.get(route.target) ?? 1) - 1;
    this.inflight.set(route.target, Math.max(0, count));

    if (route.status === 'DRAINING' && count <= 0) {
      const basePath =
        [...this.router.getRoutes().entries()].find(([, v]) => v.target === route.target)?.[0] ?? '';
      if (basePath) this.router.setStatus(basePath, 'OFFLINE');
    }
  }
}
