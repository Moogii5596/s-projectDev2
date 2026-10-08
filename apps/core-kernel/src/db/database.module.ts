import { Module, Global } from '@nestjs/common';
import { PrismaTenantClientService } from './prisma-tenant-client.service';

@Global()
@Module({
  providers: [PrismaTenantClientService],
  exports: [PrismaTenantClientService],
})
export class DatabaseModule {}
