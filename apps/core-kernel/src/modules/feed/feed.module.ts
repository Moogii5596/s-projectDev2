import { Module } from '@nestjs/common';
import { CampCommonModule } from '../camp/common/camp-common.module';
import { StorageModule } from '../../storage/storage.module';
import { FeedController } from './feed.controller';
import { FeedService } from './feed.service';
import { FeedReportsService } from './feed-reports.service';

/** Feed v0 (v0.2.3 Блок 5, FEED-01) — `feed_*` хүснэгтүүд, зураг StorageModule-оор */
@Module({
  imports: [CampCommonModule, StorageModule],
  controllers: [FeedController],
  providers: [FeedService, FeedReportsService],
  exports: [FeedService],
})
export class FeedModule {}
