#!/usr/bin/env node
/**
 * S Project — Codebase Atlas generator (docs/09_Codebase/*, AUTO-GENERATED хэсэг)
 *
 * Кодоос каталог үүсгэнэ — хөгжүүлэлтийн үед кодыг дахин дахин уншихгүйн тулд:
 *   02_API_Catalog · 03_DB_Catalog · 05_Permissions_Catalog · 06_Config_Env · 07_Test_Map · 09_Frontend_Routes
 *   + docs/lessons_learned.md (lessons/LL-*.md-ийн индекс) + vault шалгалт (frontmatter, [[линк]], orphan, lessons ID)
 *
 * Ашиглах:  pnpm docs:gen      — үүсгэх / шинэчлэх (агуулга өөрчлөгдөөгүй файлд хүрэхгүй)
 *           pnpm docs:check    — хоцорсон баримт эсвэл vault алдаа байвал exit 1 (блок дуусгахын өмнө / CI)
 * Хамаарал: зөвхөн Node 18+ (fs, path) — нэмэлт багц шаардлагагүй.
 * Дүрэм:   RULE-21 (docs/08_Roadmap/00_rules_and_context.md). Гараар засахгүй — кодыг засаад дахин үүсгэнэ.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(ROOT, 'docs', '09_Codebase');
const CHECK = process.argv.includes('--check');
const TODAY = new Date().toISOString().slice(0, 10);

// ───────────────────────────── helpers ─────────────────────────────
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');
const read = (p) => fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
const exists = (p) => fs.existsSync(p);
function walk(dir, pred, out = []) {
  if (!exists(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'dist', 'coverage', '.turbo', '@mf-types'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, pred, out);
    else if (pred(p)) out.push(p);
  }
  return out.sort();
}
const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ').trim();
const lineOf = (text, idx) => text.slice(0, idx).split('\n').length;

function frontmatter(title, type, tags) {
  return `---\ntitle: "${title}"\ntype: "${type}"\nstatus: "Active"\nlast_updated: ${TODAY}\ntags: [${tags.join(', ')}]\n---\n\n`;
}
const BANNER =
  '> 🤖 **AUTO-GENERATED** — `pnpm docs:gen` (`scripts/docs/gen-codebase-docs.mjs`). Гараар бүү зас: кодыг засаад дахин үүсгэ. ' +
  'Зураглал: [[00_Codebase_Map]] · Дүрэм: RULE-21 ([[00_rules_and_context]]).\n';

const results = [];
function emit(file, title, type, tags, body, banner = BANNER) {
  const p = path.join(OUT, file);
  const stripDate = (s) => s.replace(/^last_updated: .*$/m, '');
  const next = frontmatter(title, type, tags) + `# ${title}\n\n` + banner + '\n' + body.trimEnd() + '\n';
  const prev = exists(p) ? read(p) : null;
  const changed = prev === null || stripDate(prev) !== stripDate(next);
  results.push({ file: rel(p), changed });
  if (changed && !CHECK) {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, next, 'utf8');
  }
}
/** Vault-ийн бүтцийн алдаа (docs:check-ийг унагана). */
const problems = [];

// ───────────────────────────── 1. API ─────────────────────────────
const SRC = path.join(ROOT, 'apps/core-kernel/src');
const tsFiles = walk(SRC, (p) => p.endsWith('.ts') && !p.endsWith('.spec.ts') && !p.includes(`${path.sep}tests${path.sep}`));

let globalPrefix = 'api/v1';
for (const f of tsFiles) {
  const m = read(f).match(/GLOBAL_PREFIX\s*=\s*['"]([^'"]+)['"]/);
  if (m) globalPrefix = m[1];
}

// class → file (service-ийн методыг олоход)
const classFile = new Map();
for (const f of tsFiles) for (const m of read(f).matchAll(/export\s+class\s+(\w+)/g)) classFile.set(m[1], f);

// CAMP_PERMISSIONS (= PERMISSIONS) константын нэр → код. v0.2.3 (ADR-007): эх нь core/permissions/permission-registry.ts
const permFile = path.join(SRC, 'modules/core/permissions/permission-registry.ts');
const PERM_CONST = new Map();
if (exists(permFile)) {
  const body = read(permFile).match(/\bPERMISSIONS\s*=\s*\{([\s\S]*?)\}\s*as const/);
  if (body) for (const m of body[1].matchAll(/(\w+)\s*:\s*'([^']+)'/g)) PERM_CONST.set(m[1], m[2]);
}

