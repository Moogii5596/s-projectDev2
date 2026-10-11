/**
 * v0.2.2 — `pnpm camp:login-report --env=<.env файл> [--slug=sinohydro]`
 * Идэвхтэй ажилтны утас/имэйлийн байдал — ЗӨВХӨН ТОО. Зөвхөн уншина (пилот / staging аль алинд аюулгүй).
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { buildLoginReport } from './camp-login-report';
import { assertLocalUrl, parseDotenv } from './test-user';

const argv = process.argv.slice(2);
const arg = (name: string) => argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const userPath = (p: string) => resolve(process.env.INIT_CWD ?? process.cwd(), p);

const LABELS: Record<string, string> = {
  activeEmployees: 'Идэвхтэй ажилтан',
  phoneLogin: '  → утсаар нэвтэрнэ (Монгол 8 орон, давтагдашгүй)',
  username: '  → username авна',
  noPhone: '     · утас алга',
  foreignOrInvalid: '     · гадаад / буруу дугаар',
  duplicatePhoneEmployees: '     · давхардсан утастай ажилтан',
  duplicatePhoneGroups: '     · давхардсан утасны бүлэг',
  withEmail: 'Имэйлтэй',
};

async function main(): Promise<number> {
  const envPath = arg('env') ? userPath(arg('env') as string) : resolve(__dirname, '../../../../.env');
  if (!existsSync(envPath)) throw new Error(`.env алга: ${envPath}`);
  const env = parseDotenv(readFileSync(envPath, 'utf8'));
  const url = assertLocalUrl('SYSTEM_DATABASE_URL', env.SYSTEM_DATABASE_URL?.trim() ? env.SYSTEM_DATABASE_URL : env.DATABASE_URL);
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    const r = await buildLoginReport(prisma, arg('slug'));
    for (const [slug, row] of Object.entries(r)) {
      console.log(`\n${slug}`);
      for (const k of Object.keys(LABELS)) console.log(`${LABELS[k].padEnd(52)} ${(row as unknown as Record<string, number>)[k]}`);
    }
    return 0;
  } finally {
    await prisma.$disconnect();
  }
}

main().then((c) => process.exit(c)).catch((e: Error) => { console.error(`❌ ${e.message}`); process.exit(2); });
