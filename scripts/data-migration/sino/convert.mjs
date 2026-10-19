#!/usr/bin/env node
/**
 * v0.2.3 Блок D (Хэсэг II) — Sino Hydro-гийн одоо ашиглаж буй Excel → системийн импортын файлууд.
 *
 *   node scripts/data-migration/sino/convert.mjs --src docs/source --out _data/sino/out --org "<байгууллагын регистр эсвэл нэр>"
 *
 * Эх файлыг ЗӨВХӨН уншина (өөрчлөхгүй). Гаралт (хувийн мэдээлэлтэй → gitignore хийсэн хавтас):
 *   01_departments.xlsx · 02_positions.xlsx · 03_employees.xlsx · 04_former_employees.xlsx
 *   05_building_types.xlsx · 06_buildings.xlsx · 07_rooms.xlsx · 08_room_allocations.xlsx · 00_report.xlsx
 * Системд «Хүний нөөц → Импорт»-оос ДАРААЛЛААР оруулна (01 → 08). Дүрэм, толь: ./mapping.json, баримт: docs/08_Roadmap/V.0.2/12_v0.2.3_data_import.md
 *
 * Гол дүрэм (хэрэглэгчийн шийдвэр 2026-10-19):
 *   - Ажилтны ID → 5 орон (8101 → 08101). Овог, нэр, ургийн овог тусдаа. Олон утас → эхнийх үндсэн, бусад «Нэмэлт утас».
 *   - Ажиллаж буй: зөвхөн A/B/C/D ээлжийнх. ID-гүй, ээлжгүй, харуул/автобус (Z/W/N) → импортлохгүй (тайланд).
 *   - Ажлаас гарсан: ID-тэй бүгд (түүх); ID-гүй → тайланд. Гарсан огноо олон бол сүүлийнх.
 *   - Өрөө: 4 сарын хуудасны өрөө бүр; байр = дугаарын эхний орон; багтаамж = аль нэг өдөр хамгийн олон хоносон хүн.
 *   - Өрөөнд байрлуулалт: сар бүрийн хуудаснаас ажилтны өрөөний ТҮҮХ (өрөө солигдвол өмнөх нь шинийн өмнөх өдөр хаагдана).
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ExcelJS = require('exceljs');

// ── CLI ──────────────────────────────────────────────────────
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]?.startsWith('--') ? true : all[i + 1]]] : acc), []),
);
const SRC = path.resolve(args.src ?? 'docs/source');
const OUT = path.resolve(args.out ?? '_data/sino/out');
const MAP = JSON.parse(fs.readFileSync(new URL('./mapping.json', import.meta.url), 'utf8'));
const ORG = args.org ?? MAP.organization;
if (!ORG || ORG.startsWith('<')) {
  console.error('❌ --org "<байгууллагын регистр эсвэл нэр>" заавал (системд бүртгэлтэй байгууллага)');
  process.exit(1);
}

// ── Туслах ───────────────────────────────────────────────────
const report = { skipped: [], warnings: [], deptMap: new Map(), posMap: new Map() };
const skip = (file, sheet, row, code, name, reason) => report.skipped.push({ file, sheet, row, code: code ?? '', name: name ?? '', reason });
const warn = (file, sheet, row, code, field, value, note) => report.warnings.push({ file, sheet, row, code: code ?? '', field, value: String(value ?? '').slice(0, 120), note });

const CJK = /[⺀-鿿豈-﫿＀-￯　-〿]+/g;
/** Монгол хэсэг: хятад тэмдэгт, хоосон хаалт/налуу зураасыг хасна */
export const mnPart = (v) =>
  String(v ?? '')
    .replace(CJK, ' ')
    .replace(/[()（）/\\]+\s*[()（）/\\]*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[-–,:;]+$/, '')
    .trim();
const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
const cellVal = (v) => (v && typeof v === 'object' && !(v instanceof Date) ? (v.result ?? v.text ?? (v.richText ? v.richText.map((r) => r.text).join('') : null)) : v);

/** ID → 5 орон (зөвхөн цифр) */
export function normCode(v) {
  const s = clean(cellVal(v));
  if (!/^\d{1,5}$/.test(s)) return null;
  return s.padStart(5, '0');
}

