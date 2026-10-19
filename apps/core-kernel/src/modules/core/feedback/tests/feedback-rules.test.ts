import { describe, expect, it } from 'vitest';
import { CoreFeedbackStatus, UserRole } from '@prisma/client';
import { canEditFeedback, displayAuthor, isFeedbackAdmin, normalizeVersion, resolveDoneVersion } from '../feedback-rules';

describe('v0.2.3 Блок F — санал хүсэлтийн дүрэм', () => {
  it('админ = OWNER / ADMIN', () => {
    expect(isFeedbackAdmin(UserRole.OWNER)).toBe(true);
    expect(isFeedbackAdmin(UserRole.ADMIN)).toBe(true);
    expect(isFeedbackAdmin(UserRole.REQUESTER)).toBe(false);
    expect(isFeedbackAdmin(UserRole.VIEWER)).toBe(false);
  });

  it('зохиогч зөвхөн «Шинэ» үед засна; бусад хэрэглэгч хэзээ ч; админ үргэлж', () => {
    const fb = (status: CoreFeedbackStatus) => ({ authorId: 'u1', status });
    const me = { userId: 'u1', isAdmin: false };
    const other = { userId: 'u2', isAdmin: false };
    const admin = { userId: 'u3', isAdmin: true };
    expect(canEditFeedback(fb(CoreFeedbackStatus.NEW), me)).toBe(true);
    expect(canEditFeedback(fb(CoreFeedbackStatus.ACCEPTED), me)).toBe(false);
    expect(canEditFeedback(fb(CoreFeedbackStatus.NEW), other)).toBe(false);
    expect(canEditFeedback(fb(CoreFeedbackStatus.DONE), admin)).toBe(true);
  });

  it('хувилбарыг нормчилно', () => {
    expect(normalizeVersion('0.2.3')).toBe('v0.2.3');
    expect(normalizeVersion(' V0.2.2.2 ')).toBe('v0.2.2.2');
    expect(normalizeVersion('v1.0')).toBe('v1.0');
    expect(normalizeVersion('0.2.3-rc')).toBeNull();
    expect(normalizeVersion('2')).toBeNull();
    expect(normalizeVersion('')).toBeNull();
    expect(normalizeVersion(null)).toBeNull();
  });

  it('DONE → хувилбар заавал; бусад төлөвт арилгана', () => {
    expect(resolveDoneVersion({ status: CoreFeedbackStatus.DONE, doneVersion: '0.2.3' })).toBe('v0.2.3');
    expect(resolveDoneVersion({ status: CoreFeedbackStatus.DONE, doneVersion: null })).toBe('invalid');
    expect(resolveDoneVersion({ status: CoreFeedbackStatus.DONE })).toBe('invalid');
    expect(resolveDoneVersion({ status: CoreFeedbackStatus.PLANNED, doneVersion: 'v0.2.3' })).toBeNull();
  });

  it('илгээгчийн нэр: бүтэн нэр → нэвтрэх нэр → имэйл', () => {
    expect(displayAuthor({ fullName: ' Бат ', username: '99112233', email: 'x@y' })).toBe('Бат');
    expect(displayAuthor({ fullName: null, username: '99112233', email: 'x@y' })).toBe('99112233');
    expect(displayAuthor({ fullName: '', username: null, email: 'bold@example.com' })).toBe('bold');
  });
});
