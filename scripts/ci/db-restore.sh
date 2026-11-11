#!/usr/bin/env bash
# S Project — шифрлэсэн DB нөөцийг сэргээх (v0.2.5 H5, #19). db-backup.sh-ийн эсрэг.
#
# Хэрэглээ: scripts/ci/db-restore.sh <file.dump.age>
#   env TARGET_DB_URL   — сэргээх DB (session pooler 5432 эсвэл local 54322, postgres role)
#   env AGE_IDENTITY    — age хувийн түлхүүрийн ФАЙЛ (PO-д; repo/Secrets-д ✖)
#   env CONFIRM_TARGET  — TARGET_DB_URL-ийн host-ийг яг давтан бичнэ (буруу DB-д санамсаргүй сэргээхээс)
#
# Дүрэм (AGENTS.md §4): local, staging → агент; production → зөвхөн PO-ийн шууд зөвшөөрөлтэй.
# Арга: target-д schema аль хэдийн (supabase db push / local reset) → ӨГӨГДӨЛ л солино:
#   public, auth (users, identities, …), auth_guard хүснэгтүүдийг TRUNCATE → data-only restore
#   (`session_replication_role = replica` — FK/trigger-ийн дарааллаас үл хамааран). supabase_migrations-д хүрэхгүй.
#   Schema зөрвөл (нөөц шинэ migration-тай) → эхлээд target-д `supabase db push`.
set -euo pipefail

file="${1:?нөөцийн файл (.dump.age) шаардлагатай}"
: "${TARGET_DB_URL:?TARGET_DB_URL алга}"
: "${AGE_IDENTITY:?AGE_IDENTITY (age хувийн түлхүүрийн файл) алга}"
: "${CONFIRM_TARGET:?CONFIRM_TARGET алга — TARGET_DB_URL-ийн host-ийг бичнэ}"
for c in age pg_restore psql; do command -v "$c" >/dev/null || { echo "$c алга" >&2; exit 1; }; done

host="$(printf '%s' "$TARGET_DB_URL" | sed -E 's#^[a-z]+://[^@]*@([^:/?]+).*#\1#')"
if [ "$host" != "$CONFIRM_TARGET" ]; then
  echo "CONFIRM_TARGET ($CONFIRM_TARGET) ≠ target host ($host) — зогслоо" >&2; exit 1
fi

work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT
chmod 700 "$work"
age --decrypt --identity "$AGE_IDENTITY" --output "$work/db.dump" "$file"

# Нөөцийн migration ≤ target-ийнх эсэх (target-д байхгүй migration-тай нөөц → schema зөрнө)
pg_restore --data-only --schema=supabase_migrations --table=schema_migrations -f - "$work/db.dump" \
  | awk '/^COPY supabase_migrations.schema_migrations/{f=1;next} /^\\\./{f=0} f{print $1}' | sort -u > "$work/backup_versions"
psql "$TARGET_DB_URL" -At -v ON_ERROR_STOP=1 -c "select version from supabase_migrations.schema_migrations" | sort -u > "$work/target_versions"
missing="$(comm -23 "$work/backup_versions" "$work/target_versions" || true)"
if [ -n "$missing" ]; then
  echo "Target-д нөөцийн migration алга — эхлээд supabase db push:" >&2; echo "$missing" >&2; exit 1
fi

# Data-only SQL (public + auth + auth_guard). supabase_migrations-ийг алгасна.
pg_restore --data-only --no-owner --no-privileges --schema=public --schema=auth --schema=auth_guard -f "$work/data.sql" "$work/db.dump"
tables="$(grep -oE '^COPY [a-z_]+\.[a-z0-9_"]+' "$work/data.sql" | awk '{print $2}' | sort -u | paste -sd, -)"
[ -n "$tables" ] || { echo "нөөцөд өгөгдөл алга" >&2; exit 1; }

started=$(date +%s)
{
  echo "\\set ON_ERROR_STOP on"
  echo "BEGIN;"
  echo "SET session_replication_role = replica;"
  echo "TRUNCATE $tables CASCADE;"
  cat "$work/data.sql"
  echo "SET session_replication_role = origin;"
  echo "COMMIT;"
} | psql "$TARGET_DB_URL" -q -v ON_ERROR_STOP=1 >/dev/null

# Sequence-ууд (serial) — COPY setval-ийг data.sql агуулдаг; шалгалт: мөрийн тоо
psql "$TARGET_DB_URL" -At -c "select 'auth.users='||count(*) from auth.users union all select 'core_tenants='||count(*) from public.core_tenants union all select 'core_users='||count(*) from public.core_users" >&2
echo "сэргээлт дууслаа: $(( $(date +%s) - started )) с ($host)" >&2
