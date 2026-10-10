import { UserRole } from '@prisma/client';
import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min, ValidateBy } from 'class-validator';
import { Transform } from 'class-transformer';

/**
 * Phase 4.9.1 [SEC-003] — Workflow definition-ийн body шалгалт (2026-10-10)
 * Өмнө нь `WorkflowDefinitionInput` interface байсан → ValidationPipe юу ч шалгадаггүй;
 * буруу `stepsConfig` (жнь байхгүй role) MR илгээх үед Prisma алдаа → 500 болдог байв.
 *
 * stepsConfig-ийн 2 хэлбэр (AmountRouterService.resolveStepsFromConfig):
 *   1) [{ order, role, quorum? }, ...]
 *   2) { amount_rules: [{ min, max | null, steps: [...] }, ...] }
 */
const ROLES = new Set<string>(Object.values(UserRole));
const MAX_STEPS = 20;
const MAX_RULES = 20;

const isInt = (v: unknown, min: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min;

function stepsError(steps: unknown, path: string): string | null {
  if (!Array.isArray(steps) || steps.length === 0) return `${path} нь хоосон биш массив байх ёстой`;
  if (steps.length > MAX_STEPS) return `${path}: хамгийн ихдээ ${MAX_STEPS} алхам`;
  for (const [i, s] of steps.entries()) {
    const p = `${path}[${i}]`;
    if (!s || typeof s !== 'object' || Array.isArray(s)) return `${p} нь объект байх ёстой`;
    const { order, role, quorum } = s as Record<string, unknown>;
    if (!isInt(order, 0)) return `${p}.order нь 0-ээс их бүхэл тоо байх ёстой`;
    if (typeof role !== 'string' || !ROLES.has(role)) return `${p}.role буруу (${[...ROLES].join(', ')})`;
    if (quorum !== undefined && !isInt(quorum, 1)) return `${p}.quorum нь 1-ээс их бүхэл тоо байх ёстой`;
  }
  return null;
}

/** null = зөв; string = монгол алдааны мессеж */
export function stepsConfigError(value: unknown): string | null {
  if (Array.isArray(value)) return stepsError(value, 'stepsConfig');
  if (value && typeof value === 'object') {
    const rules = (value as { amount_rules?: unknown }).amount_rules;
    if (!Array.isArray(rules) || rules.length === 0) return 'stepsConfig.amount_rules нь хоосон биш массив байх ёстой';
    if (rules.length > MAX_RULES) return `stepsConfig.amount_rules: хамгийн ихдээ ${MAX_RULES} дүрэм`;
    for (const [i, r] of rules.entries()) {
      const p = `stepsConfig.amount_rules[${i}]`;
      if (!r || typeof r !== 'object' || Array.isArray(r)) return `${p} нь объект байх ёстой`;
      const { min, max, steps } = r as Record<string, unknown>;
      if (typeof min !== 'number' || !Number.isFinite(min) || min < 0) return `${p}.min нь 0-ээс их тоо байх ёстой`;
      if (max !== null && (typeof max !== 'number' || !Number.isFinite(max) || max <= min)) {
        return `${p}.max нь null эсвэл min-ээс их тоо байх ёстой`;
      }
      const err = stepsError(steps, `${p}.steps`);
      if (err) return err;
    }
    return null;
  }
  return 'stepsConfig нь алхмын массив эсвэл { amount_rules } объект байх ёстой';
}

const IsStepsConfig = () =>
  ValidateBy({
    name: 'isStepsConfig',
    validator: {
      validate: (value: unknown) => stepsConfigError(value) === null,
      defaultMessage: (args) => stepsConfigError(args?.value) ?? 'stepsConfig буруу',
    },
  });

export class WorkflowDefinitionDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'name текст байх ёстой' })
  @IsNotEmpty({ message: 'name шаардлагатай' })
  @MaxLength(200)
  name!: string;

  @IsStepsConfig()
  stepsConfig!: unknown;

  @IsOptional()
  @IsInt({ message: 'slaHours бүхэл тоо байх ёстой' })
  @Min(1)
  @Max(24 * 30)
  slaHours?: number;

  @IsOptional()
  @IsBoolean({ message: 'escalationEnabled boolean байх ёстой' })
  escalationEnabled?: boolean;

  @IsOptional()
  @IsBoolean({ message: 'delegationEnabled boolean байх ёстой' })
  delegationEnabled?: boolean;
}
