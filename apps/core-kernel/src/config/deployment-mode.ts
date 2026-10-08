/**
 * Deployment mode — ADR-001 (Tenant Isolation, шийдвэр B — 2026-10-08)
 *
 *   shared    (default) — Олон tenant нэг DB, RLS-ээр тусгаарлана.
 *                         Tenant = Host header-ийн subdomain (localhost → DEV_TENANT_SLUG).
 *   dedicated           — Enterprise VPC: нэг байгууллагад тусдаа DB + тусдаа deploy.
 *                         Tenant = DEDICATED_TENANT_SLUG (Host header-ээс ҮЛ ХАМААРНА —
 *                         харилцагч өөрийн домэйн, жишээ нь erp.company.mn ашиглаж болно).
 *
 * Энэ файл бол ганц эх сурвалж: EnvConfig (startup validation) болон
 * TenantAuthGuard хоёулаа parseDeploymentConfig()-г ашиглана.
 */

export type DeploymentMode = 'shared' | 'dedicated';

export interface DeploymentConfig {
  mode: DeploymentMode;
  /** dedicated үед заавал утгатай, shared үед үргэлж null */
  dedicatedTenantSlug: string | null;
}

/** tenants.slug-ийн зөвшөөрөгдөх хэлбэр: жижиг үсэг, тоо, зураас (DNS label-тэй нийцтэй) */
export const TENANT_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export interface DeploymentEnvInput {
  DEPLOYMENT_MODE?: string | null;
  DEDICATED_TENANT_SLUG?: string | null;
}

/** Хоосон string-ийг (`KEY=` гэж .env-д үлдсэн) тохируулаагүй гэж үзнэ */
function clean(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * @throws Error — буруу тохиргоо үед (app эхлэхгүй байх ёстой)
 */
export function parseDeploymentConfig(input: DeploymentEnvInput): DeploymentConfig {
  const mode = clean(input.DEPLOYMENT_MODE) ?? 'shared';
  const slug = clean(input.DEDICATED_TENANT_SLUG);

  if (mode === 'shared') {
    return { mode: 'shared', dedicatedTenantSlug: null };
  }

  if (mode !== 'dedicated') {
    throw new Error(
      `DEPLOYMENT_MODE: "${mode}" буруу утга — "shared" эсвэл "dedicated" байх ёстой`,
    );
  }

  if (!slug) {
    throw new Error('DEDICATED_TENANT_SLUG: DEPLOYMENT_MODE=dedicated үед заавал тохируулна');
  }

  if (!TENANT_SLUG_PATTERN.test(slug)) {
    throw new Error(
      `DEDICATED_TENANT_SLUG: "${slug}" буруу хэлбэр — жижиг латин үсэг, тоо, зураас (a-z, 0-9, -)`,
    );
  }

  return { mode: 'dedicated', dedicatedTenantSlug: slug };
}
