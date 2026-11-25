import { Module } from '@nestjs/common';
import { PlatformModule } from '../core/platform/platform.module';
import { StorageModule } from '../../storage/storage.module';
import { FeedController } from './feed.controller';
import { FeedService } from './feed.service';
import { FeedReportsService } from './feed-reports.service';
import { FeedLinksService } from './feed-links.service';

/** Feed v0 (v0.2.3 Блок 5, FEED-01) — `feed_*` хүснэгтүүд, зураг StorageModule-оор */
@Module({
  imports: [PlatformModule, StorageModule],
  controllers: [FeedController],
  providers: [FeedService, FeedReportsService, FeedLinksService],
  exports: [FeedService, FeedLinksService],
})
export class FeedModule {}
