/**
 * v0.2.2 Блок 2 (tech plan §8) — нэвтрэлтийн бэлтгэлийн тайлан: идэвхтэй ажилтны утас / имэйлийн байдал.
 * ЗӨВХӨН ТОО (хувийн мэдээлэл гаргахгүй). READ ONLY transaction. v0.2.1 schema дээр ч ажиллана (camp_employees л уншина).
 */
import { PrismaClient } from '@prisma/client';
import { normalizeMnPhone } from '../auth/login-identifier';

export interface LoginReportRow {
  activeEmployees: number;
  /** Монгол 8 оронтой, давтагдашгүй → утсаар нэвтэрнэ */
  phoneLogin: number;
  /** утас алга */
  noPhone: number;
  /** гадаад / буруу хэлбэр (+86 г.м.) */
  foreignOrInvalid: number;
  /** ижил Монгол утастай бүлэг ба тэдгээрийн ажилтан (нэг нь утас, бусад нь username авна) */
  duplicatePhoneGroups: number;
  duplicatePhoneEmployees: number;
  /** username авах (утасгүй + гадаад + давхардсаны илүү) */
  username: number;
  withEmail: number;
}

export function summarizeEmployees(rows: { phone: string | null; email: string | null }[]): LoginReportRow {
  const groups = new Map<string, number>();
  let noPhone = 0;
  let foreign = 0;
  for (const r of rows) {
    if (!r.phone?.trim()) { noPhone++; continue; }
    const p = normalizeMnPhone(r.phone);
    if (!p) { foreign++; continue; }
    groups.set(p, (groups.get(p) ?? 0) + 1);
  }
  const dups = [...groups.values()].filter((n) => n > 1);
  const dupEmployees = dups.reduce((a, b) => a + b, 0);
  const phoneLogin = groups.size; // бүлэг бүрээс нэг нь
  return {
    activeEmployees: rows.length,
    phoneLogin,
    noPhone,
    foreignOrInvalid: foreign,
    duplicatePhoneGroups: dups.length,
    duplicatePhoneEmployees: dupEmployees,
    username: rows.length - phoneLogin,
    withEmail: rows.filter((r) => !!r.email?.trim()).length,
  };
}

export async function buildLoginReport(prisma: PrismaClient, tenantSlug?: string): Promise<Record<string, LoginReportRow>> {
  const tenants = await prisma.tenant.findMany({ where: tenantSlug ? { slug: tenantSlug } : {}, select: { id: true, slug: true }, orderBy: { slug: 'asc' } });
  if (tenantSlug && tenants.length === 0) throw new Error(`Байгууллага "${tenantSlug}" олдсонгүй`);
  const out: Record<string, LoginReportRow> = {};
  for (const t of tenants) {
    const rows = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${t.id}, true)`;
      return tx.$queryRaw<{ phone: string | null; email: string | null }[]>`
        SELECT phone, email FROM camp_employees WHERE tenant_id = ${t.id}::uuid AND status::text = 'ACTIVE'`;
    });
    out[t.slug] = summarizeEmployees(rows);
  }
  return out;
}
