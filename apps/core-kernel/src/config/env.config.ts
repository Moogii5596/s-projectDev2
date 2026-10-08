import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
  DIRECT_URL: z.string().url(),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SUPABASE_ANON_KEY: z.string().min(1),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  JWT_SECRET: z.string().min(32),
});

export type Env = z.infer<typeof EnvSchema>;

@Injectable()
export class EnvConfig {
  private readonly env: Env;

  constructor(private readonly configService: ConfigService) {
    const result = EnvSchema.safeParse({
      NODE_ENV: this.configService?.get('NODE_ENV') ?? process.env['NODE_ENV'],
      PORT: this.configService?.get('PORT') ?? process.env['PORT'],
      DATABASE_URL: this.configService?.get('DATABASE_URL') ?? process.env['DATABASE_URL'],
      DIRECT_URL: this.configService?.get('DIRECT_URL') ?? process.env['DIRECT_URL'],
      SUPABASE_URL: this.configService?.get('SUPABASE_URL') ?? process.env['SUPABASE_URL'],
      SUPABASE_SERVICE_ROLE_KEY: this.configService?.get('SUPABASE_SERVICE_ROLE_KEY') ?? process.env['SUPABASE_SERVICE_ROLE_KEY'],
      SUPABASE_ANON_KEY: this.configService?.get('SUPABASE_ANON_KEY') ?? process.env['SUPABASE_ANON_KEY'],
      REDIS_URL: this.configService?.get('REDIS_URL') ?? process.env['REDIS_URL'],
      JWT_SECRET: this.configService?.get('JWT_SECRET') ?? process.env['JWT_SECRET'],
    });

    if (!result.success) {
      const missing = result.error.issues
        .map((i) => `  ❌ ${i.path.join('.')}: ${i.message}`)
        .join('\n');
      throw new Error(`Environment variable validation failed:\n${missing}`);
    }

    this.env = result.data;
  }

  get NODE_ENV() { return this.env.NODE_ENV; }
  get PORT() { return this.env.PORT; }
  get DATABASE_URL() { return this.env.DATABASE_URL; }
  get DIRECT_URL() { return this.env.DIRECT_URL; }
  get SUPABASE_URL() { return this.env.SUPABASE_URL; }
  get SUPABASE_SERVICE_ROLE_KEY() { return this.env.SUPABASE_SERVICE_ROLE_KEY; }
  get SUPABASE_ANON_KEY() { return this.env.SUPABASE_ANON_KEY; }
  get REDIS_URL() { return this.env.REDIS_URL; }
  get JWT_SECRET() { return this.env.JWT_SECRET; }
  get isProduction() { return this.env.NODE_ENV === 'production'; }
  get isDevelopment() { return this.env.NODE_ENV === 'development'; }
  get isTest() { return this.env.NODE_ENV === 'test'; }
}
