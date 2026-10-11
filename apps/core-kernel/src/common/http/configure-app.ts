import { ValidationPipe } from '@nestjs/common';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { registerMultipart } from './multipart';

/**
 * App-ийн HTTP тохиргоо — main.ts болон БҮХ integration тест ЭНИЙГ дуудна [VALID-001]:
 * тестийн app production-оос өөр тохиргоотой байвал (implicit conversion, forbidNonWhitelisted, multipart)
 * production алдаа нуугдана.
 */
export const GLOBAL_PREFIX = 'api/v1';

export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  });
}

export async function configureApp(app: NestFastifyApplication): Promise<void> {
  app.useGlobalPipes(createValidationPipe());
  app.setGlobalPrefix(GLOBAL_PREFIX);
  await registerMultipart(app);
}

/** JSON body-ийн дээд хэмжээ (main.ts FastifyAdapter) — хүснэгтээр оруулах ≤5000 мөр */
export const JSON_BODY_LIMIT = 4 * 1024 * 1024;
