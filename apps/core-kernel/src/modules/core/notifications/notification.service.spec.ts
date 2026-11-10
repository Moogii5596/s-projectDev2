import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationService } from './notification.service';
import { NotificationTypeRegistry } from './notification-type.registry';
import { renderNotificationMail } from './notification-mail';
import { i18nStorage } from '../../../common/i18n/i18n-context';

function setup(opts: { prefs?: Array<{ userId: string; inApp: boolean; email: boolean }>; campActive?: boolean } = {}) {
  const tx = {
    $executeRaw: vi.fn(),
    coreNotificationPref: { findMany: vi.fn().mockResolvedValue(opts.prefs ?? []), upsert: vi.fn() },
    coreNotification: {
      createMany: vi.fn(async ({ data }: { data: unknown[] }) => ({ count: data.length })),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    coreUser: { findFirst: vi.fn().mockResolvedValue({ id: 'me' }) },
  };
  const prisma = { $transaction: vi.fn(async (fn: (v: typeof tx) => unknown) => fn(tx)), $executeRaw: vi.fn() };
  const registry = new NotificationTypeRegistry();
  registry.register({ type: 'camp.meal_order.submitted', module: 'camp', labelKey: 'x', defaultInApp: true, defaultEmail: false });
  const modules = { isActive: vi.fn().mockResolvedValue(opts.campActive ?? true) };
  const service = new NotificationService(prisma as never, registry, modules as never);
  return { service, tx, registry, modules };
}

describe('NotificationService (NTF-01)', () => {
  let s: ReturnType<typeof setup>;
  beforeEach(() => {
    s = setup();
  });

  it('төрлийн анхдагч сувгаар мөр үүсгэж, үйлдэл хийсэн хүн болон давхардлыг хасна', async () => {
    const n = await s.service.notify(s.tx as never, 't1', {
      type: 'core.approval.requested', recipients: ['u1', 'u2', 'u1', 'actor'], excludeUserId: 'actor',
      titleKey: 'notify.approval.requested.title', params: { entity: 'MR' }, link: '/debug/modules/mr/1',
    });
    expect(n).toBe(2);
    const data = s.tx.coreNotification.createMany.mock.calls[0][0].data as Array<Record<string, unknown>>;
    expect(data.map((d) => d.userId)).toEqual(['u1', 'u2']);
    expect(data[0]).toMatchObject({ inApp: true, emailStatus: 'PENDING', type: 'core.approval.requested', tenantId: 't1' });
  });

  it('хэрэглэгчийн тохиргоо анхдагчийг дарна; хоёр суваг унтраалттай бол мөр үүсгэхгүй', async () => {
    s = setup({ prefs: [{ userId: 'u1', inApp: false, email: false }, { userId: 'u2', inApp: false, email: true }] });
    const n = await s.service.notify(s.tx as never, 't1', { type: 'core.approval.decided', recipients: ['u1', 'u2'], titleKey: 'k' });
    expect(n).toBe(1);
    const data = s.tx.coreNotification.createMany.mock.calls[0][0].data as Array<Record<string, unknown>>;
    expect(data).toEqual([expect.objectContaining({ userId: 'u2', inApp: false, emailStatus: 'PENDING' })]);
  });

  it('модуль унтраалттай бол мэдэгдэл үүсгэхгүй', async () => {
    s = setup({ campActive: false });
    const n = await s.service.notify(s.tx as never, 't1', { type: 'camp.meal_order.submitted', recipients: ['u1'], titleKey: 'k' });
    expect(n).toBe(0);
    expect(s.tx.coreNotification.createMany).not.toHaveBeenCalled();
  });

  it('бүртгэлгүй төрөл, гадаад линкийг хүлээн авахгүй', async () => {
    await expect(s.service.notify(s.tx as never, 't1', { type: 'x.y.z', recipients: ['u1'], titleKey: 'k' })).rejects.toThrow(/Бүртгэлгүй/);
    await expect(
      s.service.notify(s.tx as never, 't1', { type: 'core.approval.decided', recipients: ['u1'], titleKey: 'k', link: 'https://evil.example' }),
    ).rejects.toThrow(/линк/);
    await expect(
      s.service.notify(s.tx as never, 't1', { type: 'core.approval.decided', recipients: ['u1'], titleKey: 'k', link: '//evil.example' }),
    ).rejects.toThrow(/линк/);
  });

  it('жагсаалт зөвхөн өөрийн, апп доторх мөрийг tenant-аар шүүнэ', async () => {
    await s.service.list('t1', 'auth', { unreadOnly: true, limit: 5 });
    expect(s.tx.coreUser.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { authId: 'auth', tenantId: 't1', isActive: true } }));
    expect(s.tx.coreNotification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: 't1', userId: 'me', inApp: true, readAt: null }), take: 6 }),
    );
  });

  it('бусдын/байхгүй мэдэгдлийг уншсан болгоход 404', async () => {
    await expect(s.service.markRead('t1', 'auth', 'n1')).rejects.toMatchObject({ status: 404 });
  });

  it('идэвхгүй модулийн төрлийг тохиргоонд харуулахгүй, өөрчлөхийг зөвшөөрөхгүй', async () => {
    s = setup({ campActive: false });
    const prefs = await s.service.preferences('t1', 'auth');
    expect(prefs.items.map((i) => i.type)).not.toContain('camp.meal_order.submitted');
    await expect(s.service.updatePreferences('t1', 'auth', [{ type: 'camp.meal_order.submitted', inApp: true, email: true }])).rejects.toMatchObject({ status: 404 });
  });

  it('төрлийг өөр модуль давхар бүртгэхийг хориглоно', () => {
    expect(() => s.registry.register({ type: 'core.approval.requested', module: 'camp', labelKey: 'x', defaultInApp: true, defaultEmail: true })).toThrow();
    expect(() => s.registry.register({ type: 'Bad', module: 'camp', labelKey: 'x', defaultInApp: true, defaultEmail: true })).toThrow();
    expect(() => s.registry.register({ type: 'camp.undeclared.event', module: 'camp', labelKey: 'x', defaultInApp: true, defaultEmail: false }))
      .toThrow('Notification type manifest-д бүртгэгдээгүй: camp.undeclared.event');
  });
});

describe('renderNotificationMail (NTF-01)', () => {
  it('хэрэглэгчийн хэлээр, tenant override-тэй, HTML escape хийнэ', () => {
    const mail = i18nStorage.run({ lang: 'en', overrides: new Map([['en:notify.mail.open', 'Open it']]) }, () =>
      renderNotificationMail('en', {
        titleKey: 'notify.approval.requested.title', bodyKey: 'notify.approval.requested.body',
        params: { entity: '<b>MR</b>', requester: 'Bat', title: 'x"y' }, url: 'https://app.example/debug',
      }),
    );
    expect(mail.subject).toBe('Awaiting your approval: <b>MR</b>');
    expect(mail.html).toContain('&lt;b&gt;MR&lt;/b&gt;');
    expect(mail.html).not.toContain('<b>MR</b>');
    expect(mail.html).toContain('Open it');
    expect(mail.text).toContain('https://app.example/debug');
  });

  it('гарчиг дахь мөр шилжилтийг (header injection) арилгана', () => {
    const mail = renderNotificationMail('mn', { titleKey: 'notify.invite.accepted.title', bodyKey: null, params: { name: 'A\r\nBcc: x@y' }, url: null });
    expect(mail.subject).not.toMatch(/[\r\n]/);
  });
});
