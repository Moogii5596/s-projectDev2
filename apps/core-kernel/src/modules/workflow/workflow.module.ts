import { Module }                from '@nestjs/common';
import { EventBusModule }        from '../event-bus/event-bus.module';
import { MrLifecycleModule }     from '../mr-lifecycle/mr-lifecycle.module';
import { IdempotencyService }     from './idempotency.service';
import { AmountRouterService }     from './amount-router.service';
import { DelegationService }       from './delegation.service';
import { ApprovalSlaService }      from './approval-sla.service';
import { ApprovalSlaController }   from './approval-sla.controller';
import { DelegationController }    from './delegation.controller';
import { WorkflowDefinitionController } from './workflow-definition.controller';
import { WorkflowDefinitionService } from './workflow-definition.service';

/**
 * WorkflowModule — Sprint 2
 *
 * Exports:
 *  - (v0.2.4 WF-03) WorkflowService устсан — батлалт цөмийн ApprovalEngineService (core/approvals)
 *  - IdempotencyService → checkAndStore
 */
@Module({
  imports:   [EventBusModule, MrLifecycleModule],
  controllers: [ApprovalSlaController, DelegationController, WorkflowDefinitionController],
  providers: [IdempotencyService, AmountRouterService, DelegationService, ApprovalSlaService, WorkflowDefinitionService],
  exports:   [IdempotencyService, AmountRouterService, DelegationService, ApprovalSlaService],
})
export class WorkflowModule {}
