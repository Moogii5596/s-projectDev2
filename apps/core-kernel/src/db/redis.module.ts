import { Module, Global, Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

const redisProvider: Provider = {
  provide: REDIS_CLIENT,
  useFactory: (configService: ConfigService) => {
    const redisUrl = configService.get<string>('REDIS_URL', 'redis://localhost:6379');
    const client = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => Math.min(times * 100, 3000),
      lazyConnect: false,
    });

    client.on('connect', () => console.log('✅ Redis connected'));
    client.on('error', (err) => console.error('❌ Redis error:', err.message));

    return client;
  },
  inject: [ConfigService],
};

@Global()
@Module({
  providers: [redisProvider],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
