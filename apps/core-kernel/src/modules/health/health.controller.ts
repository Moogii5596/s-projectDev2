import { Controller, Get } from '@nestjs/common';
import { SkipAuth } from '../../common/decorators/skip-auth.decorator';
import { APP_VERSION } from '../../config/app-version';

@Controller('health')
export class HealthController {
  @Get()
  @SkipAuth()
  check() {
    return {
      status: 'ok',
      version: APP_VERSION,
      timestamp: new Date().toISOString(),
    };
  }
}
