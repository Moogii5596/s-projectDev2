import { Injectable } from '@nestjs/common';

export interface WorkflowStep {
  order: number;
  role: string;
  quorum: number;
}

export interface AmountRule {
  min: number;
  max: number | null;
  steps: WorkflowStep[];
}

@Injectable()
export class AmountRouterService {
  resolveStepsFromConfig(totalAmount: number, config: unknown): WorkflowStep[] {
    if (Array.isArray(config)) return config as WorkflowStep[];
    if (config && typeof config === 'object' && 'amount_rules' in config) {
      const rules = (config as { amount_rules?: AmountRule[] }).amount_rules ?? [];
      return this.resolveSteps(totalAmount, rules);
    }
    return [];
  }

  resolveSteps(totalAmount: number, amountRules: AmountRule[]): WorkflowStep[] {
    const sortedRules = [...amountRules].sort((left, right) => left.min - right.min);

    for (const rule of sortedRules) {
      const withinMinimum = totalAmount >= rule.min;
      const withinMaximum = rule.max === null || totalAmount < rule.max;

      if (withinMinimum && withinMaximum) {
        return rule.steps;
      }
    }

    return sortedRules[sortedRules.length - 1]?.steps ?? [];
  }

  calculateTotalAmount(items: Array<{ quantity: number; unitPrice: number }>): number {
    return items.reduce((total, item) => total + item.quantity * item.unitPrice, 0);
  }
}