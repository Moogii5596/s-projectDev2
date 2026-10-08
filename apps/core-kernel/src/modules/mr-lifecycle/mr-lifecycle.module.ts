import { Module } from '@nestjs/common';
import { BudgetModule } from '../budget/budget.module';
import { MrLifecycleService } from './mr-lifecycle.service';

/** Phase 4.0 — MR ↔ Budget (↔ Inventory 4.2) холболт. MaterialRequisitionModule + WorkflowModule импортлоно. */
@Module({
  imports: [BudgetModule],
  providers: [MrLifecycleService],
  exports: [MrLifecycleService],
})
export class MrLifecycleModule {}