const PHONE = /^(\+\d{8,15}|\d{8})$/;
export function splitPhones(v) {
  return clean(String(cellVal(v) ?? '').replace(/\n/g, ',')) === ''
    ? []
    : String(cellVal(v))
        .split(/[,;/\n\r]+|\s{2,}|\s(?=\+?\d{8})/)
        .map((p) => p.replace(/[\s\-()]/g, ''))
        .filter(Boolean);
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const pad2 = (n) => String(n).padStart(2, '0');
const iso = (y, m, d) => {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? `${y}-${pad2(m)}-${pad2(d)}` : null;
};
/** Огноо: Date, Excel serial, 'YYYY.M.D', 'YYYY/M/D', 'YYYY-MM-DD', 'M/D/YYYY'. Олон огноо → бүгдийг (дарааллаар) */
export function parseDates(v) {
  v = cellVal(v);
  if (v === null || v === undefined || v === '') return [];
  if (v instanceof Date) return [v.toISOString().slice(0, 10)];
  if (typeof v === 'number') {
    if (v > 20000 && v < 80000) return [new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 10)];
    return [];
  }
  const out = [];
  const s = String(v);
  for (const m of s.matchAll(/(\d{4})[./-](\d{1,2})[./-](\d{1,2})|(\d{1,2})\/(\d{1,2})\/(\d{4})|\b(4\d{4})\b/g)) {
    let d = null;
    if (m[1]) d = iso(+m[1], +m[2], +m[3]);
    else if (m[4]) d = iso(+m[6], +m[4], +m[5]);
    else if (m[7]) d = new Date(Math.round((+m[7] - 25569) * 86400000)).toISOString().slice(0, 10);
    if (d) out.push(d);
  }
  return out;
}

/** Ээлж: 'A ээлж', 'А ээлж' (кирилл), 'Д ээлж' → A–D; бусад → null */
export function crewOf(v) {
  const s = clean(cellVal(v)).toUpperCase();
  const m = s.match(/^([A-DАВСДБ])\s*ЭЭЛЖ/);
  if (!m) return null;
  return { A: 'A', B: 'B', C: 'C', D: 'D', А: 'A', В: 'B', Б: 'B', С: 'C', Д: 'D' }[m[1]];
}

function deptCode(raw) {
  const s = mnPart(raw).toUpperCase();
  if (!s) return null;
  for (const d of MAP.departments) if (d.match.some((m) => s.includes(m.toUpperCase()))) {
    report.deptMap.set(clean(raw), `${d.code} ${d.name}`);
    return d.code;
  }
  return undefined;
}

function positionName(raw) {
  let base = mnPart(raw);
  if (base) base = base[0].toUpperCase() + base.slice(1);
  if (MAP.positionOperatorSuffix) base = base.replace(/ оператор$/, ' операторч');
  const name = MAP.positionRename?.[base] ?? base;
  if (raw) report.posMap.set(clean(raw), name);
  return name || null;
}

function reasonOf(note) {
  const s = clean(note).toLowerCase();
  for (const r of MAP.terminationReasons) if (r.match.some((m) => s.includes(m.toLowerCase()))) return r.reason;
  return 'OTHER';
}

async function readSheetRows(file) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path.join(SRC, file));
  return wb.worksheets.map((ws) => {
    const rows = [];
    ws.eachRow({ includeEmpty: false }, (row, n) => rows.push({ n, cells: (row.values ?? []).slice(1).map(cellVal) }));
    return { name: ws.name, rows };
  });
}

async function writeXlsx(file, headers, rows, sheetName = 'Data') {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName);
  ws.addRow(headers.map((h) => h.label));
  for (const r of rows) ws.addRow(headers.map((h) => r[h.key] ?? null));
  ws.getRow(1).font = { bold: true };
  ws.columns.forEach((c, i) => (c.width = headers[i].width ?? 16));
  // Код, утас, огноо — текст (Excel тэгийг хасахгүй)
  headers.forEach((h, i) => {
    if (h.text) ws.getColumn(i + 1).numFmt = '@';
  });
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  await wb.xlsx.writeFile(path.join(OUT, file));
}

// ── 1. HR ────────────────────────────────────────────────────
const HR_FILE = MAP.files.hr;
const [activeSheet, formerSheet] = await readSheetRows(HR_FILE);

