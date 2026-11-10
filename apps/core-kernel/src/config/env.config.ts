import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import { DeploymentConfig, parseDeploymentConfig } from './deployment-mode';
import { parseRateLimitConfig } from './rate-limit';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  NODE_CLUSTER_WORKERS: z.preprocess((value) => value === '' ? undefined : value, z.coerce.number().int().positive().default(1)),
  DATABASE_URL: z.string().url(),
  SYSTEM_DATABASE_URL: z.string().url(),
  DIRECT_URL: z.string().url(),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SUPABASE_ANON_KEY: z.string().min(1),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  JWT_SECRET: z.string().min(32),
  DEV_TENANT_SLUG: z.preprocess(
    (value) => typeof value === 'string' && !value.trim() ? undefined : value,
    z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).default('test-tenant'),
  ),
  PRISMA_LOG_LEVELS: z.string().optional(),
  OUTBOX_POLLER_CRON: z.string().optional(),
  ESCALATION_CRON: z.string().optional(),
  NOTIFICATION_MAIL_CRON: z.string().optional(),
  DEBUG_MENU_ENABLED: z.preprocess(
    (value) => {
      if (value === undefined || value === '') return undefined;
      if (typeof value !== 'string') return value;
      const normalized = value.trim().toLowerCase();
      if (normalized === 'true') return true;
      if (normalized === 'false') return false;
      return value;
    },
    z.boolean().default(false),
  ),
});

export type Env = z.infer<typeof EnvSchema>;

@Injectable()
export class EnvConfig {
  private readonly env: Env;
  private readonly deployment: DeploymentConfig;

  constructor(private readonly configService: ConfigService) {
    const result = EnvSchema.safeParse({
      NODE_ENV: this.configService?.get('NODE_ENV') ?? process.env['NODE_ENV'],
      PORT: this.configService?.get('PORT') ?? process.env['PORT'],
      NODE_CLUSTER_WORKERS: this.configService?.get('NODE_CLUSTER_WORKERS') ?? process.env['NODE_CLUSTER_WORKERS'],
      DATABASE_URL: this.configService?.get('DATABASE_URL') ?? process.env['DATABASE_URL'],
      SYSTEM_DATABASE_URL: this.configService?.get('SYSTEM_DATABASE_URL') ?? process.env['SYSTEM_DATABASE_URL'],
      DIRECT_URL: this.configService?.get('DIRECT_URL') ?? process.env['DIRECT_URL'],
      SUPABASE_URL: this.configService?.get('SUPABASE_URL') ?? process.env['SUPABASE_URL'],
      SUPABASE_SERVICE_ROLE_KEY: this.configService?.get('SUPABASE_SERVICE_ROLE_KEY') ?? process.env['SUPABASE_SERVICE_ROLE_KEY'],
      SUPABASE_ANON_KEY: this.configService?.get('SUPABASE_ANON_KEY') ?? process.env['SUPABASE_ANON_KEY'],
      REDIS_URL: this.configService?.get('REDIS_URL') ?? process.env['REDIS_URL'],
      JWT_SECRET: this.configService?.get('JWT_SECRET') ?? process.env['JWT_SECRET'],
      DEV_TENANT_SLUG: this.configService?.get('DEV_TENANT_SLUG') ?? process.env['DEV_TENANT_SLUG'],
      PRISMA_LOG_LEVELS: this.configService?.get('PRISMA_LOG_LEVELS') ?? process.env['PRISMA_LOG_LEVELS'],
      OUTBOX_POLLER_CRON: this.configService?.get('OUTBOX_POLLER_CRON') ?? process.env['OUTBOX_POLLER_CRON'],
      ESCALATION_CRON: this.configService?.get('ESCALATION_CRON') ?? process.env['ESCALATION_CRON'],
      NOTIFICATION_MAIL_CRON: this.configService?.get('NOTIFICATION_MAIL_CRON') ?? process.env['NOTIFICATION_MAIL_CRON'],
      DEBUG_MENU_ENABLED: this.configService?.get('DEBUG_MENU_ENABLED') ?? process.env['DEBUG_MENU_ENABLED'],
    });

    if (!result.success) {
      const missing = result.error.issues
        .map((i) => `  ❌ ${i.path.join('.')}: ${i.message}`)
        .join('\n');
      throw new Error(`Environment variable validation failed:\n${missing}`);
    }

    this.env = result.data;

    // ADR-001: DEPLOYMENT_MODE=shared|dedicated (+ DEDICATED_TENANT_SLUG)
    try {
      this.deployment = parseDeploymentConfig({
        DEPLOYMENT_MODE: this.configService?.get('DEPLOYMENT_MODE') ?? process.env['DEPLOYMENT_MODE'],
        DEDICATED_TENANT_SLUG:
          this.configService?.get('DEDICATED_TENANT_SLUG') ?? process.env['DEDICATED_TENANT_SLUG'],
      });
    } catch (err) {
      throw new Error(`Environment variable validation failed:\n  ❌ ${(err as Error).message}`);
    }

    // Phase 3.1: RATE_LIMIT_* — буруу утга бол startup дээр зогсоно (guard ч ижил функц ашиглана)
    try {
      parseRateLimitConfig({
        RATE_LIMIT_SHORT: this.configService?.get('RATE_LIMIT_SHORT') ?? process.env['RATE_LIMIT_SHORT'],
        RATE_LIMIT_MEDIUM: this.configService?.get('RATE_LIMIT_MEDIUM') ?? process.env['RATE_LIMIT_MEDIUM'],
        RATE_LIMIT_LONG: this.configService?.get('RATE_LIMIT_LONG') ?? process.env['RATE_LIMIT_LONG'],
      });
    } catch (err) {
      throw new Error(`Environment variable validation failed:\n  ❌ ${(err as Error).message}`);
    }
  }

