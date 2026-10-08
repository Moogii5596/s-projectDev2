import { Module }                from '@nestjs/common';
import { EventBusModule }        from '../event-bus/event-bus.module';
import { WorkflowService }        from './workflow.service';
import { PessimisticLockService } from './pessimistic-lock.service';
import { IdempotencyService }     from './idempotency.service';
import { AmountRouterService }     from './amount-router.service';
import { DelegationService }       from './delegation.service';
import { EscalationScheduler }     from './escalation.scheduler';
import { ApprovalSlaService }      from './approval-sla.service';
import { ApprovalSlaController }   from './approval-sla.controller';
import { DelegationController }    from './delegation.controller';
import { WorkflowDefinitionController } from './workflow-definition.controller';
import { WorkflowDefinitionService } from './workflow-definition.service';

/**
 * WorkflowModule — Sprint 2
 *
 * Exports:
 *  - WorkflowService   → createInstance, approveStep, rejectStep
 *  - IdempotencyService → checkAndStore
 */
@Module({
  imports:   [EventBusModule],
  controllers: [ApprovalSlaController, DelegationController, WorkflowDefinitionController],
  providers: [WorkflowService, PessimisticLockService, IdempotencyService, AmountRouterService, DelegationService, EscalationScheduler, ApprovalSlaService, WorkflowDefinitionService],
  exports:   [WorkflowService, IdempotencyService, AmountRouterService, DelegationService, ApprovalSlaService],
})
export class WorkflowModule {}
