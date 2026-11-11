#!/usr/bin/env bash
# S Project — DB нөөц: pg_dump (custom format) → age шифрлэлт. Нэг удаа энд, бүх workflow ашиглана
# («Deploy production»-ий урьдчилсан нөөц — #18/H3; өдөр бүрийн нөөц — #19/H5).
#
# Хэрэглээ: scripts/ci/db-backup.sh <label> <out-dir>
#   env DB_URL         — шууд холболт (5432, postgres role). Pooler (6543) ✖ — pg_dump-д session хэрэгтэй.
#   env AGE_RECIPIENT  — age public key (age1…). Шифрлээгүй файл диск дээр үлдэхгүй.
# Гаралт: <out-dir>/<label>-<UTC timestamp>.dump.age ; stdout-ийн сүүлийн мөр = файлын зам.
# Шаардлага: pg_dump (сервертэй ижил эсвэл шинэ major), age.
# Сэргээх: age -d -i key.txt X.dump.age > X.dump ; pg_restore --no-owner --clean --if-exists -d "$TARGET_URL" X.dump
set -euo pipefail

label="${1:?label шаардлагатай (жнь prod-predeploy-v0.2.5)}"
out_dir="${2:?out-dir шаардлагатай}"
: "${DB_URL:?DB_URL алга}"
: "${AGE_RECIPIENT:?AGE_RECIPIENT алга}"

case "$label" in
  *[!A-Za-z0-9._-]*) echo "::error::label-д зөвхөн A-Z a-z 0-9 . _ -" >&2; exit 1 ;;
esac

command -v pg_dump >/dev/null || { echo "::error::pg_dump алга" >&2; exit 1; }
command -v age >/dev/null || { echo "::error::age алга" >&2; exit 1; }

mkdir -p "$out_dir"
ts="$(date -u +%Y%m%dT%H%M%SZ)"
out="$out_dir/$label-$ts.dump.age"

# public (апп) + auth (Supabase хэрэглэгч) + auth_guard (нэвтрэлтийн түгжээ, #16) + supabase_migrations (аль migration орсон). Custom format → pg_restore-оор сонгож сэргээнэ.
# pipefail: pg_dump унавал хагас файл үлдээхгүй.
if ! pg_dump "$DB_URL" --format=custom --compress=6 --no-comments \
      --schema=public --schema=auth --schema=auth_guard --schema=supabase_migrations \
    | age --encrypt --recipient "$AGE_RECIPIENT" --output "$out"; then
  rm -f "$out"
  echo "::error::нөөц амжилтгүй ($label)" >&2
  exit 1
fi

size="$(wc -c < "$out" | tr -d ' ')"
if [ "$size" -lt 1024 ]; then
  rm -f "$out"
  echo "::error::нөөцийн файл хэт жижиг (${size} B) — dump хоосон байж магадгүй" >&2
  exit 1
fi

echo "нөөц: $out (${size} B)" >&2
echo "$out"
