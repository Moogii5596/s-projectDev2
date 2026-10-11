import { describe, it, expect } from 'vitest';
import { CampSnapshot, comparePerms, compareSnapshots, expectedQ9Additions } from './camp-snapshot';

const snap = (perms: CampSnapshot['perms']): CampSnapshot => ({
  format: 'camp-snapshot/1', meta: { generatedAt: '', db: '', appVersion: null }, today: '2026-10-12', from: '', to: '', camps: {}, perms,
});
const PARTS = 'camp.maintenance.parts';
const CLOSE = 'camp.maintenance.close';

describe('camp-snapshot perms (v0.2.2 §5.1/5.2)', () => {
  // A = v0.2.1 (effective = null): u1 Кемп админ (бүх кемп), u2 менежер C1, u3 Кемп админ C2 + менежер C1 (close@C1 аль хэдийн)
  const A = { legacy: ['u1|camp.report.view|*', `u2|${CLOSE}|C1`, `u3|${CLOSE}|C1`], effective: null, campAdmins: ['u1|*', 'u3|C2'] };
  const q9 = [`u1|${PARTS}|*`, `u1|${CLOSE}|*`, `u3|${PARTS}|C2`, `u3|${CLOSE}|C2`];
  const Bok = { legacy: [...A.legacy, ...q9].sort(), effective: [...A.legacy, ...q9].sort(), campAdmins: A.campAdmins };

  it('expectedQ9Additions: олголт × {parts, close}, A-д байсныг хасна', () => {
    expect([...expectedQ9Additions(A, Bok)].sort()).toEqual([...q9].sort());
  });

  it('--expect=v022-q9: зөвхөн Q9 нэмэгдсэн → зөрүүгүй; expect-гүй бол 4 мөр +', () => {
    expect(comparePerms(snap({ t: A }), snap({ t: Bok }), 'v022-q9')).toEqual([]);
    expect(comparePerms(snap({ t: A }), snap({ t: Bok }))).toHaveLength(4);
  });

  it('илүү эрх (+), алдсан эрх (−), хүлээгдэж буй Q9 алга, legacy ≠ effective → бүгд зөрүү', () => {
    const extra = { ...Bok, effective: [...Bok.effective, 'u2|camp.roles.manage|*'].sort() };
    expect(comparePerms(snap({ t: A }), snap({ t: extra }), 'v022-q9')).toEqual([
      'perms.t: + u2|camp.roles.manage|*',
      'perms.t: B дотор legacy ≠ effective (1 мөр) — шилжүүлэлт эсвэл загвар хэрэгжүүлээгүй',
    ]);
    const lost = { ...Bok, legacy: Bok.legacy.filter((k) => k !== `u2|${CLOSE}|C1`), effective: Bok.effective.filter((k) => k !== `u2|${CLOSE}|C1`) };
    expect(comparePerms(snap({ t: A }), snap({ t: lost }), 'v022-q9')).toEqual([`perms.t: − u2|${CLOSE}|C1`]);
    const noQ9 = { legacy: A.legacy, effective: A.legacy, campAdmins: A.campAdmins };
    expect(comparePerms(snap({ t: A }), snap({ t: noQ9 }), 'v022-q9')).toHaveLength(4);
  });

  it('хуучин хэрэгслээр авсан A (perms алга) → зөрүү; хоёуланд алга → шалгахгүй', () => {
    expect(compareSnapshots(snap(undefined), snap({ t: Bok }))).toEqual(['perms: нэг файлд алга — A ба B-г хоёуланг v0.2.2-ын хэрэгслээр авна уу']);
    expect(compareSnapshots(snap(undefined), snap(undefined))).toEqual([]);
  });
});
