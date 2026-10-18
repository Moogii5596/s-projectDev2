import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * v0.2.2 Блок 6 (QA-02, OPS-003) — пилотын GoTrue тохиргооны хамгаалалт.
 * `deploy/pilot/supabase/config.toml` нь CI-ийн Supabase-аас (root `supabase/config.toml`) ТУСДАА тул
 * e2e үүнийг шалгадаггүй — OPS-003 ("Email logins are disabled") шиг алдааг энд release-ээс өмнө барина.
 * Хамааралгүй, хялбар TOML уншигч: `[section]` + `key = value` (тайлбар `#`).
 */
function readToml(path: string): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  let section = '';
  for (const raw of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = raw.replace(/\s+#.*$/, '').trim();
    if (!line || line.startsWith('#')) continue;
    const sec = /^\[([^\]]+)\]$/.exec(line);
    if (sec) {
      section = sec[1]!.trim();
      out[section] ??= {};
      continue;
    }
    const kv = /^([\w.-]+)\s*=\s*(.+)$/.exec(line);
    if (kv) (out[section] ??= {})[kv[1]!] = kv[2]!.trim();
  }
  return out;
}

const REPO = resolve(__dirname, '../../../..');
const pilot = readToml(resolve(REPO, 'deploy/pilot/supabase/config.toml'));

describe('пилотын GoTrue тохиргоо (deploy/pilot/supabase/config.toml)', () => {
  it('[OPS-003] имэйл provider асаалттай — унтарвал утас/username/имэйл БҮХ нэвтрэлт зогсоно', () => {
    expect(pilot['auth.email']?.['enable_signup']).toBe('true');
  });

  it('[SEC-005] нээлттэй бүртгэл хаалттай — хэрэглэгчийг зөвхөн апп (UserAdminService) үүсгэнэ', () => {
    expect(pilot['auth']?.['enable_signup']).toBe('false');
    expect(pilot['auth']?.['enable_anonymous_sign_ins']).toBe('false');
  });

  it('[D-12] нууц үгийн доод урт = 12 (backend DTO, web-ийн MIN_PASSWORD_LENGTH-тэй ижил)', () => {
    expect(pilot['auth']?.['minimum_password_length']).toBe('12');
  });

  it('[D-03] имэйл баталгаажуулалт унтраалттай — урилгаар үүссэн хэрэглэгч шууд нэвтэрнэ', () => {
    expect(pilot['auth.email']?.['enable_confirmations']).toBe('false');
  });

  it('[PIL-07] нууц үг таах хамгаалалтын hook асаалттай', () => {
    expect(pilot['auth.hook.password_verification_attempt']?.['enabled']).toBe('true');
  });

  it('Caddy: Supabase Auth-аас зөвхөн token / user / logout нийтэд нээлттэй (signup, admin ✖)', () => {
    const caddy = readFileSync(resolve(REPO, 'deploy/pilot/Caddyfile'), 'utf8');
    const m = /@auth\s+path\s+([^\n]+)/.exec(caddy);
    expect(m?.[1]?.trim().split(/\s+/).sort()).toEqual(['/auth/v1/logout', '/auth/v1/token', '/auth/v1/user']);
  });

  it('[№4, Блок 6б] Caddy access log: урилга / reset токеныг URI-аас нууна (TOKEN_RE-тэй ижил тэмдэгтүүд)', () => {
    const caddy = readFileSync(resolve(REPO, 'deploy/pilot/Caddyfile'), 'utf8');
    const m = /request>uri regexp (\S+) (\S+)/.exec(caddy);
    expect(m, 'format filter { request>uri regexp … } алга').not.toBeNull();
    expect(caddy).toMatch(/format filter \{[\s\S]*wrap json[\s\S]*\}/);
    const re = new RegExp(m![1], 'g');
    const redact = (uri: string) => uri.replace(re, m![2].replace('${1}', '$1'));
    expect(redact('/invite/AbC_d-123xyz')).toBe('/invite/***');
    expect(redact('/reset/Tok3n')).toBe('/reset/***');
    expect(redact('/api/v1/auth/invites/SECRET_tok-1/accept')).toBe('/api/v1/auth/invites/***/accept');
    expect(redact('/camp/rooms?x=1')).toBe('/camp/rooms?x=1');
  });
});
