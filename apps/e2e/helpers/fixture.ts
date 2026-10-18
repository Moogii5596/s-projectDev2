/**
 * Phase 6.1.1 — globalSetup-ийн үүсгэсэн fixture (`.fixture.json`) уншиж, API/UI тестэд туслах.
 * Төрлүүд нь core-kernel `src/scripts/e2e-fixture.ts`-тэй ижил (e2e нь core-kernel-ийг импортлохгүй).
 */
import { readFileSync } from 'node:fs';
import type { APIRequestContext, Page } from '@playwright/test';
import { FIXTURE_PATH } from './fixture-paths';

export type FixtureTenantKey = 'a' | 'b' | 'wf';
export type FixtureUserKey =
  | 'aReq' | 'aAppr' | 'aAdmin'
  | 'bReq' | 'bAdmin'
  | 'wfReq' | 'wfAppr1' | 'wfAppr2' | 'wfAdmin'
  | 'devReq' | 'devAppr1' | 'devAppr2' | 'devAdmin' | 'devUserAdmin' | 'devLangAdmin';

export interface FixtureUser {
  email: string;
  password: string;
  role: string;
  tenant: FixtureTenantKey | 'dev';
  authId: string;
  coreId: string;
  token: string;
}

export interface Fixture {
  stamp: number;
  prefix: string;
  devTenant: { id: string; slug: string };
  tenants: Record<FixtureTenantKey, { id: string; slug: string; host: string }>;
  users: Record<FixtureUserKey, FixtureUser>;
}

let cached: Fixture | null = null;

export function fixture(): Fixture {
  if (!cached) cached = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as Fixture;
  return cached;
}

/** Backend шууд (UI-гүй API тест) */
export const API_URL = process.env['E2E_API_URL'] ?? 'http://localhost:3000';

/**
 * Хэрэглэгчийн token + tenant-ийн Host header. DEV tenant → Host-гүй (localhost → DEV_TENANT_SLUG).
 * `asTenant` — өөр tenant-ийн Host-оор оролдох (гишүүн биш → 403).
 */
export function headersFor(key: FixtureUserKey, asTenant?: FixtureTenantKey): Record<string, string> {
  const f = fixture();
  const u = f.users[key];
  const t = asTenant ?? (u.tenant === 'dev' ? null : u.tenant);
  return { Authorization: `Bearer ${u.token}`, ...(t ? { Host: f.tenants[t].host } : {}) };
}

/** `request.get(url(...), { headers: headersFor(...) })` */
export const url = (path: string): string => `${API_URL}/api/v1${path}`;

/** API-аар MR үүсгэж илгээнэ (UI-д нэгж үнийн талбар алга → дүнтэй MR-г API-аар) */
export async function createSubmittedMr(
  request: APIRequestContext,
  who: FixtureUserKey,
  opts: { title: string; amount: number; department?: string },
): Promise<string> {
  const h = { headers: headersFor(who) };
  const c = await request.post(url('/requisitions'), {
    ...h,
    data: {
      title: opts.title,
      ...(opts.department ? { department: opts.department } : {}),
      items: [{ description: opts.title, quantity: 1, unitPrice: opts.amount }],
    },
  });
  if (c.status() !== 201) throw new Error(`MR үүсгэх ${c.status()}: ${await c.text()}`);
  const id = ((await c.json()) as { id: string }).id;
  const s = await request.post(url(`/requisitions/${id}/submit`), { ...h, data: {} });
  if (s.status() !== 200) throw new Error(`MR илгээх ${s.status()}: ${await s.text()}`);
  return id;
}

/** UI нэвтрэлт (fixture хэрэглэгч, DEV tenant) */
export async function loginAsUser(page: Page, key: FixtureUserKey): Promise<void> {
  const u = fixture().users[key];
  await page.goto('/login');
  await page.locator('#identifier').fill(u.email);
  await page.locator('input[type="password"]').fill(u.password);
  await page.getByRole('button', { name: /нэвтрэх|login/i }).click();
  await page.waitForURL('**/requisitions**', { timeout: 15_000 });
}

/**
 * v0.2.2 Блок 6б: нэг тест дотор өөр хэрэглэгч рүү шилжих — локал session-ийг цэвэрлээд нэвтэрнэ
 * (нэвтэрсэн үед /login нүүр рүү redirect хийдэг тул шууд loginAsUser ажиллахгүй).
 */
export async function switchUser(page: Page, key: FixtureUserKey): Promise<void> {
  if (page.url().startsWith('http')) {
    await page.evaluate(() => {
      for (const k of Object.keys(localStorage)) if (/^sb-.*-auth-token$/.test(k)) localStorage.removeItem(k);
    });
  }
  await loginAsUser(page, key);
}