/** Нэг ажилтны мөр → импортын мөр (идэвхтэй / гарсан хуудас ижил баганатай: 1 ургийн овог, 2 овог, 3 нэр, 4 утас, 8 имэйл, 14 ID, 15 албан тушаал, 17 хэлтэс) */
function personRow(sheet, r, file) {
  const c = r.cells;
  const code = normCode(c[14]);
  const name = `${clean(c[2])} ${clean(c[3])}`.trim();
  const phones = splitPhones(c[4]);
  const valid = phones.filter((p) => PHONE.test(p));
  phones.filter((p) => !PHONE.test(p)).forEach((p) => warn(file, sheet, r.n, code, 'Утас', p, 'буруу дугаар — хасав'));
  let email = clean(c[8]).toLowerCase() || null;
  if (email && !EMAIL.test(email)) {
    warn(file, sheet, r.n, code, 'Имэйл', email, 'буруу имэйл — хасав');
    email = null;
  }
  const dept = deptCode(c[17]);
  if (dept === undefined) warn(file, sheet, r.n, code, 'Хэлтэс', c[17], 'mapping.json-д таарах хэлтэс алга');
  return {
    employeeCode: code,
    familyName: clean(c[1]) || null,
    lastName: clean(c[2]) || null,
    firstName: clean(c[3]) || null,
    position: positionName(c[15]),
    phone: valid[0] ?? null,
    extraPhones: valid.slice(1).join(', ') || null,
    email,
    organization: ORG,
    department: dept ?? null,
    _name: name,
  };
}

const isDataRow = (r) => typeof r.cells[0] === 'number' && r.cells.slice(1, 4).some((v) => clean(v));

const employees = [];
const activeCodes = new Map();
for (const r of activeSheet.rows.filter(isDataRow)) {
  const p = personRow(activeSheet.name, r, HR_FILE);
  const crew = crewOf(r.cells[36]);
  if (!p.employeeCode) { skip(HR_FILE, activeSheet.name, r.n, r.cells[14], p._name, 'ID алга / буруу'); continue; }
  if (!crew) { skip(HR_FILE, activeSheet.name, r.n, p.employeeCode, p._name, `A/B/C/D ээлж биш: "${clean(r.cells[36]) || '—'}"`); continue; }
  if (!p.firstName) { skip(HR_FILE, activeSheet.name, r.n, p.employeeCode, p._name, 'Нэр алга'); continue; }
  if (!p.department) { skip(HR_FILE, activeSheet.name, r.n, p.employeeCode, p._name, 'Хэлтэс тодорхойгүй'); continue; }
  if (activeCodes.has(p.employeeCode)) { skip(HR_FILE, activeSheet.name, r.n, p.employeeCode, p._name, `ID давхардсан (${activeCodes.get(p.employeeCode)}-р мөр)`); continue; }
  activeCodes.set(p.employeeCode, r.n);
  if (clean(r.cells[20])) warn(HR_FILE, activeSheet.name, r.n, p.employeeCode, 'Ажлаас гарсан өдөр', r.cells[20], 'идэвхтэй ажилтанд бөглөгдсөн — импортлоогүй (өмнө гарч дахин орсон байж магадгүй)');
  employees.push({ ...p, crew, status: 'ACTIVE' });
}

const former = [];
const formerKeys = new Set();
const today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
for (const r of formerSheet.rows.filter(isDataRow)) {
  const p = personRow(formerSheet.name, r, HR_FILE);
  if (!p.employeeCode) { skip(HR_FILE, formerSheet.name, r.n, r.cells[14], p._name, 'ID алга / буруу (хэрэглэгчийн шийдвэр: ID-гүйг оруулахгүй)'); continue; }
  if (!p.firstName) { skip(HR_FILE, formerSheet.name, r.n, p.employeeCode, p._name, 'Нэр алга'); continue; }
  if (!p.department) { skip(HR_FILE, formerSheet.name, r.n, p.employeeCode, p._name, 'Хэлтэс тодорхойгүй'); continue; }
  const dates = parseDates(r.cells[20]).filter((d) => d <= today);
  if (dates.length === 0) { skip(HR_FILE, formerSheet.name, r.n, p.employeeCode, p._name, `Гарсан огноо уншигдсангүй: "${clean(r.cells[20]) || '—'}"`); continue; }
  const terminatedAt = dates.sort().at(-1);
  if (dates.length > 1) warn(HR_FILE, formerSheet.name, r.n, p.employeeCode, 'Ажлаас гарсан өдөр', r.cells[20], `олон огноо — сүүлийнх ${terminatedAt}`);
  const key = `${p.employeeCode}|${terminatedAt}`;
  if (formerKeys.has(key)) { skip(HR_FILE, formerSheet.name, r.n, p.employeeCode, p._name, `Давхардсан мөр (ID + огноо ${terminatedAt})`); continue; }
  formerKeys.add(key);
  const note = clean(r.cells[7]);
  const reason = reasonOf(note);
  const crew = [34, 35, 36].map((i) => crewOf(r.cells[i])).find(Boolean) ?? null;
  former.push({
    ...p, crew, terminatedAt, terminationReason: reason,
    terminationNote: (note || (reason === 'OTHER' ? MAP.defaultTerminationNote : '')).slice(0, 500) || null,
  });
}

