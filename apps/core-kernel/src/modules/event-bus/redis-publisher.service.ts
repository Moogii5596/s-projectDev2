import { Injectable, Inject } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../../db/redis.module';
import type { CloudEvent } from './interfaces/cloud-event.interface';

@Injectable()
export class RedisPublisherService {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async publish<T>(event: CloudEvent<T>): Promise<void> {
    // Channel: tenant.{tenantId}.{eventType}
    const channel = `tenant.${event.tenantid}.${event.type}`;
    await this.redis.publish(channel, JSON.stringify(event));
  }
}
