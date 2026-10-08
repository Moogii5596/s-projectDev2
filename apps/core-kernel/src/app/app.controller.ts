import { Controller, Get } from '@nestjs/common';
import { SkipAuth } from '../common/decorators/skip-auth.decorator';

@Controller()
export class AppController {
  /**
   * Kubernetes liveness probe — auth шаардахгүй, маш хурдан хариулна.
   * Full health check → GET /api/v1/health (HealthController)
   */
  @Get('healthz')
  @SkipAuth()
  healthz() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
