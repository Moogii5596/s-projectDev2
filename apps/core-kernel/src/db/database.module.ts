import { Module, Global } from '@nestjs/common';
import { PrismaTenantClientService } from './prisma-tenant-client.service';
import { SystemPrismaService } from './system-prisma.service';

@Global()
@Module({
  // Phase 4.8.4: SystemPrismaService — tenant-ээс өмнөх / бүх tenant-ийн ажил (SYSTEM_DATABASE_URL)
  providers: [PrismaTenantClientService, SystemPrismaService],
  exports: [PrismaTenantClientService, SystemPrismaService],
})
export class DatabaseModule {}
