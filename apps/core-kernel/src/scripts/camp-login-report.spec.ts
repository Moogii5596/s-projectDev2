import { describe, expect, it } from 'vitest';
import { summarizeEmployees } from './camp-login-report';

describe('camp-login-report (v0.2.2 §8)', () => {
  it('утас: Монгол / алга / гадаад / давхардсан → зөвхөн тоо', () => {
    const r = summarizeEmployees([
      { phone: '99112233', email: null },
      { phone: '+976 9911-2233', email: 'a@x' }, // давхардсан
      { phone: '88001122', email: '' },
      { phone: null, email: 'b@x' },
      { phone: ' ', email: null },
      { phone: '+86 138 0013 8000', email: null },
    ]);
    expect(r).toEqual({
      activeEmployees: 6, phoneLogin: 2, noPhone: 2, foreignOrInvalid: 1,
      duplicatePhoneGroups: 1, duplicatePhoneEmployees: 2, username: 4, withEmail: 2,
    });
  });
});
