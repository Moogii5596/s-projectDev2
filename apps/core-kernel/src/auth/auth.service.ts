import { Prisma } from '@prisma/client';
import {
  Injectable,
  UnauthorizedException,
  InternalServerErrorException,
  Logger,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { PrismaTenantClientService } from '../db/prisma-tenant-client.service';
import { SystemPrismaService } from '../db/system-prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { UserAdminService } from './user-admin.service';

export interface AuthResponse {
  accessToken: string;
  user: {
    id: string;
    authId: string;
    email: string;
    fullName: string | null;
    role: string;
    tenantId: string;
  };
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly supabase: SupabaseClient;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaTenantClientService,
    // Phase 4.8.4: login — tenant тодорхойгүй (authId → core_users) тул системийн холболт
    @Optional() private readonly system?: SystemPrismaService,
  ) {
    this.supabase = createClient(
      this.configService?.get<string>('SUPABASE_URL')
        ?? process.env['SUPABASE_URL']
        ?? 'https://mock.supabase.co',
      this.configService?.get<string>('SUPABASE_SERVICE_ROLE_KEY')
        ?? process.env['SUPABASE_SERVICE_ROLE_KEY']
        ?? 'mock-service-role-key', // service role → admin операц
    );
  }

  /** v0.2.2 Блок 3: хэрэглэгч үүсгэх ганц газар — ижил Supabase client-ийг хуваалцана */
  private get userAdmin(): UserAdminService {
    return (this._userAdmin ??= new UserAdminService(this.configService, this.prisma, this.supabase));
  }
  private _userAdmin?: UserAdminService;

  /**
   * Шинэ хэрэглэгч бүртгэх
   * 1. Supabase Auth-д бүртгэх
   * 2. core_users-д sync хийх (tenant context шаардана)
   */
  async register(dto: RegisterDto, tenantId: string): Promise<AuthResponse> {
    // v0.2.2 Блок 3 (SEC-005 нэгтгэл): GoTrue + core_users үүсгэх ганц газар — UserAdminService (rollback-тай)
    const coreUser = await this.userAdmin.createUser({
      tenantId,
      tenantSlug: '',
      email: dto.email,
      password: dto.password,
      fullName: dto.fullName ?? null,
    });
    const token = await this.getAccessToken(coreUser.email, dto.password);
    return {
      accessToken: token,
      user: {
        id: coreUser.id,
        authId: coreUser.authId,
        email: coreUser.email,
        fullName: coreUser.fullName,
        role: coreUser.role,
        tenantId: coreUser.tenantId,
      },
    };
  }


  /**
   * Email + нууц үгээр нэвтрэх
   */
  async login(dto: LoginDto): Promise<AuthResponse> {
    const { data, error } = await this.supabase.auth.signInWithPassword({
      email: dto.email,
      password: dto.password,
    });

    if (error || !data.session || !data.user) {
      throw new UnauthorizedException('Email эсвэл нууц үг буруу байна');
    }

    // core_users-ээс мэдээлэл авах (tenant_id-г мэдэхгүй тул direct query)
    const coreUser = await (this.system ?? this.prisma).coreUser.findUnique({
      where: { authId: data.user.id },
    });

    if (!coreUser) {
      throw new UnauthorizedException('Хэрэглэгч олдсонгүй');
    }

    return {
      accessToken: data.session.access_token,
      user: {
        id: coreUser.id,
        authId: coreUser.authId,
          email: coreUser.email,
        fullName: coreUser.fullName,
        role: coreUser.role,
        tenantId: coreUser.tenantId,
      },
    };
  }

  /**
   * Одоогийн хэрэглэгчийн core_users мэдээлэл авах
   *
   * ⚠️ RLS FIX: set_config('app.tenant_id', ..., true) нь transaction-local тул
   *   $executeRaw + findFirst-г НЭГДСЭН $transaction()-т ажиллуулж RLS-г баталгаажуулна.
   *   Хоёр өөр implicit transaction-д тусдаа ажиллуулвал TX2-д app.tenant_id тохируулагдаагүй
   *   хэвээр үлдэж, RLS ''::uuid cast алдаа гаргана (22P02).
   */
  async getMe(authId: string, tenantId: string) {
    const user = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // 1. Нэг TX дотор app.tenant_id тохируулна → RLS-д хүчинтэй байна
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      // 2. Мөн TX дотор query → RLS policy app.tenant_id уншиж тэнцэж чадна
      return tx.coreUser.findFirst({
        where: { authId, tenantId },
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          tenantId: true,
          isActive: true,
          locale: true, // v0.2.0 §0.7
          createdAt: true,
          phone: true, // v0.2.2
          username: true,
          mustChangePassword: true, // D-06: frontend "нууц үг солих" руу шилжүүлнэ
        },
      });
    });

    if (!user) {
      throw new UnauthorizedException('Хэрэглэгч олдсонгүй');
    }

    return user;
  }

  private async getAccessToken(email: string, password: string): Promise<string> {
    const { data, error } = await this.supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error || !data.session) {
      throw new InternalServerErrorException('Токен авахад алдаа гарлаа');
    }
    return data.session.access_token;
  }
}
