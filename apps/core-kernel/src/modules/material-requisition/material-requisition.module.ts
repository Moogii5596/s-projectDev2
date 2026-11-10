import { Module } from '@nestjs/common';
import { MaterialRequisitionController } from './controllers/material-requisition.controller';
import { MaterialRequisitionService } from './services/material-requisition.service';
import { WorkflowModule } from '../workflow/workflow.module';
import { MrLifecycleModule } from '../mr-lifecycle/mr-lifecycle.module';
import { EventBusModule } from '../event-bus/event-bus.module';
import { CoreModule } from '../core/core.module';

@Module({
  imports: [WorkflowModule, MrLifecycleModule, EventBusModule, CoreModule], // Phase 5.1: EventBusService
  controllers: [MaterialRequisitionController],
  providers: [MaterialRequisitionService],
})
export class MaterialRequisitionModule {}
