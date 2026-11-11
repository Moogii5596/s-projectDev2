#!/usr/bin/env node
/**
 * S Project — агентын эрсдэлтэй командыг хаах хамгаалалт (Claude Code PreToolUse hook).
 * AGENTS.md §4, §5 ба давтагдсан сургамжуудыг (docs/lessons) баримтаар биш автоматаар мөрдүүлнэ.
 *
 * Hook: stdin = { tool_name, tool_input }. Хаах бол stderr-д шалтгаан + exit 2 (Claude-д буцна).
 * CLI:  node scripts/agent/guard.mjs --check-command "<команд>" | --check-path <файл>
 */
import { basename } from 'node:path';
import { pathToFileURL } from 'node:url';

/** @type {{ id: string, re: RegExp, why: string }[]} */
export const COMMAND_RULES = [
  {
    id: 'MIG-001',
    re: /\bprisma\s+db\s+push\b/i,
    why: '`prisma db push` хориотой — schema = supabase/migrations/*.sql (AGENTS.md §5, MIG-001).',
  },
  {
    id: 'MAIN-PUSH',
    re: /\bgit\s+push\b[^;&|\n]*?(?:\s|:|\+)main(?=\s|$|[;&|])/i,
    why: '`main` руу шууд push хориотой — branch push → PR → A0 merge (AGENTS.md §4).',
  },
  {
    id: 'NO-VERIFY',
    re: /\bgit\s+(?:commit|push|merge|rebase)\b[^;&|\n]*\s--no-verify\b/i,
    why: 'git hook-ийг `--no-verify`-ээр алгасахгүй — hook-ийн алдааг засна.',
  },
  {
    id: 'WORKFLOW-RUN',
    re: /\bgh\s+workflow\s+run\b/i,
    why: 'Workflow (production deploy) ажиллуулахыг зөвхөн PO хийнэ (AGENTS.md §4, G3).',
  },
  {
    id: 'REMOTE-DB-RESET',
    re: /\bsupabase\s+db\s+reset\b[^;&|\n]*--(?:linked|db-url)\b/i,
    why: 'Local-аас бусад DB-г reset хийх нь PO-ийн шууд зөвшөөрөлтэй л (AGENTS.md §4).',
  },
  {
    id: 'ENV-READ',
    // `.env`, `.env.staging`, `apps/x/.env` — `.env.example` болон `process.env`-ийг хасна
    re: /(?:^|[\s'"=/\\(])\.env(?!\.example\b)(?:\.[\w-]+)*(?=$|[\s'";|&)])/,
    why: '`.env*` файлыг унших/засах хориотой (`.env.example`-ээс бусад) — нууц зөвхөн Secrets-д (AGENTS.md §4).',
  },
];

/** @returns {{ id: string, why: string } | null} */
export function checkCommand(command) {
  if (typeof command !== 'string') return null;
  for (const rule of COMMAND_RULES) {
    if (rule.re.test(command)) return { id: rule.id, why: rule.why };
  }
  return null;
}

/** @returns {{ id: string, why: string } | null} */
export function checkPath(filePath) {
  if (typeof filePath !== 'string' || filePath === '') return null;
  const name = basename(filePath.replace(/\\/g, '/'));
  if (/^\.env(\..+)?$/.test(name) && name !== '.env.example') {
    return { id: 'ENV-READ', why: COMMAND_RULES.find((r) => r.id === 'ENV-READ').why };
  }
  return null;
}

/** Hook-ийн оролтоос шийдвэр гаргана. */
export function evaluate(input) {
  const tool = input?.tool_name;
  const ti = input?.tool_input ?? {};
  if (tool === 'Bash' || tool === 'PowerShell') return checkCommand(ti.command);
  if (['Read', 'Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(tool)) {
    return checkPath(ti.file_path ?? ti.notebook_path);
  }
  return null;
}

async function readStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString('utf8');
}

async function main(argv) {
  let verdict;
  const i = argv.indexOf('--check-command');
  const j = argv.indexOf('--check-path');
  if (i >= 0) verdict = checkCommand(argv[i + 1]);
  else if (j >= 0) verdict = checkPath(argv[j + 1]);
  else {
    let input;
    try {
      input = JSON.parse(await readStdin());
    } catch {
      return 0; // оролт уншигдахгүй бол ажлыг хаахгүй
    }
    verdict = evaluate(input);
  }
  if (!verdict) return 0;
  process.stderr.write(`✖ [${verdict.id}] ${verdict.why}\n`);
  return 2;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}
