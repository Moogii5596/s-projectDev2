import { Module } from '@nestjs/common';
import { MaterialRequisitionController } from './controllers/material-requisition.controller';
import { MaterialRequisitionService } from './services/material-requisition.service';
import { WorkflowModule } from '../workflow/workflow.module';
import { MrLifecycleModule } from '../mr-lifecycle/mr-lifecycle.module';

@Module({
  imports: [WorkflowModule, MrLifecycleModule],
  controllers: [MaterialRequisitionController],
  providers: [MaterialRequisitionService],
})
export class MaterialRequisitionModule {}
