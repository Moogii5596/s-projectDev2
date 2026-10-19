import { describe, expect, it } from 'vitest';
import { applyIssues, clearedBy, issueFromRow, readIssues, sameIssues } from '../data-issues';

describe('v0.2.3 Блок D (S9) — data-issues', () => {
  it('applyIssues: талбар бүрт нэг, null = арилгах, undefined = хөндөхгүй', () => {
    const cur = [{ field: 'email' as const, code: 'row.bad_email', value: 'x' }];
    expect(applyIssues(cur, { phone: { field: 'phone', code: 'row.bad_phone', value: '1' } }).map((i) => i.field)).toEqual(['email', 'phone']);
    expect(applyIssues(cur, { email: null })).toEqual([]);
    expect(applyIssues(cur, {})).toEqual(cur);
    expect(sameIssues(cur, [...cur])).toBe(true);
  });
  it('readIssues / issueFromRow / clearedBy', () => {
    expect(readIssues(null)).toEqual([]);
    expect(readIssues([{ field: 'email', code: 'c', value: 'v' }, 5, null])).toEqual([{ field: 'email', code: 'c', value: 'v' }]);
    expect(issueFromRow('phone', { column: 'phone', code: 'row.bad_phone', params: { value: '9909' } })).toEqual({ field: 'phone', code: 'row.bad_phone', value: '9909' });
    expect(issueFromRow('phone', undefined)).toBeNull();
    expect(clearedBy({ email: 'a@b.mn', phone: undefined })).toEqual({ email: null });
  });
});
