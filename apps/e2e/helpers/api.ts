import type { Page } from '@playwright/test';

/**
 * v0.2.3 Блок 4 (QA-11) — e2e-ийн API туслах ГАНЦ хувилбар (өмнө 8 spec-д 3 янзаар хуулбарласан байсан).
 * Хөтчийн session-ийн token-оор (localStorage `sb-*-auth-token`) апп-ын origin-оос дуудна.
 * `path` — `/api/v1`-ийн дараах зам (`/camp/camps`, `/hr/sites/:id/employees`, `/core/organizations`);
 * `/api/` эхэлсэн бол бүтэн зам (`/api/v1/i18n/me/locale`).
 * Хуучин `/api/v1/camp/...` HR/Core зам v0.2.3-т устсан (QA-12) → `hrSite`, `/hr/positions`, `/core/organizations`, `/core/rbac`.
 */
export async function api<T = { id: string }>(page: Page, method: string, path: string, body?: unknown): Promise<T> {
  const full = path.startsWith('/api/') ? path : `/api/v1${path}`;
  return page.evaluate(
    async ([m, p, b]) => {
      const key = Object.keys(localStorage).find((k) => /^sb-.*-auth-token$/.test(k));
      const token = key ? (JSON.parse(localStorage.getItem(key) as string) as { access_token: string }).access_token : '';
      const res = await fetch(p, {
        method: m,
        headers: {
          ...(b === undefined ? {} : { 'Content-Type': 'application/json' }),
          Authorization: `Bearer ${token}`,
        },
        body: b === undefined ? undefined : JSON.stringify(b),
      });
      const text = await res.text();
      if (!res.ok) throw new Error(`${m} ${p} → ${res.status} ${text}`);
      return text ? JSON.parse(text) : null;
    },
    [method, full, body] as const,
  ) as Promise<T>;
}

/** HR-ийн ажлын байрны зам: `/hr/sites/:campId<path>` */
const hrSite = (campId: string, path = ''): string => `/hr/sites/${campId}${path}`;
