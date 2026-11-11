import { Controller, Get } from '@nestjs/common';
import { SkipAuth } from '../../common/decorators/skip-auth.decorator';
import { APP_VERSION } from '../../config/app-version';

/** Deploy-ийн commit (Render `RENDER_GIT_COMMIT`, бусад `GIT_COMMIT`) — «Deploy production» workflow шинэ хувилбар асасныг үүгээр шалгана */
export const deployedCommit = (env: Record<string, string | undefined> = process.env): string | null =>
  (env['GIT_COMMIT'] ?? env['RENDER_GIT_COMMIT'] ?? '').trim().slice(0, 40) || null;

@Controller('health')
export class HealthController {
  @Get()
  @SkipAuth()
  check() {
    return {
      status: 'ok',
      version: APP_VERSION,
      commit: deployedCommit(),
      timestamp: new Date().toISOString(),
    };
  }
}
