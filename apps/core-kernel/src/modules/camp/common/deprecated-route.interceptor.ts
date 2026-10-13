import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import type { Observable } from 'rxjs';

/**
 * v0.2.2 H1 (ADR-006 §5.1, H-Q4) — хуучин `/api/v1/camp/...` HR/Core замууд нэг хувилбар давхар ажиллана.
 * Хариунд `Deprecation: true` (RFC 9745) тавина; v0.2.3-т эдгээр замыг устгана.
 */
@Injectable()
export class DeprecatedRouteInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    context.switchToHttp().getResponse<FastifyReply>().header('Deprecation', 'true');
    return next.handle();
  }
}
