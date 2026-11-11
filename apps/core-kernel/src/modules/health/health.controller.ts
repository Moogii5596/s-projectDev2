import { Controller, Get } from '@nestjs/common';
import { SkipAuth } from '../../common/decorators/skip-auth.decorator';
import { APP_VERSION } from '../../config/app-version';

/**
 * Ажиллаж буй build-ийн git commit. Render runtime-д `RENDER_GIT_COMMIT`-ийг автоматаар өгдөг;
 * бусад орчинд `GIT_COMMIT` (сонголттой). «Deploy production» workflow шинэ build ажиллаж эхэлснийг үүгээр шалгана (#15/H8).
 */
export function resolveGitCommit(env: NodeJS.ProcessEnv = process.env): string | null {
  const raw = (env.RENDER_GIT_COMMIT ?? env.GIT_COMMIT ?? '').trim();
  return /^[0-9a-f]{7,40}$/i.test(raw) ? raw.toLowerCase() : null;
}

@Controller('health')
export class HealthController {
  @Get()
  @SkipAuth()
  check() {
    return {
      status: 'ok',
      version: APP_VERSION,
      commit: resolveGitCommit(),
      timestamp: new Date().toISOString(),
    };
  }
}
