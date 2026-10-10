import cluster from 'node:cluster';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { Logger } from '@nestjs/common';
import { AppModule } from './app/app.module';
import { EnvConfig } from './config/env.config';
import { configureApp } from './common/http/configure-app';
import { RestartPolicy, resolveRestartPolicyOptions, startClusterPrimary } from './config/cluster-restart';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: false }),
    { bufferLogs: true },
  );

  // Pipe (implicit conversion, forbidNonWhitelisted), 'api/v1' prefix, multipart — integration тестүүдтэй ИЖИЛ [VALID-001]
  await configureApp(app);

  const config = app.get(EnvConfig);
  const port = config.PORT;

  await app.listen(port, '0.0.0.0');
  logger.log(`🚀 Core Kernel running on port ${port}`);
  logger.log(`📊 Environment: ${config.NODE_ENV}`);
}

const workers = Number.parseInt(process.env.NODE_CLUSTER_WORKERS ?? '1', 10);

if (cluster.isPrimary && workers > 1) {
  console.log(`Master PID ${process.pid} — spawning ${workers} workers`);
  // Phase 3.6.4: crash-loop backoff (config/cluster-restart.ts). Ганц унасан worker → шууд, давтагдвал 1с→30с
  startClusterPrimary(cluster, workers, new RestartPolicy(resolveRestartPolicyOptions()));
} else {
  bootstrap().catch((err) => {
    console.error('Failed to start Core Kernel:', err);
    process.exit(1);
  });
}
