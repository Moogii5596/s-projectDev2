import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { createClient } from '@supabase/supabase-js';
import { PrismaService } from '../../../db/prisma.service';

/**
 * SuperAdminGuard — Platform-level super admin эрх шалгах
 * Sprint 4: POST /api/v1/admin/tenants — super admin бус бол 403
 */
@Injectable()
export class SuperAdminGuard implements CanActivate {
  private readonly supabaseAdmin = createClient(
    process.env['SUPABASE_URL']!,
    process.env['SUPABASE_ANON_KEY']!,
  );

  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Record<string, unknown>>();

    // 1. JWT авах
    const authHeader = request['headers'] as Record<string, string> | undefined;
    const bearer = authHeader?.['authorization'];
    if (!bearer?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Authorization header байхгүй');
    }

    const token = bearer.substring(7);

    // 2. Supabase JWT баталгаажуулах
    const { data, error } = await this.supabaseAdmin.auth.getUser(token);
    if (error || !data.user) {
      throw new UnauthorizedException('Token хүчингүй байна');
    }

    const authId = data.user.id;

    // 3. core_users-с authId-аар хэрэглэгч олох
    const coreUser = await this.prisma.coreUser.findUnique({
      where: { authId },
    });

    if (!coreUser) {
      throw new ForbiddenException('Хэрэглэгч системд бүртгэгдээгүй байна');
    }

    // 4. super_admins хүснэгтэд байгаа эсэх шалгах
    const superAdmin = await this.prisma.superAdmin.findUnique({
      where: { userId: coreUser.id },
    });

    if (!superAdmin) {
      throw new ForbiddenException('Super admin эрх шаардлагатай');
    }

    // 5. Request-д user context хавсаргах
    (request as Record<string, unknown>)['user'] = {
      id: coreUser.id,
      authId,
      email: coreUser.email,
      role: coreUser.role,
      isSuperAdmin: true,
    };

    return true;
  }
}
