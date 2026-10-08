import { Controller, Get } from '@nestjs/common';
import { SkipAuth } from '../../common/decorators/skip-auth.decorator';

@Controller('health')
export class HealthController {
  @Get()
  @SkipAuth()
  check() {
    return {
      status: 'ok',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
    };
  }
}