// ── 2. Хэлтэс, албан тушаал ──────────────────────────────────
const usedDepts = new Set([...employees, ...former].map((e) => e.department));
const departments = MAP.departments.filter((d) => usedDepts.has(d.code)).map((d) => ({ code: d.code, name: d.name, active: true }));
const posSeen = new Map(); // жижиг/том үсэг ялгахгүй (системийн нормчлолтой ижил)
for (const e of [...employees, ...former]) if (e.position && !posSeen.has(e.position.toLowerCase())) posSeen.set(e.position.toLowerCase(), e.position);
for (const e of [...employees, ...former]) if (e.position) e.position = posSeen.get(e.position.toLowerCase());
const positions = [...new Set(posSeen.values())]
  .sort((a, b) => a.localeCompare(b, 'mn'))
  .map((name) => ({ name, code: null, active: true }));
// Ажлын байрны индекс (идэвхтэй хуудас, багана 16) — албан тушаалд хамгийн олон давтагдсан
const idx = new Map();
for (const r of activeSheet.rows.filter(isDataRow)) {
  const name = positionName(r.cells[15]);
  const code = clean(r.cells[16]);
  if (!name || !code) continue;
  const m = idx.get(name) ?? new Map();
  m.set(code, (m.get(code) ?? 0) + 1);
  idx.set(name, m);
}
for (const p of positions) {
  const m = idx.get(p.name);
  if (m) p.code = [...m.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

// ── 3. Өрөө ба байрлуулалт ───────────────────────────────────
const ROOM_FILE = MAP.files.rooms;
const roomSheets = await readSheetRows(ROOM_FILE);
const PRESENT = new Set(MAP.roomCodes.present);
const allCodes = new Map([...employees.map((e) => [e.employeeCode, 'ACTIVE']), ...former.map((e) => [e.employeeCode, 'FORMER'])]);
const rooms = new Map(); // roomNo → { maxPerDay }
const evidence = new Map(); // code → [{ date, room, last }]
const monthOf = (name) => {
  const m = name.match(/(\d{4})\s*([A-Za-z]+)/);
  const mon = m && ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(m[2].slice(0, 3).toLowerCase());
  return m && mon >= 0 ? { y: +m[1], m: mon + 1 } : null;
};
let lastMonthKey = '';
for (const sh of roomSheets) {
  const ym = monthOf(sh.name);
  if (!ym) { warn(ROOM_FILE, sh.name, '', '', 'Хуудас', sh.name, 'сар тодорхойгүй — алгасав'); continue; }
  const head = sh.rows[0];
  // Өдрийн баганууд: толгойд 1..31 бүхэл тоо (6-аас хойш)
  const dayCols = head.cells.map((v, i) => ({ i, d: typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 31 && i >= 6 ? v : null })).filter((x) => x.d && iso(ym.y, ym.m, x.d));
  const monthKey = `${ym.y}-${pad2(ym.m)}`;
  if (monthKey > lastMonthKey) lastMonthKey = monthKey;
  const perRoomDay = new Map();
  for (const r of sh.rows.slice(1)) {
    const c = r.cells;
    const roomNo = clean(c[0]);
    const code = normCode(c[2]);
    const shift = clean(c[1]).toUpperCase();
    const name = `${clean(c[3])} ${clean(c[4])}`.trim();
    if (!roomNo && !code && !name) continue;
    if (!/^\d{3,4}$/.test(roomNo)) { if (code || name) skip(ROOM_FILE, sh.name, r.n, code, name, `Өрөөний дугаар буруу: "${roomNo || '—'}"`); continue; }
    if (!rooms.has(roomNo)) rooms.set(roomNo, { max: 0 });
    const days = dayCols.filter(({ i }) => PRESENT.has(clean(c[i]).toUpperCase()) || MAP.roomCodes.departure.includes(clean(c[i]).toUpperCase()));
    const nights = dayCols.filter(({ i }) => PRESENT.has(clean(c[i]).toUpperCase()));
    for (const { d } of nights) perRoomDay.set(`${roomNo}|${d}`, (perRoomDay.get(`${roomNo}|${d}`) ?? 0) + 1);
    if (!code) { skip(ROOM_FILE, sh.name, r.n, '', name, `ID алга (ээлж ${shift || '—'}) — байрлуулалт оруулахгүй`); continue; }
    if (!['A', 'B', 'C', 'D', 'С', 'А', 'В', 'Д'].includes(shift)) { skip(ROOM_FILE, sh.name, r.n, code, name, `A/B/C/D ээлж биш (${shift || '—'}) — байрлуулалт оруулахгүй`); continue; }
    if (!allCodes.has(code)) { skip(ROOM_FILE, sh.name, r.n, code, name, 'HR файлд энэ ID алга (идэвхтэй ч, гарсан ч биш)'); continue; }
    const first = days[0] ? iso(ym.y, ym.m, days[0].d) : `${monthKey}-01`;
    const last = days.at(-1) ? iso(ym.y, ym.m, days.at(-1).d) : null;
    evidence.set(code, [...(evidence.get(code) ?? []), { date: first, last, room: roomNo, month: monthKey }]);
  }
  for (const [k, n] of perRoomDay) {
    const roomNo = k.split('|')[0];
    rooms.get(roomNo).max = Math.max(rooms.get(roomNo).max, n);
  }
}

const buildingOf = (roomNo) => MAP.buildings.prefix + roomNo[0];
const buildingCodes = [...new Set([...rooms.keys()].map(buildingOf))].sort();
const buildingTypes = [{ name: MAP.buildings.type, active: true }];
const buildings = buildingCodes.map((code) => ({ code, name: MAP.buildings.name.replace('{n}', code.slice(MAP.buildings.prefix.length)), type: MAP.buildings.type, active: true }));
const roomRows = [...rooms.entries()]
  .sort((a, b) => a[0].localeCompare(b[0], 'en', { numeric: true }))
  .map(([roomNo, r]) => ({ building: buildingOf(roomNo), roomNo, floor: null, capacity: Math.max(1, r.max), status: 'ACTIVE', note: r.max === 0 ? MAP.buildings.emptyRoomNote : null }));

const formerLast = new Map();
for (const f of former) if (!formerLast.has(f.employeeCode) || f.terminatedAt > formerLast.get(f.employeeCode)) formerLast.set(f.employeeCode, f.terminatedAt);
const allocations = [];
for (const [code, evs] of evidence) {
  evs.sort((a, b) => a.date.localeCompare(b.date));
  const segs = [];
  for (const e of evs) {
    const cur = segs.at(-1);
    if (cur && cur.room === e.room) { cur.last = e.last ?? cur.last; cur.lastMonth = e.month; continue; }
    if (cur) cur.end = addDays(e.date, -1);
    segs.push({ room: e.room, start: e.date, last: e.last, lastMonth: e.month, end: undefined });
  }
  const isActive = allCodes.get(code) === 'ACTIVE';
  const tail = segs.at(-1);
  // Одоо байгаа: идэвхтэй + хамгийн сүүлийн сарын хуудсанд байгаа → дуусаагүй
  tail.end = isActive && tail.lastMonth === lastMonthKey ? null : (tail.last ?? tail.start);
  for (const s of segs) {
    if (!isActive) {
      const t = formerLast.get(code);
      if (t && s.start > t) { skip(ROOM_FILE, '', '', code, '', `Байрлуулалт (${s.room}, ${s.start}) гарсан өдрөөс (${t}) хойш — алгасав`); continue; }
      if (t && (s.end === null || s.end > t)) s.end = t;
    }
    if (s.end !== null && s.end < s.start) s.end = s.start;
    allocations.push({ employeeCode: code, building: buildingOf(s.room), roomNo: s.room, startDate: s.start, endDate: s.end });
  }
}
function addDays(isoDate, n) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
allocations.sort((a, b) => a.employeeCode.localeCompare(b.employeeCode) || a.startDate.localeCompare(b.startDate));

// ── 4. Гаралт ────────────────────────────────────────────────
fs.mkdirSync(OUT, { recursive: true });
const H = (key, label, extra = {}) => ({ key, label, ...extra });
const empHeaders = [
  H('employeeCode', 'Ажилтны код', { text: true, width: 12 }), H('lastName', 'Овог', { width: 18 }), H('firstName', 'Нэр', { width: 18 }), H('familyName', 'Ургийн овог', { width: 16 }),
  H('position', 'Албан тушаал', { width: 32 }), H('phone', 'Утас', { text: true, width: 12 }), H('extraPhones', 'Нэмэлт утас', { text: true, width: 22 }), H('email', 'Имэйл', { width: 26 }),
  H('organization', 'Байгууллага (регистр эсвэл нэр)', { width: 20 }), H('department', 'Хэлтсийн код', { text: true, width: 10 }), H('crew', 'Ростерын код', { width: 10 }),
];
await writeXlsx('01_departments.xlsx', [H('code', 'Хэлтсийн код', { text: true }), H('name', 'Нэр', { width: 36 }), H('active', 'Идэвхтэй')], departments);
await writeXlsx('02_positions.xlsx', [H('name', 'Албан тушаал', { width: 40 }), H('code', 'Ажлын байрны индекс', { text: true }), H('active', 'Идэвхтэй')], positions);
await writeXlsx('03_employees.xlsx', [...empHeaders, H('status', 'Төлөв')], employees);
await writeXlsx('04_former_employees.xlsx', [...empHeaders, H('terminatedAt', 'Ажлаас гарсан огноо', { text: true, width: 14 }), H('terminationReason', 'Гарсан шалтгаан', { width: 14 }), H('terminationNote', 'Тайлбар', { width: 40 })], former);
await writeXlsx('05_building_types.xlsx', [H('name', 'Байрны төрөл', { width: 24 }), H('active', 'Идэвхтэй')], buildingTypes);
await writeXlsx('06_buildings.xlsx', [H('code', 'Байрны код', { text: true }), H('name', 'Байрны нэр', { width: 20 }), H('type', 'Байрны төрөл', { width: 20 }), H('active', 'Идэвхтэй')], buildings);
await writeXlsx('07_rooms.xlsx', [H('building', 'Байрны код', { text: true }), H('roomNo', 'Өрөөний дугаар', { text: true }), H('floor', 'Давхар'), H('capacity', 'Багтаамж'), H('status', 'Төлөв'), H('note', 'Тэмдэглэл', { width: 30 })], roomRows);
await writeXlsx('08_room_allocations.xlsx', [H('employeeCode', 'Ажилтны код', { text: true }), H('building', 'Байрны код', { text: true }), H('roomNo', 'Өрөөний дугаар', { text: true }), H('startDate', 'Эхэлсэн огноо', { text: true, width: 14 }), H('endDate', 'Дууссан огноо', { text: true, width: 14 })], allocations);

// Тайлан
const rep = new ExcelJS.Workbook();
const add = (name, headers, rows) => {
  const ws = rep.addWorksheet(name);
  ws.addRow(headers);
  rows.forEach((r) => ws.addRow(r));
  ws.getRow(1).font = { bold: true };
  ws.columns.forEach((c) => (c.width = 22));
  ws.views = [{ state: 'frozen', ySplit: 1 }];
};
const summary = [
  ['01 Хэлтэс', departments.length], ['02 Албан тушаал', positions.length], ['03 Ажилтан (идэвхтэй, A–D)', employees.length],
  ['04 Ажлаас гарсан (түүх)', former.length], ['05 Байрны төрөл', buildingTypes.length], ['06 Байр', buildings.length], ['07 Өрөө', roomRows.length],
  ['08 Өрөөнд байрлуулалт', allocations.length], ['Хасагдсан мөр', report.skipped.length], ['Анхааруулга', report.warnings.length],
  ['Байгууллага (--org)', ORG], ['Сүүлийн сар (одоогийн байрлуулалт)', lastMonthKey],
];
add('Хураангуй', ['Файл / үзүүлэлт', 'Тоо'], summary);
add('Хасагдсан', ['Файл', 'Хуудас', 'Мөр', 'ID', 'Нэр', 'Шалтгаан'], report.skipped.map((s) => [s.file, s.sheet, s.row, s.code, s.name, s.reason]));
add('Анхааруулга', ['Файл', 'Хуудас', 'Мөр', 'ID', 'Талбар', 'Утга', 'Тайлбар'], report.warnings.map((w) => [w.file, w.sheet, w.row, w.code, w.field, w.value, w.note]));
add('Хэлтсийн толь', ['Эх бичлэг', 'Код + нэр'], [...report.deptMap.entries()].sort());
add('Албан тушаалын толь', ['Эх бичлэг', 'Цэвэрлэсэн нэр'], [...report.posMap.entries()].sort());
await rep.xlsx.writeFile(path.join(OUT, '00_report.xlsx'));

console.log(`✅ ${OUT}`);
for (const [k, v] of summary) console.log(`   ${k}: ${v}`);
