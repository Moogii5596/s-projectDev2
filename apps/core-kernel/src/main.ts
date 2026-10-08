import cluster from 'node:cluster';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app/app.module';
import { EnvConfig } from './config/env.config';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: false }),
    { bufferLogs: true },
  );

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.setGlobalPrefix('api/v1');

  const config = app.get(EnvConfig);
  const port = config.PORT;

  await app.listen(port, '0.0.0.0');
  logger.log(`🚀 Core Kernel running on port ${port}`);
  logger.log(`📊 Environment: ${config.NODE_ENV}`);
}

const workers = Number.parseInt(process.env.NODE_CLUSTER_WORKERS ?? '1', 10);

if (cluster.isPrimary && workers > 1) {
  console.log(`Master PID ${process.pid} — spawning ${workers} workers`);
  for (let index = 0; index < workers; index += 1) cluster.fork();
  // Phase 3.4: apps/e2e/tests/cluster-check.ts энэ мөрөөр worker-уудыг танина
  cluster.on('online', (worker) => console.log(`Worker ${worker.process.pid} online`));
  cluster.on('exit', (worker) => {
    console.warn(`Worker ${worker.process.pid} died — restarting`);
    cluster.fork();
  });
} else {
  bootstrap().catch((err) => {
    console.error('Failed to start Core Kernel:', err);
    process.exit(1);
  });
}