  get NODE_ENV() { return this.env.NODE_ENV; }
  get PORT() { return this.env.PORT; }
  get NODE_CLUSTER_WORKERS() { return this.env.NODE_CLUSTER_WORKERS; }
  get DATABASE_URL() { return this.env.DATABASE_URL; }
  get SYSTEM_DATABASE_URL() { return this.env.SYSTEM_DATABASE_URL; }
  get DIRECT_URL() { return this.env.DIRECT_URL; }
  get SUPABASE_URL() { return this.env.SUPABASE_URL; }
  get SUPABASE_SERVICE_ROLE_KEY() { return this.env.SUPABASE_SERVICE_ROLE_KEY; }
  get SUPABASE_ANON_KEY() { return this.env.SUPABASE_ANON_KEY; }
  get REDIS_URL() { return this.env.REDIS_URL; }
  get JWT_SECRET() { return this.env.JWT_SECRET; }
  get DEV_TENANT_SLUG() { return this.env.DEV_TENANT_SLUG; }
  get PRISMA_LOG_LEVELS() { return this.env.PRISMA_LOG_LEVELS; }
  get OUTBOX_POLLER_CRON() { return this.env.OUTBOX_POLLER_CRON; }
  get ESCALATION_CRON() { return this.env.ESCALATION_CRON; }
  get DEBUG_MENU_ENABLED() { return this.env.DEBUG_MENU_ENABLED; }
  get isProduction() { return this.env.NODE_ENV === 'production'; }
  get isDevelopment() { return this.env.NODE_ENV === 'development'; }
  get isTest() { return this.env.NODE_ENV === 'test'; }
  get DEPLOYMENT_MODE() { return this.deployment.mode; }
  get DEDICATED_TENANT_SLUG() { return this.deployment.dedicatedTenantSlug; }
  get isDedicated() { return this.deployment.mode === 'dedicated'; }
}

const ClusterWorkersSchema = z.preprocess(
  (value) => value === '' ? undefined : value,
  z.coerce.number().int().positive().default(1),
);

export function resolveClusterWorkers(raw: string | undefined = process.env['NODE_CLUSTER_WORKERS']): number {
  return ClusterWorkersSchema.parse(raw);
}
