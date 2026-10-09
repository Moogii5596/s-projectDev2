import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import fastifyMultipart from '@fastify/multipart';

/** Файл upload (Camp ирцийн xlsx, Шат 3). main.ts болон integration тестийн app-д ИЖИЛ тохиргоогоор бүртгэнэ. */
export const UPLOAD_MAX_BYTES = 2 * 1024 * 1024;

export async function registerMultipart(app: NestFastifyApplication): Promise<void> {
  await app.register(fastifyMultipart as never, { limits: { fileSize: UPLOAD_MAX_BYTES, files: 1, fields: 5 } });
}
