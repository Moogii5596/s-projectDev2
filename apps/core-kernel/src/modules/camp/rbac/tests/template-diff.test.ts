import { describe, it, expect } from 'vitest';
import { buildApplyPreview, diffTemplate } from '../template-diff';

describe('template-diff (v0.2.2 D-09)', () => {
  it('diffTemplate: нэмэгдэх/хасагдах эрэмбэтэй, давхардал тоологдохгүй', () => {
    expect(diffTemplate(['b', 'a', 'a'], ['c', 'a'])).toEqual({ add: ['c'], remove: ['b'] });
    expect(diffTemplate([], [])).toEqual({ add: [], remove: [] });
  });

  it('buildApplyPreview: зөвхөн зөрүүтэй олголт; нэг хэрэглэгчийн 2 олголт = 1 хэрэглэгч', () => {
    const p = buildApplyPreview(
      [
        { userRoleId: 'ur1', userId: 'u1', campId: null, current: ['a'] },
        { userRoleId: 'ur2', userId: 'u1', campId: 'c1', current: [] },
        { userRoleId: 'ur3', userId: 'u2', campId: null, current: ['a', 'b'] },
      ],
      ['a', 'b'],
    );
    expect(p.items.map((i) => i.userRoleId)).toEqual(['ur1', 'ur2']);
    expect(p.affectedUsers).toBe(1);
  });
});
