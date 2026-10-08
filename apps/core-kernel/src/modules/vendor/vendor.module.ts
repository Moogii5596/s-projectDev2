import { Module } from '@nestjs/common';
import { VendorController } from './vendor.controller';
import { VendorService } from './vendor.service';

/** Phase 4.3 — Vendor-lite */
@Module({ controllers: [VendorController], providers: [VendorService], exports: [VendorService] })
export class VendorModule {}
