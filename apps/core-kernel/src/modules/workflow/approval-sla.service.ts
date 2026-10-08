import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../db/prisma.service';

export interface ApprovalSlaReport {
  summary: {
    total: number;
    completed_on_time: number;
    escalated: number;
    overdue: number;
    avg_completion_hours: number;
  };
  by_step: Array<{
    step_order: number;
    role: string;
    avg_hours: number;
    escalation_rate: number;
  }>;
  period: { from: string; to: string };
}

interface StepConfig {
  order?: number;
  role?: string;
}

function getStepConfigs(value: unknown): StepConfig[] {
  if (Array.isArray(value)) return value as StepConfig[];
  if (value && typeof value === 'object' && 'amount_rules' in value) {
    const rules = (value as { amount_rules?: Array<{ steps?: StepConfig[] }> }).amount_rules;
    return rules?.flatMap((rule) => rule.steps ?? []) ?? [];
  }
  return [];
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

@Injectable()
export class ApprovalSlaService {
  constructor(private readonly prisma: PrismaService) {}

  async getReport(tenantId: string, from?: Date, to?: Date): Promise<ApprovalSlaReport> {
    const end = to ?? new Date();
    const start = from ?? new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
    const logs = await this.prisma.workflowSlaLog.findMany({
      where: { tenantId, createdAt: { gte: start, lte: end } },
      include: { instance: { include: { definition: true } } },
      orderBy: { stepOrder: 'asc' },
    });

    const completed = logs.filter((log) => log.status === 'COMPLETED' && log.completedAt);
    const completedOnTime = completed.filter((log) => log.completedAt! <= log.dueAt);
    const completionHours = completed.map((log) =>
      (log.completedAt!.getTime() - log.createdAt.getTime()) / 3_600_000,
    );
    const byStep = new Map<number, typeof logs>();

    for (const log of logs) {
      const entries = byStep.get(log.stepOrder) ?? [];
      entries.push(log);
      byStep.set(log.stepOrder, entries);
    }

    return {
      summary: {
        total: logs.length,
        completed_on_time: completedOnTime.length,
        escalated: logs.filter((log) => log.status === 'ESCALATED').length,
        overdue: logs.filter((log) => log.status === 'OVERDUE' || (log.status === 'PENDING' && log.dueAt < new Date())).length,
        avg_completion_hours: completionHours.length
          ? round(completionHours.reduce((sum, hours) => sum + hours, 0) / completionHours.length)
          : 0,
      },
      by_step: [...byStep.entries()].map(([stepOrder, stepLogs]) => {
        const stepHours = stepLogs
          .filter((log) => log.completedAt)
          .map((log) => (log.completedAt!.getTime() - log.createdAt.getTime()) / 3_600_000);
        const stepConfig = getStepConfigs(stepLogs[0].instance.definition.stepsConfig);
        const role = stepConfig.find((step) => step.order === stepOrder)?.role ?? 'UNKNOWN';
        return {
          step_order: stepOrder,
          role,
          avg_hours: stepHours.length
            ? round(stepHours.reduce((sum, hours) => sum + hours, 0) / stepHours.length)
            : 0,
          escalation_rate: stepLogs.length
            ? round(stepLogs.filter((log) => log.status === 'ESCALATED').length / stepLogs.length)
            : 0,
        };
      }),
      period: { from: start.toISOString(), to: end.toISOString() },
    };
  }
}