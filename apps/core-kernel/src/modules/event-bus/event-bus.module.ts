import { Module } from '@nestjs/common';
import { EventBusService }      from './event-bus.service';
import { OutboxPollerService }  from './outbox-poller.service';
import { RedisPublisherService } from './redis-publisher.service';
import { DlqService }           from './dlq.service';

@Module({
  providers: [
    EventBusService,
    OutboxPollerService,
    RedisPublisherService,
    DlqService,
  ],
  exports: [EventBusService],
})
export class EventBusModule {}
