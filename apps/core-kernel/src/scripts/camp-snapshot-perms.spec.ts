import { describe, it, expect } from 'vitest';
import { CampSnapshot, comparePerms, compareSnapshots, expectedQ9Additions, normalizePermKeys } from './camp-snapshot';

const snap = (perms: CampSnapshot['perms']): CampSnapshot => ({
  format: 'camp-snapshot/1', meta: { generatedAt: '', db: '', appVersion: null }, today: '2026-10-12', from: '', to: '', camps: {}, perms,
});
const PARTS = 'camp.maintenance.parts';
const CLOSE = 'camp.maintenance.close';
const TERM = 'camp.employee.terminate'; // v0.2.2 Блок 5 (B5-Q2)

describe('camp-snapshot perms (v0.2.2 §5.1/5.2)', () => {
  // A = v0.2.1 (effective = null): u1 Кемп админ (бүх кемп), u2 менежер C1, u3 Кемп админ C2 + менежер C1 (close@C1 аль хэдийн)
  const A = { legacy: ['u1|camp.report.view|*', `u2|${CLOSE}|C1`, `u3|${CLOSE}|C1`], effective: null, campAdmins: ['u1|*', 'u3|C2'] };
  const q9 = [`u1|${PARTS}|*`, `u1|${CLOSE}|*`, `u1|${TERM}|*`, `u3|${PARTS}|C2`, `u3|${CLOSE}|C2`, `u3|${TERM}|C2`];
  const Bok = { legacy: [...A.legacy, ...q9].sort(), effective: [...A.legacy, ...q9].sort(), campAdmins: A.campAdmins };

  it('expectedQ9Additions: олголт × {parts, close}, A-д байсныг хасна', () => {
    // ADR-007: хүлээгдэж буй мөр шинэ кодоор (camp.employee.terminate → hr.employee.terminate)
    expect([...expectedQ9Additions(A, Bok)].sort()).toEqual(normalizePermKeys(q9));
  });

  it('--expect=v022-q9: зөвхөн Q9 (+ terminate) нэмэгдсэн → зөрүүгүй; expect-гүй бол 6 мөр +', () => {
    expect(comparePerms(snap({ t: A }), snap({ t: Bok }), 'v022-q9')).toEqual([]);
    expect(comparePerms(snap({ t: A }), snap({ t: Bok }))).toHaveLength(6);
  });

  it('илүү эрх (+), алдсан эрх (−), хүлээгдэж буй Q9 алга, legacy ≠ effective → бүгд зөрүү', () => {
    const extra = { ...Bok, effective: [...Bok.effective, 'u2|camp.settings.manage|*'].sort() };
    expect(comparePerms(snap({ t: A }), snap({ t: extra }), 'v022-q9')).toEqual([
      'perms.t: + u2|camp.settings.manage|*',
      'perms.t: B дотор legacy ≠ effective (1 мөр) — шилжүүлэлт эсвэл загвар хэрэгжүүлээгүй',
    ]);
    const lost = { ...Bok, legacy: Bok.legacy.filter((k) => k !== `u2|${CLOSE}|C1`), effective: Bok.effective.filter((k) => k !== `u2|${CLOSE}|C1`) };
    expect(comparePerms(snap({ t: A }), snap({ t: lost }), 'v022-q9')).toEqual([`perms.t: − u2|${CLOSE}|C1`]);
    const noQ9 = { legacy: A.legacy, effective: A.legacy, campAdmins: A.campAdmins };
    expect(comparePerms(snap({ t: A }), snap({ t: noQ9 }), 'v022-q9')).toHaveLength(6);
  });

  it('хуучин хэрэгслээр авсан A (perms алга) → зөрүү; хоёуланд алга → шалгахгүй', () => {
    expect(compareSnapshots(snap(undefined), snap({ t: Bok }))).toEqual(['perms: нэг файлд алга — A ба B-г хоёуланг v0.2.2-ын хэрэгслээр авна уу']);
    expect(compareSnapshots(snap(undefined), snap(undefined))).toEqual([]);
  });
});

describe('camp-snapshot perms — ADR-007 (v0.2.3): хуучин код ↔ шинэ код', () => {
  // A = v0.2.2 (camp_*, хуучин код + camp.roles.manage), B = v0.2.3 (core_*, hr.* код, roles.manage алга)
  const oldKeys = ['u1|camp.roles.manage|*', 'u1|camp.employee.manage|*', 'u1|camp.movement.import|C1', 'u2|camp.shift.adjust|C1', `u2|${TERM}|*`, 'u3|camp.room.manage|C2'];
  const newKeys = ['u1|hr.employee.manage|*', 'u1|hr.attendance.import|C1', 'u2|hr.shift.adjust|C1', 'u2|hr.employee.terminate|*', 'u3|camp.room.manage|C2'];
  const A = { legacy: oldKeys, effective: oldKeys, campAdmins: ['u1|*'] };
  const B = { legacy: newKeys, effective: newKeys, campAdmins: ['u1|*'] };

  it('normalizePermKeys: alias → шинэ код, устгасан код хасагдана, эрэмбэтэй', () => {
    expect(normalizePermKeys(oldKeys)).toEqual([...newKeys].sort());
  });

  it('нэрлэлт ба camp.roles.manage устсан нь зөрүү биш (A = B)', () => {
    expect(comparePerms(snap({ t: A }), snap({ t: B }))).toEqual([]);
  });

  it('шинэ кодын бодит алдагдал → зөрүү', () => {
    const lost = { ...B, effective: newKeys.filter((k) => k !== 'u2|hr.shift.adjust|C1') };
    expect(comparePerms(snap({ t: A }), snap({ t: lost }))).toEqual([
      'perms.t: − u2|hr.shift.adjust|C1',
      'perms.t: B дотор legacy ≠ effective (1 мөр) — шилжүүлэлт эсвэл загвар хэрэгжүүлээгүй',
    ]);
  });
});
