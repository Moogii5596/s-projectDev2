#!/usr/bin/env bash
# S Project — R2 bucket-ийн бүх файл → tar → age (v0.2.5 H5, #19). Шифрлээгүй хуулбар диск дээр үлдэхгүй (rclone cat биш — sync → tar stream).
#
# Хэрэглээ: scripts/ci/r2-backup.sh <label> <out-dir>
#   env R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY — R2 API token (зөвхөн Object Read); BUCKET; AGE_RECIPIENT
#   R2_* алга → «алгасав» гэж бичээд 0-ээр гарна (H2 #17 merge болох хүртэл файл R2-д байхгүй).
# Гаралт: <out-dir>/<label>-<UTC>.tar.age (bucket хоосон бол файл үүсгэхгүй).
# Сэргээх: age -d -i key.txt X.tar.age | tar -x -C <dir> ; rclone copy <dir> r2:<bucket>
set -euo pipefail

label="${1:?label шаардлагатай}"
out_dir="${2:?out-dir шаардлагатай}"
: "${AGE_RECIPIENT:?AGE_RECIPIENT алга}"

if [ -z "${R2_ENDPOINT:-}" ] || [ -z "${R2_ACCESS_KEY_ID:-}" ] || [ -z "${R2_SECRET_ACCESS_KEY:-}" ]; then
  echo "::warning::R2_* secret алга — файлын нөөцийг алгасав (${label})" >&2
  exit 0
fi
: "${BUCKET:?BUCKET алга}"
case "$label" in *[!A-Za-z0-9._-]*) echo "::error::label-д зөвхөн A-Z a-z 0-9 . _ -" >&2; exit 1 ;; esac
command -v rclone >/dev/null || { echo "::error::rclone алга" >&2; exit 1; }
command -v age >/dev/null || { echo "::error::age алга" >&2; exit 1; }

export RCLONE_CONFIG_R2_TYPE=s3 RCLONE_CONFIG_R2_PROVIDER=Cloudflare RCLONE_CONFIG_R2_ENDPOINT="$R2_ENDPOINT" \
       RCLONE_CONFIG_R2_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
       RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true

count="$(rclone lsf -R --files-only "r2:$BUCKET" | wc -l | tr -d ' ')"
if [ "$count" = 0 ]; then echo "R2 $BUCKET хоосон — алгасав" >&2; exit 0; fi

# Runner-ийн түр хавтас (job дуусахад устна) — файлууд хувийн зураг тул tar stream-ийг шууд шифрлэнэ
work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT
rclone copy "r2:$BUCKET" "$work/files" --transfers 8 --checkers 16 --retries 3
mkdir -p "$out_dir"
out="$out_dir/$label-$(date -u +%Y%m%dT%H%M%SZ).tar.age"
if ! tar -C "$work/files" -cf - . | age --encrypt --recipient "$AGE_RECIPIENT" --output "$out"; then
  rm -f "$out"; echo "::error::R2 нөөц амжилтгүй ($label)" >&2; exit 1
fi
echo "R2 нөөц: $out ($count файл, $(wc -c < "$out" | tr -d ' ') B)" >&2
echo "$out"