/** Классын методын бие (2 зайн доголтой мөрөөс дараагийн гишүүн хүртэл). */
function methodBody(src, name) {
  const re = new RegExp(`^ {2}(?:public |private |protected )?(?:async )?${name}\\s*[(<]`, 'm');
  const m = re.exec(src);
  if (!m) return null;
  const rest = src.slice(m.index + m[0].length);
  const end = rest.search(/\n {2}(?:public |private |protected |async |readonly |static |get |set )?[A-Za-z_]\w*\s*[(<=:]|\n {2}@|\n\}/);
  return rest.slice(0, end === -1 ? undefined : end);
}
function permsIn(text, aliases = ['CAMP_PERMISSIONS']) {
  const out = new Set();
  for (const a of aliases) for (const m of text.matchAll(new RegExp(`\\b${a}\\.(\\w+)`, 'g'))) out.add(PERM_CONST.get(m[1]) ?? m[1]);
  for (const m of text.matchAll(/'(camp\.[a-z]+\.[a-z]+)'/g)) out.add(m[1]);
  return [...out];
}
/** Файл дахь CAMP_PERMISSIONS-ийн alias (`const P = CAMP_PERMISSIONS` эсвэл `import { CAMP_PERMISSIONS as P }`). */
// v0.2.3 Блок 5: `PERMISSIONS.X` (core/permissions/permission-registry — feed г.м. шинэ код)
const permAliases = (src) => ['CAMP_PERMISSIONS', 'PERMISSIONS', ...[...src.matchAll(/(?:const\s+(\w+)\s*=\s*CAMP_PERMISSIONS\b|CAMP_PERMISSIONS\s+as\s+(\w+))/g)].map((m) => m[1] ?? m[2])];
/** Service методын эрх + гишүүнчлэлийн шалгалт; нэг түвшин гүнзгий (`this.helper(`). */
/** `export const TABLE = { key: { … perms: [P.X] … } }` → тухайн key-ийн эрх (өгөгдлөөр удирдсан шалгалт). */
function tablePerms(table, key) {
  for (const f of tsFiles) {
    const src = read(f);
    const i = src.search(new RegExp(`export const ${table}\\b[^=]*=\\s*\\{`));
    if (i === -1) continue;
    const entry = src.slice(i).match(new RegExp(`\\n\\s+${key}\\s*:\\s*\\{([^\\n]*)`));
    return entry ? permsIn(entry[1], permAliases(src)) : null;
  }
  return null;
}
function analyzeMethod(file, name, literals = []) {
  const src = read(file);
  const aliases = permAliases(src);
  const body = methodBody(src, name);
  if (!body) return { perms: [], access: false };
  for (const m of body.matchAll(/\b([A-Z][A-Z0-9_]+)\[(\w+)\]/g)) {
    for (const lit of literals) {
      const tp = tablePerms(m[1], lit);
      if (tp && tp.length) return { perms: tp, access: true, via: m[1] };
    }
  }
  let text = body;
  for (const m of body.matchAll(/this\.(\w+)\(/g)) {
    const h = methodBody(src, m[1]);
    if (h) text += h;
  }
  // v0.2.2 Блок 6б (SEC-009): requireTenantAdmin → системийн роль OWNER / ADMIN
  return { perms: permsIn(text, aliases), access: /\.requireAccess\(|\.require\w*\(/.test(text), admin: /\.requireTenantAdmin\(/.test(text) };
}

const controllers = tsFiles.filter((f) => f.endsWith('.controller.ts'));
const apiRows = [];
const HTTP = ['Get', 'Post', 'Put', 'Patch', 'Delete'];
for (const f of controllers) {
  const full = read(f);
  const starts = [...full.matchAll(/@Controller\(/g)].map((m) => m.index);
  starts.forEach((st, k) => {
    // декоратор хэсгийг (@SkipAuth г.м.) өмнөх мөрүүдээс хамруулна
    const segStart = k === 0 ? 0 : starts[k - 1] + 1 + full.slice(starts[k - 1] + 1, st).lastIndexOf('\n}') + 2;
    const segEnd = k + 1 < starts.length ? starts[k + 1] : full.length;
    const seg = full.slice(segStart, segEnd);
    const lineBase = lineOf(full, segStart) - 1;
    const cm = full.slice(st).match(/^@Controller\(\s*(?:'([^']*)'|"([^"]*)"|\{[^}]*path:\s*'([^']*)'[^}]*\})?\s*\)[\s\S]*?export\s+class\s+(\w+)/);
    if (!cm) return;
    const prefix = cm[1] ?? cm[2] ?? cm[3] ?? '';
    const ctrl = cm[4];
    const classHead = full.slice(segStart, st + cm[0].length);
    const classLevelSkip = /@SkipAuth\(\)/.test(classHead);
    const fields = new Map();
    for (const m of seg.matchAll(/(?:private|public|protected)\s+(?:readonly\s+)?(\w+)\s*:\s*(\w+)/g)) fields.set(m[1], m[2]);
    const lines = seg.split('\n');
    let decos = [];
    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i];
      const d = ln.match(/^ {2}@(\w+)\((.*)$/);
      if (d) {
        decos.push({ name: d[1], arg: d[2].replace(/\)\s*$/, '') });
        continue;
      }
      const mm = ln.match(/^ {2}(?:async )?(\w+)\s*\(/);
      if (mm && decos.length) {
        const verb = decos.find((x) => HTTP.includes(x.name));
        if (verb) {
          const sub = (verb.arg.match(/['"`]([^'"`]*)['"`]/) || [null, ''])[1];
          const route = '/' + [globalPrefix, prefix, sub].filter(Boolean).join('/').replace(/\/+/g, '/');
          let body = '';
          for (let j = i; j < lines.length && j < i + 60; j++) {
            body += lines[j] + '\n';
            if (j > i && /^ {2}\}/.test(lines[j])) break;
          }
          const call = body.match(/this\.(\w+)\.(\w+)\(/);
          let svc = '';
          let perms = [];
          let access = false;
          let via = '';
          let admin = false;
          if (call) {
            const cls = fields.get(call[1]);
            svc = `${cls ?? call[1]}.${call[2]}`;
            const sf = cls && classFile.get(cls);
            const literals = [...(body.slice(call.index).match(/\(([^)]*)\)/)?.[1] ?? '').matchAll(/'([a-zA-Z_]+)'/g)].map((x) => x[1]);
            if (sf) ({ perms, access, via, admin = false } = analyzeMethod(sf, call[2], literals));
          }
          perms = [...new Set([...perms, ...permsIn(body)])];
          const pub = classLevelSkip || decos.some((x) => x.name === 'SkipAuth');
          const notes = decos
            .filter((x) => ['UseGuards', 'AllowPasswordChangeRequired', 'UseInterceptors'].includes(x.name))
            .map((x) => (x.name === 'UseGuards' ? `UseGuards(${x.arg})` : x.name));
          apiRows.push({ verb: verb.name.toUpperCase(), full: route, sub, ctrl, method: mm[1], svc, perms, access, via, admin, pub, notes, file: rel(f), line: lineBase + i + 1 });
        }
        decos = [];
      } else if (/^ {2}[^ @/*]/.test(ln)) {
        decos = [];
      }
    }
  });
}
// v0.2.2 H1: өвлөсөн controller (`@Controller('x') … class A extends B {}`) — B-ийн route-уудыг A-ийн угтвараар (хуучин замууд, Deprecation)
for (const f of controllers) {
  const full = read(f);
  for (const m of full.matchAll(/@Controller\(\s*'([^']*)'\s*\)\s*((?:@\w+\([^)]*\)\s*)*)export\s+class\s+(\w+)\s+extends\s+(\w+)\s*\{\s*\}/g)) {
    const [, prefix, decoText, ctrl, parent] = m;
    const extra = /DeprecatedRouteInterceptor/.test(decoText) ? ['Deprecated'] : [];
    for (const r of apiRows.filter((x) => x.ctrl === parent)) {
      const route = '/' + [globalPrefix, prefix, r.sub].filter(Boolean).join('/').replace(/\/+/g, '/');
      apiRows.push({ ...r, full: route, ctrl: `${ctrl} (extends ${parent})`, notes: [...r.notes, ...extra], file: rel(f), line: lineOf(full, m.index) });
    }
  }
}
{
  const byArea = new Map();
  for (const r of apiRows) {
    const area = r.file.replace(/^apps\/core-kernel\/src\//, '').replace(/\/[^/]+$/, '');
    if (!byArea.has(area)) byArea.set(area, []);
    byArea.get(area).push(r);
  }
  let body =
    `Нийт **${apiRows.length}** endpoint, ${controllers.length} controller. Угтвар: \`/${globalPrefix}\`. ` +
    'Нэвтрэлт: бүх route анхдагчаар `TenantAuthGuard` (JWT → tenant) — 🌐 = `@SkipAuth()` (нэвтрэлтгүй).\n\n' +
    '**Эрх** багана: controller-ийн дуудсан service метод (+ түүний дуудсан нэг түвшний `this.*` туслах метод) дахь `CAMP_PERMISSIONS.*` — ' +
    'олон код = аль нэг нь / нөхцөлтэй байж болно. `(TABLE)` = үйлдлийн хүснэгтээс яг тухайн үйлдлийн эрх (жишээ нь засварын `TRANSITIONS`). ' +
    '**OWNER·ADMIN** = зөвхөн системийн роль (`requireTenantAdmin` — хэрэглэгч / роль удирдах, SEC-009), `гишүүн` = зөвхөн кемпийн гишүүнчлэл (`requireAccess`), `—` = шууд олдсонгүй (core role / tenant л) → service-ийг шалга. ' +
    'Эрхийн жагсаалт: [[05_Permissions_Catalog]] · модулийн тайлбар: [[01_Backend_Modules]].\n\n## Агуулга\n\n';
  for (const [area, rows] of byArea) body += `- [[#${area}]] — ${rows.length}\n`;
  for (const [area, rows] of byArea) {
    body += `\n## ${area}\n\n| Method | Зам | Handler → Service | Эрх | Тэмдэглэл |\n|---|---|---|---|---|\n`;
    for (const r of rows) {
      const perms = (r.perms.length ? r.perms.map((p) => `\`${p}\``).join(' ') + (r.admin ? ' / OWNER·ADMIN' : '') : r.admin ? '**OWNER·ADMIN**' : r.access ? 'гишүүн' : '—') + (r.via ? ` (\`${r.via}\`)` : '');
      const note = [r.pub ? '🌐' : '', ...r.notes, `\`${r.file.split('/').pop()}:${r.line}\``].filter(Boolean).join(' ');
      body += `| ${r.verb} | \`${esc(r.full)}\` | \`${r.ctrl}.${r.method}\` → \`${esc(r.svc) || '—'}\` | ${perms} | ${note} |\n`;
    }
  }
  emit('02_API_Catalog.md', 'API каталог (core-kernel)', 'Architecture', ['codebase', 'api', 'generated'], body);
}

// ───────────────────────────── 2. DB ─────────────────────────────
const MIG_DIR = path.join(ROOT, 'supabase/migrations');
const migs = walk(MIG_DIR, (p) => p.endsWith('.sql'));

/** SQL → statement-ууд ($$ бие, тайлбар, ишлэлийг хүндэтгэнэ). */
function splitSql(sql) {
  const out = [];
  let cur = '';
  let i = 0;
  let dollar = null;
  while (i < sql.length) {
    if (dollar) {
      const k = sql.indexOf(dollar, i);
      if (k === -1) { cur += sql.slice(i); break; }
      cur += sql.slice(i, k + dollar.length);
      i = k + dollar.length;
      dollar = null;
      continue;
    }
    const c = sql[i];
    if (c === '-' && sql[i + 1] === '-') { const k = sql.indexOf('\n', i); i = k === -1 ? sql.length : k; continue; }
    if (c === '/' && sql[i + 1] === '*') { const k = sql.indexOf('*/', i + 2); i = k === -1 ? sql.length : k + 2; continue; }
    if (c === "'") { const k = sql.indexOf("'", i + 1); const e = k === -1 ? sql.length : k + 1; cur += sql.slice(i, e); i = e; continue; }
    if (c === '$') {
      const m = sql.slice(i, i + 40).match(/^\$[A-Za-z_]*\$/);
      if (m) { dollar = m[0]; cur += m[0]; i += m[0].length; continue; }
    }
    if (c === ';') { if (cur.trim()) out.push(cur.trim()); cur = ''; i++; continue; }
    cur += c;
    i++;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
function splitTop(s) {
  const out = [];
  let depth = 0;
  let cur = '';
  let q = false;
  for (const c of s) {
    if (c === "'") q = !q;
    if (!q && c === '(') depth++;
    if (!q && c === ')') depth--;
    if (!q && c === ',' && depth === 0) { out.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
const ident = (s) => s.trim().replace(/"/g, '').replace(/^public\./, '');
function parseCol(def) {
  const m = def.match(/^("?\w+"?)\s+([\s\S]+)$/);
  if (!m) return null;
  const rest = m[2];
  const type = rest.split(/\s+(?=NOT\b|NULL\b|DEFAULT\b|PRIMARY\b|REFERENCES\b|UNIQUE\b|CHECK\b|GENERATED\b|CONSTRAINT\b|COLLATE\b)/i)[0].trim();
  const flags = [];
  if (/PRIMARY KEY/i.test(rest)) flags.push('PK');
  if (/NOT NULL/i.test(rest)) flags.push('NN');
  if (/\bUNIQUE\b/i.test(rest)) flags.push('UQ');
  const ref = rest.match(/REFERENCES\s+([\w."]+)/i);
  const ondel = rest.match(/ON DELETE\s+(CASCADE|SET NULL|RESTRICT|NO ACTION)/i);
  return { name: ident(m[1]), type, flags, ref: ref ? `${ident(ref[1])}${ondel ? ` (${ondel[1].toLowerCase()})` : ''}` : '' };
}

const tables = new Map();
const enums = new Map();
const funcs = new Map();
const triggers = [];
const T = (n) => {
  if (!tables.has(n)) tables.set(n, { cols: new Map(), policies: new Map(), rls: false, force: false, created: '', changes: [], constraints: [] });
  return tables.get(n);
};
for (const f of migs) {
  const mig = path.basename(f);
  for (const st of splitSql(read(f))) {
    const s = st.replace(/\s+/g, ' ');
    let m;
    if ((m = s.match(/^CREATE TABLE (?:IF NOT EXISTS )?([\w."]+) \((.*)\)(?: PARTITION .*| INHERITS .*)?$/i))) {
      const t = T(ident(m[1]));
      t.created = t.created || mig;
      for (const part of splitTop(m[2])) {
        if (/^(CONSTRAINT|PRIMARY KEY|UNIQUE|FOREIGN KEY|CHECK|EXCLUDE)\b/i.test(part)) {
          t.constraints.push(part.replace(/^CONSTRAINT \S+ /i, ''));
          continue;
        }
        const c = parseCol(part);
        if (c) t.cols.set(c.name, { ...c, mig });
      }
    } else if ((m = s.match(/^ALTER TABLE (?:ONLY )?(?:IF EXISTS )?([\w."]+) (.+)$/i))) {
      const name = ident(m[1]);
      const t = T(name);
      for (const act of splitTop(m[2])) {
        let a;
        if (/^ADD (CONSTRAINT|PRIMARY|UNIQUE|FOREIGN|CHECK|EXCLUDE)\b/i.test(act)) {
          t.constraints.push(act.replace(/^ADD (CONSTRAINT \S+ )?/i, ''));
        } else if ((a = act.match(/^ADD (?:COLUMN )?(?:IF NOT EXISTS )?(.+)$/i))) {
          const c = parseCol(a[1]);
          if (c) { t.cols.set(c.name, { ...c, mig }); t.changes.push(`+${c.name} (\`${mig}\`)`); }
        } else if ((a = act.match(/^DROP COLUMN (?:IF EXISTS )?"?(\w+)"?/i))) {
          t.cols.delete(a[1]);
          t.changes.push(`−${a[1]} (\`${mig}\`)`);
        } else if ((a = act.match(/^RENAME COLUMN "?(\w+)"? TO "?(\w+)"?/i))) {
          const c = t.cols.get(a[1]);
          if (c) { t.cols.delete(a[1]); t.cols.set(a[2], { ...c, name: a[2] }); }
        } else if ((a = act.match(/^RENAME TO "?(\w+)"?/i))) {
          tables.set(a[1], t);
          tables.delete(name);
          // ADR-007 (20261106005): FK-ийн заалт, policy / trigger нэр дэх хуучин хүснэгтийн нэрийг шинэчлэх
          for (const other of tables.values()) for (const c of other.cols.values()) {
            if (c.ref === name || c.ref.startsWith(`${name} `)) c.ref = a[1] + c.ref.slice(name.length);
          }
          for (const [k, v] of [...t.policies]) if (k.includes(name)) { t.policies.delete(k); t.policies.set(k.replace(name, a[1]), v.replace(name, a[1])); }
          for (const tr of triggers) if (tr.table === name) { tr.table = a[1]; tr.name = tr.name.replace(name, a[1]); }
        } else if (/^ENABLE ROW LEVEL SECURITY/i.test(act)) t.rls = true;
        else if (/^FORCE ROW LEVEL SECURITY/i.test(act)) t.force = true;
        else if (/^DISABLE ROW LEVEL SECURITY/i.test(act)) t.rls = false;
        else if ((a = act.match(/^ALTER COLUMN "?(\w+)"? (?:SET DATA )?TYPE (.+?)(?: USING .*)?$/i))) {
          const c = t.cols.get(a[1]);
          if (c) c.type = a[2].trim();
        } else if ((a = act.match(/^ALTER COLUMN "?(\w+)"? SET NOT NULL/i))) {
          const c = t.cols.get(a[1]);
          if (c && !c.flags.includes('NN')) c.flags.push('NN');
        } else if ((a = act.match(/^ALTER COLUMN "?(\w+)"? DROP NOT NULL/i))) {
          const c = t.cols.get(a[1]);
          if (c) c.flags = c.flags.filter((x) => x !== 'NN');
        }
      }
      if (!t.created && !t.cols.size && !t.rls && !t.policies.size) tables.delete(name);
    } else if ((m = s.match(/^SELECT camp_apply_tenant_rls\(\s*'([\w.]+)'/i))) {
      // 20261009001_camp_rbac.sql: ENABLE + FORCE + tenant_isolation_<t> policy + updated_at trigger
      const t = T(ident(m[1]));
      t.rls = true;
      t.force = true;
      t.policies.set(`tenant_isolation_${ident(m[1])}`, 'permissive ALL → app_user (camp_apply_tenant_rls)');
      triggers.push({ name: `trg_${ident(m[1])}_updated_at`, table: ident(m[1]), mig });
    } else if ((m = s.match(/^DO (\$\w*\$)([\s\S]*)\1/)) && /ROW LEVEL SECURITY/i.test(m[2])) {
      // DO $$ … FOREACH t IN ARRAY ARRAY['a','b'] LOOP EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t) …
      const list = m[2].match(/FOREACH \w+ IN ARRAY ARRAY\[([^\]]+)\]/i);
      if (list) {
        for (const q of list[1].matchAll(/'([\w.]+)'/g)) {
          const t = T(ident(q[1]));
          if (/ENABLE ROW LEVEL SECURITY/i.test(m[2])) t.rls = true;
          if (/FORCE ROW LEVEL SECURITY/i.test(m[2])) t.force = true;
          if (/CREATE POLICY/i.test(m[2]) && /'tenant_isolation_'\s*\|\|/.test(m[2])) t.policies.set(`tenant_isolation_${ident(q[1])}`, 'permissive ALL → app_user (DO-блок)');
        }
      }
    } else if ((m = s.match(/^DROP TABLE (?:IF EXISTS )?(.+?)(?: CASCADE| RESTRICT)?$/i))) {
      for (const n of m[1].split(',')) tables.delete(ident(n));
    } else if ((m = s.match(/^CREATE POLICY "?([^"]+?)"? ON ([\w."]+)(?: AS (PERMISSIVE|RESTRICTIVE))?(?: FOR (\w+))?(?: TO ([\w, ]+?))?(?: USING.*| WITH.*)?$/i))) {
      T(ident(m[2])).policies.set(m[1], `${(m[3] || 'permissive').toLowerCase()} ${(m[4] || 'ALL').toUpperCase()}${m[5] ? ` → ${m[5].trim()}` : ''}`);
    } else if ((m = s.match(/^DROP POLICY (?:IF EXISTS )?"?([^"]+?)"? ON ([\w."]+)/i))) {
      tables.get(ident(m[2]))?.policies.delete(m[1]);
    } else if ((m = s.match(/^CREATE TYPE ([\w."]+) AS ENUM \(([^)]*)\)/i))) {
      enums.set(ident(m[1]), { values: m[2].replace(/'/g, '').split(',').map((x) => x.trim()), mig });
    } else if ((m = s.match(/^ALTER TYPE ([\w."]+) ADD VALUE (?:IF NOT EXISTS )?'([^']+)'/i))) {
      enums.get(ident(m[1]))?.values.push(m[2]);
    } else if ((m = s.match(/^CREATE (?:OR REPLACE )?FUNCTION ([\w."]+)\s*\(([^)]*)\)/i))) {
      funcs.set(ident(m[1]), { args: m[2].trim(), mig });
    } else if ((m = s.match(/^CREATE (?:OR REPLACE )?(?:CONSTRAINT )?TRIGGER "?(\w+)"? .*? ON ([\w."]+)/i))) {
      triggers.push({ name: m[1], table: ident(m[2]), mig });
    }
  }
}
{
  const group = (n) =>
    n.startsWith('camp_') || n === 'camps' ? 'Кемп (`camp_*`)' : n.startsWith('core_') ? 'Үндсэн (`core_*`)' : 'Бусад (tenant, MR, workflow, event bus, модулиуд)';
  const groups = new Map();
  for (const n of [...tables.keys()].sort()) {
    const g = group(n);
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(n);
  }
  let body =
    `Эх сурвалж: \`supabase/migrations/*.sql\` (${migs.length} файл, дарааллаар задалсан — MIG-001: schema = migration, Prisma нь зөвхөн client). ` +
    `Нийт **${tables.size}** хүснэгт, ${enums.size} enum, ${funcs.size} функц, ${triggers.length} trigger.\n\n` +
    'Тэмдэглэгээ: PK · NN = NOT NULL · UQ = unique · → = FK. RLS: 🔒 enabled, 🔒🔒 enabled + FORCE, 🌐 tenant_id-гүй глобал хүснэгт. ' +
    '`camp_apply_tenant_rls()` болон `DO $$ FOREACH … ARRAY[…]` RLS загварыг танина; бусад динамик SQL-ийг алгасна — эргэлзээтэй бол migration-ыг нээ. RLS загвар: [[ADR-001_Tenant_Isolation]], [[03_Module_Template]].\n\n## Агуулга\n';
  for (const [g, ns] of groups) body += `\n**${g}:** ${ns.map((n) => `[[#${n}]]`).join(' · ')}\n`;
  for (const [g, ns] of groups) {
    body += `\n## ${g}\n`;
    for (const n of ns) {
      const t = tables.get(n);
      const rls = t.rls ? (t.force ? '🔒🔒' : '🔒') : t.cols.has('tenant_id') ? '⚠️ RLS-гүй (tenant_id-тэй!)' : '🌐 глобал (tenant_id-гүй, RLS-гүй)';
      body += `\n### ${n}\n\n${rls} · үүсгэсэн \`${t.created || '?'}\`${t.changes.length ? ` · өөрчлөлт: ${t.changes.join(', ')}` : ''}\n\n`;
      body += '| Багана | Төрөл | Шинж | FK |\n|---|---|---|---|\n';
      for (const c of t.cols.values()) body += `| ${c.name} | ${esc(c.type)} | ${c.flags.join(' ')} | ${c.ref ? `→ ${esc(c.ref)}` : ''} |\n`;
      if (t.constraints.length) body += `\nConstraint: ${t.constraints.map((x) => `\`${esc(x).slice(0, 140)}\``).join(' · ')}\n`;
      if (t.policies.size) body += `\nPolicy: ${[...t.policies].map(([k, v]) => `\`${k}\` (${v})`).join(' · ')}\n`;
      const tr = triggers.filter((x) => x.table === n);
      if (tr.length) body += `\nTrigger: ${tr.map((x) => `\`${x.name}\``).join(' · ')}\n`;
    }
  }
  body += '\n## Enum\n\n| Enum | Утгууд | Migration |\n|---|---|---|\n';
  for (const [n, e] of [...enums].sort()) body += `| ${n} | ${esc(e.values.join(', '))} | \`${e.mig}\` |\n`;
  body += '\n## Функц (SQL)\n\n| Функц | Аргумент | Сүүлд тодорхойлсон |\n|---|---|---|\n';
  for (const [n, fn] of [...funcs].sort()) body += `| \`${n}\` | ${esc(fn.args)} | \`${fn.mig}\` |\n`;
  emit('03_DB_Catalog.md', 'DB каталог (migration-аас)', 'Database', ['codebase', 'database', 'rls', 'generated'], body);
}

// ───────────────────────────── 3. Permissions ─────────────────────────────
{
  const names = new Map();
  for (const f of migs) {
    for (const st of splitSql(read(f))) {
      if (!/^INSERT INTO (camp|core)_permissions\b/i.test(st)) continue;
      for (const m of st.matchAll(/\(\s*'((?:camp|hr|core|feed)\.[a-z_]+\.[a-z_]+)',\s*'([^']+)'/g)) names.set(m[1], m[2]);
    }
  }
  const v2 = new Set();
  if (exists(permFile)) {
    const vm = read(permFile).match(/V2_CODES[\s\S]*?\[([\s\S]*?)\]/);
    if (vm) for (const m of vm[1].matchAll(/\bPERMISSIONS\.(\w+)/g)) v2.add(PERM_CONST.get(m[1]));
  }
  let roles = [];
  let roleMig = '';
  for (const f of migs) {
    const fm = read(f).match(/FUNCTION (?:camp|core)_seed_default_roles[\s\S]*?\$\$;/);
    if (!fm) continue;
    roleMig = path.basename(f);
    roles = [...fm[0].matchAll(/\('(\w+)'(?:::"CampRoleCode")?,\s*'([^']+)',\s*'([^']*)',\s*ARRAY\[([^\]]+)\]\)/g)].map((m) => ({
      code: m[1],
      name: m[2],
      descr: m[3],
      perms: [...m[4].matchAll(/'([^']+)'/g)].map((x) => x[1]),
    }));
  }
  const used = new Map();
  for (const f of tsFiles) {
    if (f === permFile) continue;
    const src = read(f);
    for (const p of permsIn(src, permAliases(src))) {
      if (!used.has(p)) used.set(p, new Set());
      used.get(p).add(rel(f).replace('apps/core-kernel/src/modules/camp/', '').replace(/^.*\//, ''));
    }
  }
  const codes = [...PERM_CONST.values()];
  let body =
    'Эх сурвалж: `apps/core-kernel/src/modules/core/permissions/permission-registry.ts` (код) · migration-ийн `core_permissions` (нэр) · ' +
    `\`core_seed_default_roles\` (\`${roleMig}\`, анхдагч роль). Код ба DB ЯГ ижил байх ёстой (\`camp-master.integration.spec.ts\` тулгана).\n\n` +
    'Шинэ эрх: (1) migration-д `INSERT INTO core_permissions`, (2) `permission-registry.ts`, (3) хэрэгтэй бол seed роль → `pnpm docs:gen`. ' +
    'Хэрэглэгчийн эцсийн эрх = `core_user_permissions` (ганц эх сурвалж). Роль, эрх системийн түвшинд — [[ADR-007_System_Roles_Permissions]]. ' +
    'Үндсэн (core) роль — [[03_DB_Catalog]] → Enum. Загвар: [[ADR-003_Users_Login_Permissions]].\n\n';
  body += `## Эрх (${codes.length})\n\n| Код | Нэр | Хувилбар | ${roles.map((r) => r.code).join(' | ')} | Ашигласан файл |\n|---|---|---|${roles.map(() => '---|').join('')}---|\n`;
  for (const c of codes) {
    const files = [...(used.get(c) ?? [])].map((x) => `\`${x}\``).join(' ') || '—';
    body += `| \`${c}\` | ${esc(names.get(c) ?? '')} | ${v2.has(c) ? 'V2' : 'V1'} | ${roles.map((r) => (r.perms.includes(c) ? '✅' : '')).join(' | ')} | ${files} |\n`;
  }
  body += '\n## Анхдагч роль\n\n| Код | Нэр | Тайлбар | Эрхийн тоо |\n|---|---|---|---|\n';
  for (const r of roles) body += `| ${r.code} | ${r.name} | ${esc(r.descr)} | ${r.perms.length} |\n`;
  if (exists(permFile)) {
    const am = read(permFile).match(/PERMISSION_ALIASES[^=]*=\s*\{([\s\S]*?)\};/);
    if (am) {
      body += '\n## Хуучин код (alias, ADR-007 — v0.2.4-т устгана)\n\n| Хуучин | Шинэ |\n|---|---|\n';
      for (const m of am[1].matchAll(/'([^']+)'\s*:\s*PERMISSIONS\.(\w+)/g)) body += `| \`${m[1]}\` | \`${PERM_CONST.get(m[2]) ?? m[2]}\` |\n`;
    }
  }
  emit('05_Permissions_Catalog.md', 'Эрхийн каталог (core RBAC)', 'Architecture', ['codebase', 'auth', 'rbac', 'generated'], body);
}

// ───────────────────────────── 4. Config / env / scripts ─────────────────────────────
{
  const SECRET = /SECRET|PASSWORD|TOKEN|_KEY$|PASS$/i;
  const envFiles = ['.env.example', 'deploy/pilot/.env.pilot.example', 'apps/web-shell/.env.example', 'apps/core-kernel/.env.example']
    .map((p) => path.join(ROOT, p))
    .filter(exists);
  let body = 'Утга нь `*.env.example`-ийн жишээ (нууц шинжтэй түлхүүрийн утгыг `***` болгосон). Жинхэнэ `.env`-ийг хэзээ ч баримтад хуулахгүй. ' +
    'Орчин асаах: [[02_Local_Supabase_Docker_Windows]] · пилот: [[04_Pilot_Camp_Windows]].\n';
  for (const f of envFiles) {
    body += `\n## \`${rel(f)}\`\n\n| Хувьсагч | Жишээ | Тайлбар |\n|---|---|---|\n`;
    let note = [];
    for (const ln of read(f).split('\n')) {
      const t = ln.trim();
      if (!t) { note = []; continue; }
      if (t.startsWith('#')) {
        const c = t.replace(/^#+\s?/, '');
        if (!/^[=\-─]+$/.test(c)) note.push(c);
        continue;
      }
      const m = t.match(/^(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (!m) continue;
      const val = SECRET.test(m[1]) ? '***' : m[2].replace(/^"|"$/g, '');
      body += `| \`${m[1]}\` | ${val ? `\`${esc(val).slice(0, 70)}\`` : ''} | ${esc(note.join(' ')).slice(0, 300)} |\n`;
      note = [];
    }
  }
  const depth = (p) => rel(p).split('/').length;
  const pkgs = [
    path.join(ROOT, 'package.json'),
    ...walk(path.join(ROOT, 'apps'), (p) => p.endsWith(`${path.sep}package.json`) && depth(p) === 3),
    ...walk(path.join(ROOT, 'packages'), (p) => p.endsWith(`${path.sep}package.json`) && depth(p) === 3),
  ].filter(exists);
  body += '\n## pnpm script-үүд\n';
  for (const p of pkgs) {
    const j = JSON.parse(read(p));
    body += `\n### \`${rel(p)}\`${j.name ? ` — ${j.name}` : ''}\n\n| Script | Команд |\n|---|---|\n`;
    for (const [k, v] of Object.entries(j.scripts ?? {})) body += `| \`${k}\` | \`${esc(v).slice(0, 150)}\` |\n`;
  }
  emit('06_Config_Env.md', 'Тохиргоо, env, script', 'Guide', ['codebase', 'config', 'generated'], body);
}

// ───────────────────────────── 5. Tests ─────────────────────────────
{
  const titles = (f) => [...read(f).matchAll(/^describe(?:\.\w+)?\(\s*['"`]([^'"`]+)['"`]/gm)].map((m) => m[1]);
  const testCount = (f) => (read(f).match(/^\s*(?:it|test)(?:\.(?:each\([^)]*\)|only|skip|concurrent))?\(/gm) || []).length;
  const sets = [
    ['Integration (бодит PG + RLS)', 'pnpm test:integration', walk(path.join(ROOT, 'apps/core-kernel/test'), (p) => p.endsWith('.spec.ts'))],
    ['Unit — core-kernel', 'pnpm --filter core-kernel test', walk(SRC, (p) => /\.(spec|test)\.ts$/.test(p))],
    ['Unit — web-shell', 'pnpm --filter web-shell test', walk(path.join(ROOT, 'apps/web-shell/src'), (p) => /\.(spec|test)\.tsx?$/.test(p))],
    ['E2E (Playwright)', 'pnpm test:e2e', walk(path.join(ROOT, 'apps/e2e/tests'), (p) => /\.spec\.ts$/.test(p))],
  ];
  let body = 'Орчин, fixture: [[02_Local_Supabase_Docker_Windows]] · тест бичих дүрэм: [[08_Patterns]] · сургамж: [[lessons_learned]] (TEST-*). ' +
    'Тестийн тоо = `it(`/`test(` мөрийн тоо (ойролцоо).\n';
  for (const [name, cmd, files] of sets) {
    const total = files.reduce((a, f) => a + testCount(f), 0);
    body += `\n## ${name} — ${files.length} файл, ~${total} тест\n\nКоманд: \`${cmd}\`\n\n| Файл | Тест | describe |\n|---|---|---|\n`;
    for (const f of files) body += `| \`${rel(f).replace(/^apps\//, '')}\` | ${testCount(f)} | ${esc(titles(f).join(' · ')).slice(0, 200)} |\n`;
  }
  emit('07_Test_Map.md', 'Тестийн зураглал', 'Guide', ['codebase', 'testing', 'generated'], body);
}

// ───────────────────────────── 6. Frontend routes ─────────────────────────────
{
  const WEB = path.join(ROOT, 'apps/web-shell/src');
  const files = walk(WEB, (p) => p.endsWith('.tsx') && !/\.(spec|test)\.tsx$/.test(p));
  let body =
    'Эх сурвалж: `apps/web-shell/src/**/*.tsx` дахь `<Route path=… element={<X/>}>`. Модуль асаах: `VITE_MODULES` ([[06_Config_Env]]). ' +
    'Бүтэц, API client, i18n: [[04_Frontend_Map]]. Дэд модулийн (жишээ нь `/camp/*`) route-ууд харьцангуй замтай.\n\n| Зам | Компонент | Нөхцөл | Файл |\n|---|---|---|---|\n';
  // `<Route path="/camp/*" element={<CampRoutes />}>` → CampRoutes.tsx доторх харьцангуй замд "/camp/" угтвар
  const mounts = new Map();
  for (const f of files) {
    for (const m of read(f).matchAll(/<Route\b[^>]*?path=["'](\/[^"']*?)\/\*["'][^>]*?element=\{\s*<(\w+)/gs)) mounts.set(m[2], m[1]);
  }
  for (const f of files) {
    const src = read(f);
    const base = mounts.get(path.basename(f, '.tsx'));
    for (const m of src.matchAll(/<Route\b([^>]*?)\/?>/gs)) {
      const attrs = m[1];
      const p = attrs.match(/path=["']([^"']+)["']/) || attrs.match(/path=\{\s*['"`]([^'"`]+)['"`]\s*\}/);
      const index = /\bindex\b/.test(attrs);
      if (!p && !index) continue;
      // Suspense / PageSuspense ороогчийг алгасаж жинхэнэ хуудсыг (v0.2.2 Блок 6 — lazy)
      const el = src.slice(m.index, m.index + 400).match(/element=\{\s*(?:<(?:Page)?Suspense\b[^>]*>\s*)*<(\w+)/);
      const before = src.slice(Math.max(0, m.index - 80), m.index);
      const cond = before.match(/isEnabled\('(\w+)'\)\s*&&\s*$/);
      const route = p ? (base && !p[1].startsWith('/') ? `${base}/${p[1]}` : p[1]) : base ? `${base} (index)` : '(index)';
      body += `| \`${route}\` | ${el ? `\`${el[1]}\`` : ''} | ${cond ? `модуль \`${cond[1]}\`` : ''} | \`${rel(f).replace('apps/web-shell/src/', '')}:${lineOf(src, m.index)}\` |\n`;
    }
  }
  const i18n = walk(path.join(ROOT, 'packages/i18n'), (p) => p.endsWith('.json') && !/package\.json$|tsconfig/.test(p));
  if (i18n.length) {
    const count = (o) => (typeof o === 'object' && o ? Object.values(o).reduce((a, v) => a + count(v), 0) : 1);
    body += '\n## Орчуулгын файлууд (`packages/i18n`)\n\n| Файл | Түлхүүр |\n|---|---|\n';
    for (const f of i18n) {
      let n;
      try { n = count(JSON.parse(read(f))); } catch { n = '⚠️ JSON алдаа'; }
      body += `| \`${rel(f).replace('packages/i18n/', '')}\` | ${n} |\n`;
    }
  }
  emit('09_Frontend_Routes.md', 'Frontend route-ууд (web-shell)', 'Architecture', ['codebase', 'frontend', 'generated'], body);
}

// ───────────────────────────── 7. Lessons индекс (docs/lessons/LL-*.md → docs/lessons_learned.md) ─────────────────────────────
{
  const LDIR = path.join(ROOT, 'docs', 'lessons');
  const files = walk(LDIR, (p) => /LL-\d\d_[^/\\]*\.md$/.test(p) && !/LL-99_/.test(p));
  const GROUPS = [
    ['DB, Prisma, RLS, migration', ['PRISMA', 'RLS', 'MIGRATE', 'MIG', 'SQL', 'ENUM', 'SEED', 'DATA', 'CONC', 'CURSOR', 'ASYNC']],
    ['Backend, API, event, гүйцэтгэл', ['DI', 'MODULE', 'DEP', 'RESOLVE', 'PATCH', 'CONFIG', 'VALID', 'API', 'HTTP', 'EVT', 'CACHE', 'PERF', 'RL', 'CLUSTER', 'LOG', 'BUILD', 'ARCH']],
    ['Нэвтрэлт, аюулгүй байдал', ['AUTH', 'SEC']],
    ['Тест, E2E, CI', ['TEST', 'VITEST', 'CI', 'S5', 'META']],
    ['Frontend', ['FE']],
    ['Орчин, ops, PowerShell, пилот', ['ENV', 'OPS', 'PS']],
    ['Процесс, баримт', ['PROC', 'DOC']],
  ];
  const KEYS = ['Дүрэм', 'Зөв шийдэл', 'Шийдэл', 'Дүгнэлт', 'Урьдчилан сэргийлэх', 'Цаашид'];
  const rows = new Map();
  for (const f of files) {
    const short = path.basename(f, '.md').split('_')[0];
    const src = read(f);
    const secs = [...src.matchAll(/^## (\d+)\./gm)];
    const hs = [...src.matchAll(/^#{2,3} \[([A-Z0-9-]+)\]\s*(.*)$/gm)];
    hs.forEach((h, i) => {
      const body = src.slice(h.index + h[0].length, i + 1 < hs.length ? hs[i + 1].index : src.length);
      const sec = secs.filter((x) => x.index < h.index).pop()?.[1] ?? '?';
      let rule = '';
      for (const k of KEYS) {
        const m = body.match(new RegExp(`^(?:[-*] )?\\*\\*${k}[^*\\n]*?:?\\*\\*:?\\s*(.+)$`, 'm'));
        if (m && m[1].trim()) { rule = m[1].trim(); break; }
      }
      if (!rule) {
        const m = body.match(/^\*\*→\s*(RULE-\d+)[^*]*\*\*:?\s*(.*)$/m);
        if (m) rule = `→ ${m[1]} ${m[2]}`;
      }
      let text = (rule || h[2]).replace(/\s+/g, ' ').replace(/\|/g, '/').trim();
      if (text.length > 125) text = text.slice(0, 122).replace(/\s+\S*$/, '') + '…';
      const repeat = /давтагдсан/i.test(h[2]);
      const where = `${short} §${sec}`;
      if (rows.has(h[1])) {
        const r = rows.get(h[1]);
        r.where.add(where);
        if (repeat) r.rep = true;
        else problems.push(`lessons: ID давхардсан (давтагдсан гэж тэмдэглээгүй) — ${h[1]} (${short})`);
        return;
      }
      rows.set(h[1], { text, where: new Set([where]), rep: repeat });
    });
  }
  const grp = (id) => {
    const pre = id.split('-')[0];
    const g = GROUPS.findIndex(([, ps]) => ps.includes(pre));
    return g === -1 ? GROUPS.length : g;
  };
  const num = (id) => Number((id.split('-').pop() || '').replace(/\D/g, '')) || 0;
  const banner =
    '> 🤖 **AUTO-GENERATED** (`pnpm docs:gen`) — `docs/lessons/LL-*.md`-ийн `[ID]` гарчиг ба **Дүрэм / Шийдэл** мөрөөс. Энд бүү засаарай.\n' +
    '> **Унших:** зөвхөн даалгаварт хамаарах бүлгээ. Шалтгаан / жишээ хэрэгтэй бол "Хаана" файлыг нээж `[ID]`-аар хай. 🔁 = давтагдсан алдаа.\n' +
    '> **Шинэ алдаа:** тохирох `lessons/LL-*.md`-д `### [TAG-NNN] Гарчиг` + **Тохиолдсон / Шалтгаан / Дүрэм** → [[LL-99_Changelog]]-д мөр → `pnpm docs:gen`. ' +
    'Давтагдвал шинэ ID биш — `### [ID] (давтагдсан, огноо) …`.\n' +
    `> Файл: ${files.map((f) => `[[${path.basename(f, '.md')}]]`).join(' · ')} · Хуучин нэгтгэсэн файл (архив): [[lessons_learned_MVP]]\n`;
  let body = `Нийт **${rows.size}** сургамж.\n`;
  [...GROUPS.map((g) => g[0]), 'Бусад'].forEach((name, g) => {
    const ids = [...rows.keys()].filter((id) => grp(id) === g).sort((a, b) => a.split('-')[0].localeCompare(b.split('-')[0]) || num(a) - num(b));
    if (!ids.length) return;
    body += `\n## ${name}\n\n| ID | Дүрэм | Хаана |\n|---|---|---|\n`;
    for (const id of ids) {
      const r = rows.get(id);
      body += `| ${id}${r.rep ? ' 🔁' : ''} | ${r.text} | ${[...r.where].join(', ')} |\n`;
    }
  });
  emit('../lessons_learned.md', 'Lessons Learned — индекс (ID → дүрэм)', 'Log', ['lessons', 'index', 'generated'], body, banner);
}

// ───────────────────────────── 8. Vault шалгалт (frontmatter, линк, orphan) ─────────────────────────────
{
  const DOCS = path.join(ROOT, 'docs');
  const hasLearning = exists(path.join(DOCS, '_learning'));
  const mdFiles = walk(DOCS, (p) => p.endsWith('.md'));
  const key = (p) => path.relative(DOCS, p).split(path.sep).join('/').replace(/\.md$/, '');
  const all = new Set(mdFiles.map(key));
  const byName = new Map();
  for (const k of all) {
    const b = k.split('/').pop();
    byName.set(b, [...(byName.get(b) ?? []), k]);
  }
  const TYPES = ['PRD', 'Architecture', 'Database', 'Roadmap', 'Guide', 'Log'];
  const STATUS = ['Draft', 'Active', 'Deprecated', 'Archived'];
  const inbound = new Map();
  for (const f of mdFiles) {
    const k = key(f);
    const src = read(f);
    const fm = src.startsWith('---\n') ? src.slice(4, src.indexOf('\n---', 4)) : '';
    for (const field of ['title', 'type', 'status', 'last_updated', 'tags']) {
      if (!new RegExp(`^${field}:`, 'm').test(fm)) problems.push(`frontmatter: ${k} — "${field}" алга`);
    }
    const ty = fm.match(/^type:\s*"?([^"\n]+)"?/m)?.[1];
    const st = fm.match(/^status:\s*"?([^"\n]+)"?/m)?.[1];
    if (ty && !TYPES.includes(ty)) problems.push(`frontmatter: ${k} — type "${ty}" буруу`);
    if (st && !STATUS.includes(st)) problems.push(`frontmatter: ${k} — status "${st}" буруу`);
    const text = src.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
    for (const m of text.matchAll(/\[\[([^\]|#\\]+)/g)) {
      const t = m[1].trim();
      let target = all.has(t) ? t : null;
      if (!target) {
        const c = byName.get(t.split('/').pop()) ?? [];
        if (c.length === 1 && (!t.includes('/') || c[0].endsWith(t))) target = c[0];
        else if (c.length > 1) problems.push(`линк: ${k} → [[${t}]] — нэр давхардсан (${c.join(', ')}), замтай бич`);
      }
      if (target) inbound.set(target, (inbound.get(target) ?? 0) + 1);
      else if (!(byName.get(t.split('/').pop()) ?? []).length && !(t.startsWith('_learning/') && !hasLearning)) problems.push(`линк: ${k} → [[${t}]] — файл алга`);
    }
  }
  for (const k of all) {
    if (['INDEX', 'CONTEXT'].includes(k) || k.startsWith('_learning/')) continue;
    if (!inbound.get(k)) problems.push(`orphan: ${k} — ямар ч баримтаас холбогдоогүй (INDEX-д нэм)`);
  }
}

// ───────────────────────────── дүгнэлт ─────────────────────────────
const changed = results.filter((r) => r.changed);
for (const r of results) console.log(`${r.changed ? (CHECK ? '✗ хоцорсон' : '✎ шинэчилсэн') : '✓ ижил'}  ${r.file}`);
for (const p of problems) console.error(`⚠ ${p}`);
if (CHECK && changed.length) console.error(`\n${changed.length} автомат баримт хоцорсон → \`pnpm docs:gen\` ажиллуулаад commit хий.`);
if (problems.length) console.error(`\n${problems.length} vault алдаа (frontmatter / линк / orphan / lessons ID) — засна уу.`);
if ((CHECK && changed.length) || problems.length) process.exit(1);
