/**
 * Phase 4.9.1 [SEC-003] — WorkflowDefinitionDto / stepsConfigError
 */
import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { stepsConfigError, WorkflowDefinitionDto } from './workflow-definition.dto';

const errs = (body: object) =>
  validateSync(plainToInstance(WorkflowDefinitionDto, body), { whitelist: true, forbidNonWhitelisted: true })
    .flatMap((e) => Object.values(e.constraints ?? {}));

const RULES = {
  amount_rules: [
    { min: 0, max: 1_000_000, steps: [{ order: 1, role: 'APPROVER', quorum: 1 }] },
    { min: 1_000_000, max: null, steps: [{ order: 1, role: 'APPROVER' }, { order: 2, role: 'ADMIN', quorum: 1 }] },
  ],
};

describe('stepsConfigError', () => {
  it('зөв: алхмын массив, amount_rules (seed/frontend-ийн хэлбэр)', () => {
    expect(stepsConfigError([{ order: 0, role: 'APPROVER', quorum: 1 }])).toBeNull();
    expect(stepsConfigError(RULES)).toBeNull();
  });

  it.each([
    ['null', null, /массив эсвэл/],
    ['текст', 'x', /массив эсвэл/],
    ['хоосон массив', [], /хоосон биш/],
    ['байхгүй role', [{ order: 0, role: 'DEPT_MANAGER' }], /role буруу/],
    ['order сөрөг', [{ order: -1, role: 'APPROVER' }], /order/],
    ['order бутархай', [{ order: 0.5, role: 'APPROVER' }], /order/],
    ['quorum 0', [{ order: 0, role: 'APPROVER', quorum: 0 }], /quorum/],
    ['алхам массив биш', [['APPROVER']], /объект/],
    ['amount_rules хоосон', { amount_rules: [] }, /amount_rules/],
    ['max <= min', { amount_rules: [{ min: 10, max: 5, steps: [{ order: 0, role: 'APPROVER' }] }] }, /max/],
    ['min сөрөг', { amount_rules: [{ min: -1, max: null, steps: [{ order: 0, role: 'APPROVER' }] }] }, /min/],
    ['дүрмийн steps буруу', { amount_rules: [{ min: 0, max: null, steps: [{ order: 0, role: 'nope' }] }] }, /amount_rules\[0\]\.steps\[0\]\.role/],
    ['21 алхам', Array.from({ length: 21 }, (_, i) => ({ order: i, role: 'APPROVER' })), /20 алхам/],
  ])('%s → алдаа', (_l, value, re) => {
    expect(stepsConfigError(value)).toMatch(re);
  });
});

describe('WorkflowDefinitionDto', () => {
  it('frontend-ийн body (name, slaHours, escalation/delegation, amount_rules) → алдаагүй; name trim', () => {
    const body = { name: '  Default  ', slaHours: 48, escalationEnabled: true, delegationEnabled: false, stepsConfig: RULES };
    expect(errs(body)).toEqual([]);
    expect(plainToInstance(WorkflowDefinitionDto, body).name).toBe('Default');
  });

  it('name хоосон / stepsConfig байхгүй / slaHours 0 / boolean биш / илүү талбар → алдаа', () => {
    expect(errs({ name: '  ', stepsConfig: RULES }).join()).toMatch(/name шаардлагатай/);
    expect(errs({ name: 'x' }).join()).toMatch(/stepsConfig/);
    expect(errs({ name: 'x', stepsConfig: RULES, slaHours: 0 }).length).toBeGreaterThan(0);
    expect(errs({ name: 'x', stepsConfig: RULES, escalationEnabled: 'yes' }).join()).toMatch(/escalationEnabled/);
    expect(errs({ name: 'x', stepsConfig: RULES, tenantId: 'other' }).join()).toMatch(/tenantId/);
  });

  it('stepsConfig-ийн алдааны мессеж нь тодорхой зам заана', () => {
    expect(errs({ name: 'x', stepsConfig: [{ order: 0, role: 'BOSS' }] }).join()).toMatch(/stepsConfig\[0\]\.role буруу/);
  });
});
