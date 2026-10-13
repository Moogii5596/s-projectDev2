import { Module } from '@nestjs/common';
import { CampCommonModule } from '../camp/common/camp-common.module';
import { CoreOrganizationsController } from './organizations/core-organizations.controller';
import { CoreOrganizationsService } from './organizations/core-organizations.service';

/** Core — бүх модулийн суурь өгөгдөл: байгууллагууд (v0.2.2 H1, ADR-006). Хүснэгт `camp_organizations` (v0.3 хүртэл). */
@Module({
  imports: [CampCommonModule],
  controllers: [CoreOrganizationsController],
  providers: [CoreOrganizationsService],
  exports: [CoreOrganizationsService],
})
export class CoreModule {}
