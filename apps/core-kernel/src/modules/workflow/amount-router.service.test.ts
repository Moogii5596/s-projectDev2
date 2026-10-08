import { AmountRouterService, AmountRule } from './amount-router.service';

describe('AmountRouterService', () => {
  const rules: AmountRule[] = [
    { min: 0, max: 1_000_000, steps: [{ order: 1, role: 'DEPT_MANAGER', quorum: 1 }] },
    {
      min: 1_000_000,
      max: 10_000_000,
      steps: [
        { order: 1, role: 'DEPT_MANAGER', quorum: 1 },
        { order: 2, role: 'FINANCE_MANAGER', quorum: 1 },
      ],
    },
    {
      min: 10_000_000,
      max: null,
      steps: [
        { order: 1, role: 'DEPT_MANAGER', quorum: 1 },
        { order: 2, role: 'FINANCE_MANAGER', quorum: 1 },
        { order: 3, role: 'CEO', quorum: 1 },
      ],
    },
  ];

  it('resolves one, two, and three-step workflows by amount', () => {
    const service = new AmountRouterService();

    expect(service.resolveSteps(999_999, rules)).toHaveLength(1);
    expect(service.resolveSteps(5_000_000, rules)).toHaveLength(2);
    expect(service.resolveSteps(15_000_000, rules)).toHaveLength(3);
  });

  it('resolves amount-rule workflow configuration for MR totals', () => {
    const service = new AmountRouterService();
    const config = { amount_rules: rules };

    expect(service.resolveStepsFromConfig(1_000_000, config)).toHaveLength(2);
    expect(service.resolveStepsFromConfig(5_000_000, config)).toHaveLength(2);
    expect(service.resolveStepsFromConfig(15_000_000, config)).toHaveLength(3);
  });

  it('treats null max as an unbounded upper range', () => {
    const service = new AmountRouterService();

    expect(service.resolveSteps(Number.MAX_SAFE_INTEGER, rules)[2].role).toBe('CEO');
  });

  it('falls back to the highest rule when no range matches', () => {
    const service = new AmountRouterService();
    const unmatchedRules: AmountRule[] = [
      { min: 100, max: 200, steps: rules[0].steps },
      { min: 300, max: 400, steps: rules[2].steps },
    ];

    expect(service.resolveSteps(0, unmatchedRules)).toEqual(rules[2].steps);
  });

  it('calculates the total amount from quantity and unit price', () => {
    const service = new AmountRouterService();

    expect(service.calculateTotalAmount([
      { quantity: 2, unitPrice: 1250 },
      { quantity: 3, unitPrice: 500 },
    ])).toBe(4000);
  });
});