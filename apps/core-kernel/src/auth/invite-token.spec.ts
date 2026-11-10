import { describe, expect, it } from 'vitest';
import { TOKEN_RE, generateToken, hashToken, internalEmail, inviteState, isInternalEmail, loginHint } from './invite-token';
import { renderAuthMail, mailLang } from './auth-mail';
import { i18nStorage } from '../common/i18n/i18n-context';

describe('invite-token (v0.2.2 Блок 3)', () => {
  it('generateToken: 43 тэмдэгт base64url, hash = sha256 hex, давтагдашгүй', () => {
    const a = generateToken();
    const b = generateToken();
    expect(a.token).toMatch(TOKEN_RE);
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(a.token)).toBe(a.hash);
    expect(a.token).not.toBe(b.token);
  });

  it('inviteState: ашигласан > цуцалсан > хугацаа дууссан > ok', () => {
    const now = new Date('2026-10-13T00:00:00Z');
    const future = new Date('2026-10-14T00:00:00Z');
    expect(inviteState({ usedAt: null, revokedAt: null, expiresAt: future }, now)).toBe('ok');
    expect(inviteState({ usedAt: now, revokedAt: now, expiresAt: future }, now)).toBe('used');
    expect(inviteState({ usedAt: null, revokedAt: now, expiresAt: future }, now)).toBe('revoked');
    expect(inviteState({ usedAt: null, revokedAt: null, expiresAt: now }, now)).toBe('expired');
  });

  it('дотоод имэйл: .login.invalid, хэзээ ч харуулахгүй; loginHint утас → username → жинхэнэ имэйл', () => {
    const e = internalEmail('0190A1B2-C3D4', 'Sino_Hydro');
    expect(e).toBe('u-0190a1b2c3d4@sinohydro.login.invalid');
    expect(isInternalEmail(e)).toBe(true);
    expect(loginHint({ phone: '99112233', username: 'x', email: 'a@b' })).toBe('99112233');
    expect(loginHint({ phone: null, username: 'sh1023', email: e })).toBe('sh1023');
    expect(loginHint({ phone: null, username: null, email: e })).toBeNull();
    expect(loginHint({ phone: null, username: null, email: 'bat@x.mn' })).toBe('bat@x.mn');
  });
});

describe('auth-mail (D-04)', () => {
  it('3 хэл; линк, нэвтрэх нэр, хугацаа орно; HTML escape', () => {
    for (const lang of ['mn', 'en', 'zh'] as const) {
      const m = renderAuthMail('invite', lang, { name: '<b>Бат</b>', url: 'https://sino.gobiverse.website/invite/abc', login: '99112233', hours: 72 });
      expect(m.subject.length).toBeGreaterThan(5);
      expect(m.text).toContain('https://sino.gobiverse.website/invite/abc');
      expect(m.text).toContain('99112233');
      expect(m.text).toContain('72');
      expect(m.html).not.toContain('<b>Бат</b>');
      expect(m.html).toContain('&lt;b&gt;');
      expect(m.text).not.toMatch(/\{\w+\}/);
    }
    const r = renderAuthMail('reset', 'en', { name: 'A', url: 'https://x/reset/t', login: null, minutes: 60 });
    expect(r.text).toContain('60 minutes');
    expect(r.text).not.toContain('Your login');
    expect(mailLang('zh')).toBe('zh');
    expect(mailLang('fr')).toBe('mn');
  });

  it('байгууллагын орчуулгын засвар имэйлд хэрэглэгчийн хэлээр тусна', () => {
    const mail = i18nStorage.run(
      { lang: 'mn', overrides: new Map([['en:auth.mail.invite.subject', 'Welcome to Example'], ['en:auth.mail.invite.body', 'Open this link within {hours} hours, {name}.']]) },
      () => renderAuthMail('invite', 'en', { name: '<Admin>', url: 'https://example.test/invite/token', login: null, hours: 24 }),
    );
    expect(mail.subject).toBe('Welcome to Example');
    expect(mail.text).toContain('Open this link within 24 hours, <Admin>.');
    expect(mail.html).toContain('&lt;Admin&gt;');
  });
});
