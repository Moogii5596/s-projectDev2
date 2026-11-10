import { describe, it, expect } from 'vitest';
import { CampSnapshot, comparePerms, compareSnapshots, expectedQ9Additions, normalizePermKeys } from './camp-snapshot';

const snap = (
  perms: CampSnapshot['perms'],
  extras: Pick<CampSnapshot, 'modules' | 'i18nOverrides'> = {},
): CampSnapshot => ({
  format: 'camp-snapshot/2',
  meta: { generatedAt: '', db: '', appVersion: null },
  today: '2026-10-12',
  from: '',
  to: '',
  camps: {},
  perms,
  ...extras,
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
      'perms.t: legacy/effective зөрүү өөрчлөгдсөн (1 мөр) — шилжүүлэлт эсвэл загварыг шалгана',
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
      'perms.t: legacy/effective зөрүү өөрчлөгдсөн (1 мөр) — шилжүүлэлт эсвэл загварыг шалгана',
    ]);
  });

  it('өмнөх шууд эрхийн зөрүү хэвээр байвал зөвшөөрч, шинэ зөрүүг илрүүлнэ', () => {
    const before = { ...A, legacy: oldKeys.filter((k) => k !== 'u1|camp.employee.manage|*') };
    const after = { ...B, legacy: newKeys.filter((k) => k !== 'u1|hr.employee.manage|*') };
    expect(comparePerms(snap({ t: before }), snap({ t: after }))).toEqual([]);
    const changed = { ...after, legacy: after.legacy.filter((k) => k !== 'u2|hr.shift.adjust|C1') };
    expect(comparePerms(snap({ t: before }), snap({ t: changed }))).toEqual([
      'perms.t: legacy/effective зөрүү өөрчлөгдсөн (1 мөр) — шилжүүлэлт эсвэл загварыг шалгана',
    ]);
  });
});

describe('camp-snapshot perms — v0.2.4 shared Core permissions', () => {
  it('core organization/exchange-rate grants preserve the previous effective permissions (A = B)', () => {
    const before = ['u1|camp.master.manage|*', 'u1|camp.contract.manage|C1'];
    const after = [
      ...before,
      'u1|core.organization.manage|*',
      'u1|core.exchange_rate.manage|C1',
    ];
    expect(normalizePermKeys(after)).toEqual(normalizePermKeys(before));
    expect(comparePerms(
      snap({ t: { legacy: before, effective: before, campAdmins: [] } }),
      snap({ t: { legacy: after, effective: after, campAdmins: [] } }),
    )).toEqual([]);
  });
});

describe('camp-snapshot v0.2.4 module and translation preservation', () => {
  it('existing module states are preserved; migration-added module defaults do not count as data loss', () => {
    const before = snap(undefined, {
      modules: { sinohydro: { core: 'ACTIVE', camp: 'ACTIVE', reports: 'SUSPENDED' } },
    });
    const after = snap(undefined, {
      modules: { sinohydro: { core: 'ACTIVE', camp: 'ACTIVE', reports: 'SUSPENDED', feed: 'ACTIVE' } },
    });
    expect(compareSnapshots(before, after)).toEqual([]);
  });

  it('detects changed or removed module states', () => {
    const before = snap(undefined, {
      modules: { sinohydro: { camp: 'ACTIVE', reports: 'SUSPENDED' } },
    });
    const after = snap(undefined, {
      modules: { sinohydro: { camp: 'SUSPENDED' } },
    });
    expect(compareSnapshots(before, after)).toEqual([
      'modules.sinohydro.camp: ACTIVE → SUSPENDED',
      'modules.sinohydro.reports: B-д алга',
    ]);
  });

  it('detects added, removed, and changed translation overrides without exposing their text', () => {
    const before = snap(undefined, {
      i18nOverrides: { sinohydro: { 'camp.title|mn': 'hash-old', 'camp.submit|en': 'hash-kept' } },
    });
    const after = snap(undefined, {
      i18nOverrides: { sinohydro: { 'camp.title|mn': 'hash-new', 'camp.extra|zh': 'hash-added' } },
    });
    expect(compareSnapshots(before, after)).toEqual([
      'i18nOverrides.sinohydro.camp.extra|zh: +',
      'i18nOverrides.sinohydro.camp.submit|en: −',
      'i18nOverrides.sinohydro.camp.title|mn: агуулга өөрчлөгдсөн',
    ]);
  });

  it('requires both snapshots to capture module and translation state', () => {
    const before = snap(undefined);
    const after = snap(undefined, { modules: {}, i18nOverrides: {} });
    expect(compareSnapshots(before, after)).toEqual([
      'modules: нэг файлд алга — шинэ camp:snapshot хэрэгслээр A ба B-г хоёуланг авна уу',
      'i18nOverrides: нэг файлд алга — шинэ camp:snapshot хэрэгслээр A ба B-г хоёуланг авна уу',
    ]);
  });
});
