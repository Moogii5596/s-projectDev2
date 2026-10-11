import type { DeploymentConfig } from '../config/deployment-mode';

/**
 * Host header → tenant slug (TenantAuthGuard ба v0.2.2 sign-in-д нэг дүрэм).
 * ADR-001: dedicated (Enterprise VPC / пилот) — нэг deploy = нэг tenant, Host-оос үл хамаарна.
 */
export function resolveTenantSlug(deployment: DeploymentConfig, host: string | undefined): string | null {
  if (deployment.mode === 'dedicated') return deployment.dedicatedTenantSlug;
  if (!host) return null;
  // localhost:3000 (development) → DEV_TENANT_SLUG | 'test-tenant'
  if (host.includes('localhost') || host.includes('127.0.0.1')) return process.env.DEV_TENANT_SLUG ?? 'test-tenant';
  // subdomain.domain.com → subdomain
  const parts = host.split('.');
  return parts.length >= 3 ? parts[0] : null;
}
