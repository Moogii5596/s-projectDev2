import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tenantStorage } from '../db/prisma-tenant-client.service';

@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user?.tenantId || !user?.id) {
      // Auth guard аль хэдийн шалгасан тул энд хүрэхгүй
      return next.handle();
    }

    return new Observable((observer) => {
      tenantStorage.run(
        { tenantId: user.tenantId, userId: user.id },
        () => {
          next.handle().subscribe({
            next: (value) => observer.next(value),
            error: (err) => observer.error(err),
            complete: () => observer.complete(),
          });
        },
      );
    });
  }
}
