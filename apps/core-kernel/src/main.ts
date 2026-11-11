// v0.2.5 H3 (#18): Sentry — бусад модулиас ӨМНӨ (SENTRY_DSN хоосон бол юу ч хийхгүй)
import { sentryEnabled } from './instrument';
import cluster from 'node:cluster';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { Logger } from '@nestjs/common';
import { SentryGlobalFilter } from '@sentry/nestjs/setup';
import { AppModule } from './app/app.module';
import { EnvConfig, resolveClusterWorkers } from './config/env.config';
import { configureApp, JSON_BODY_LIMIT } from './common/http/configure-app';
import { RecentLogLogger } from './common/logging/recent-log.logger';
import { RestartPolicy, resolveRestartPolicyOptions, startClusterPrimary } from './config/cluster-restart';
import { parseCorsOrigins, parseTrustProxy } from './config/cloud-http';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    // v0.2.0 §0.5: "Хүснэгтээр оруулах" (≤5000 мөр JSON) — анхдагч 1 MB хүрэхгүй
    // v0.2.5 H3: TRUST_PROXY — Render-ийн proxy-ийн ард бодит IP (sign-in IP хязгаар)
    // Fastify нь hop тоог (number) дэмждэг; Nest-ийн төрөлд number байхгүй тул cast
    new FastifyAdapter({ logger: false, bodyLimit: JSON_BODY_LIMIT, trustProxy: parseTrustProxy(process.env['TRUST_PROXY']) as boolean }),
    // abortOnError: false → эхлэлийн алдаа доорх catch-д ирж stderr-д заавал хэвлэгдэнэ (Render-д чимээгүй exit 1 ✖)
    { bufferLogs: true, abortOnError: false },
  );
  // v0.2.4 DBG-01: error/warn → Debug цэсний «Лог» (санах ойн буфер, нууцлалтай); v0.2.5 H3: LOG_FORMAT=json
  app.useLogger(RecentLogLogger.create());

  // v0.2.5 H3: Vercel (өөр домэйн) → Render API. Хоосон = same-origin (dev proxy, пилот Caddy)
  const corsOrigins = parseCorsOrigins(process.env['CORS_ORIGINS']);
  if (corsOrigins.length) {
    app.enableCors({ origin: corsOrigins, credentials: false, exposedHeaders: ['x-request-id'], maxAge: 600 });
  }

  // Pipe (implicit conversion, forbidNonWhitelisted), 'api/v1' prefix, multipart — integration тестүүдтэй ИЖИЛ [VALID-001]
  await configureApp(app);

  // v0.2.5 H3: 5xx / барьж аваагүй алдаа → Sentry (HttpException 4xx илгээхгүй)
  if (sentryEnabled()) app.useGlobalFilters(new SentryGlobalFilter(app.getHttpAdapter()));

  const config = app.get(EnvConfig);
  const port = config.PORT;

  await app.listen(port, '0.0.0.0');
  logger.log(`🚀 Core Kernel running on port ${port}`);
  logger.log(`📊 Environment: ${config.NODE_ENV}`);
}

const logger = new Logger('Bootstrap');
const workers = resolveClusterWorkers();

if (cluster.isPrimary && workers > 1) {
  logger.log(`Master PID ${process.pid} — spawning ${workers} workers`);
  // Phase 3.6.4: crash-loop backoff (config/cluster-restart.ts). Ганц унасан worker → шууд, давтагдвал 1с→30с
  startClusterPrimary(cluster, workers, new RestartPolicy(resolveRestartPolicyOptions()));
} else {
  // bufferLogs: true үед Nest Logger useLogger()-ээс өмнө санах ойд хуримтлагддаг → эхлэлийн алдааг console.error-оор шууд
  const fatal = (label: string) => (err: unknown) => {
    // eslint-disable-next-line no-console
    console.error(`[Bootstrap] ${label}:`, err instanceof Error ? err.stack : String(err));
    logger.error(label, err instanceof Error ? err.stack : String(err));
    process.exit(1);
  };
  process.on('uncaughtException', fatal('Uncaught exception'));
  process.on('unhandledRejection', fatal('Unhandled rejection'));
  bootstrap().catch(fatal('Failed to start Core Kernel'));
}
