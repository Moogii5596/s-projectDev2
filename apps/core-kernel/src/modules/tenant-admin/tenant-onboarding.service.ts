import { Injectable, ConflictException } from '@nestjs/common';
import { createClient } from '@supabase/supabase-js';
import { SystemPrismaService } from '../../db/system-prisma.service'; // Phase 4.8.4
// RULE-02: Prisma Enum → @prisma/client-с import хийх
import { TierType, UserRole, Prisma } from '@prisma/client';
import type { CreateTenantDto } from './dto/create-tenant.dto';

@Injectable()
export class TenantOnboardingService {
  // Service role key ашиглаж Supabase Admin API руу хандана
  private readonly supabaseAdmin = createClient(
    process.env['SUPABASE_URL']!,
    process.env['SUPABASE_SERVICE_ROLE_KEY']!,
  );

  constructor(private readonly prisma: SystemPrismaService) {}

  async createTenant(dto: CreateTenantDto) {
    // 1. Supabase Auth-д admin user үүсгэх → authId авах
    const { data: authData, error } = await this.supabaseAdmin.auth.admin.createUser({
      email: dto.adminEmail,
      password: dto.adminPassword,
      email_confirm: true,
    });

    if (error || !authData.user) {
      throw new ConflictException(error?.message ?? 'Supabase Auth error');
    }

    const authId = authData.user.id; // Supabase UUID (string, UUID format)

    // RULE-04: $executeRaw + model query → ЗААВАЛ нэгдсэн $transaction дотор
    // RULE-03: RLS → set_config('app.tenant_id', ...) — SET LOCAL ХОРИГЛОНО
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // slug давхардал шалгах
      const existing = await tx.tenant.findUnique({ where: { slug: dto.slug } });
      if (existing) {
        throw new ConflictException(`slug "${dto.slug}" аль хэдийн бүртгэгдсэн байна`);
      }

      // 2. Tenant үүсгэх
      const tenant = await tx.tenant.create({
        data: {
          name: dto.name,
          slug: dto.slug,
          tier: dto.tier as TierType,
        },
      });

      // 3. RULE-13: core_users-д authId (Supabase UUID) хадгалах
      // authId нь Supabase auth.users.id — шууд FK болохгүй (RULE-13)
      const user = await tx.coreUser.create({
        data: {
          tenantId: tenant.id,
          authId,                    // ← Supabase auth_id (RULE-13)
          email: dto.adminEmail,
          fullName: dto.adminFullName,
          role: UserRole.OWNER,      // RULE-02: enum import
          isActive: true,
        },
      });

      // 4. Default WorkflowDefinition seed
      await tx.workflowDefinition.create({
        data: {
          tenantId: tenant.id,
          name: 'Default Approval',
          stepsConfig: [{ order: 0, role: 'APPROVER', quorum: 1 }],
          isActive: true,
        },
      });

      return { tenant, user };
    });
  }
}
