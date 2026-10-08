// RULE-09: import type only for type-only imports
export class CreateTenantDto {
  name!: string;
  slug!: string;
  tier!: 'TIER1' | 'TIER2' | 'TIER3';
  adminEmail!: string;
  adminFullName!: string;
  adminPassword!: string; // Supabase Auth-д дамжуулна
}
