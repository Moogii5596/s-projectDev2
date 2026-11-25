#!/usr/bin/env bash
# S Project — AGE_RECIPIENT-ийг шалгаж цэвэрлэнэ (db-backup.sh, r2-backup.sh `source` хийнэ).
# Шалтгаан (#43–#57): secret-д буруу хэлбэртэй утга байхад age «unknown recipient type» гэж унаж, pg_dump 30 секунд
# дэмий ажилласны дараа л мэдэгддэг байсан. Одоо dump эхлэхээс өмнө шалгаж, юу буруу байгааг (утгыг задлахгүйгээр) хэлнэ.
#
# Хүлээн авах хэлбэр:
#   age1…                     — зөв (нийтийн түлхүүр)
#   ssh-ed25519 … / ssh-rsa … — зөв (age SSH түлхүүрийг дэмждэг)
#   хоосон зай, CR (Windows), хашилт орсон — цэвэрлэнэ
#   age-keygen-ий файл бүтнээр («# public key: age1…» мөртэй) — нийтийн түлхүүрийг нь авна
#   AGE-SECRET-KEY-1…         — хувийн түлхүүр: нийтийг нь гаргаж нөөцийг хийнэ, гэхдээ warning (Secrets-д хувийн түлхүүр байх ёсгүй)
# Хэрэглээ: AGE_RECIPIENT="$(resolve_age_recipient "$AGE_RECIPIENT")"
resolve_age_recipient() {
  local raw="${1-}" v
  # CR, хашилт, эхний/сүүлийн хоосон зай
  v="$(printf '%s' "$raw" | tr -d '\r' | sed -e 's/^[[:space:]"'\'']*//' -e 's/[[:space:]"'\'']*$//')"
  if [ -z "$v" ]; then
    echo "::error::AGE_RECIPIENT хоосон (BACKUP_AGE_RECIPIENT secret)" >&2; return 1
  fi

  local pub
  pub="$(printf '%s\n' "$v" | grep -oE 'age1[0-9a-z]{58}' | head -n 1 || true)"
  if [ -n "$pub" ]; then
    if printf '%s' "$v" | grep -q 'AGE-SECRET-KEY-'; then
      echo "::warning::BACKUP_AGE_RECIPIENT-д age түлхүүрийн файл бүтнээрээ (ХУВИЙН түлхүүртэй) байна. Нийтийн түлхүүрийг нь ашиглав, гэхдээ Secrets-д хувийн түлхүүр байх ёсгүй — зөвхөн age1… утгаар солино уу (runbook §11)" >&2
    elif [ "$pub" != "$raw" ]; then echo "::warning::BACKUP_AGE_RECIPIENT-д илүү тэмдэгт/мөр байна — зөвхөн age1… нийтийн түлхүүрийг ашиглав. Secret-ийг цэвэр age1… утгаар солино уу (runbook §11)" >&2
    fi
    printf '%s' "$pub"; return 0
  fi

  case "$v" in
    ssh-ed25519\ *|ssh-rsa\ *)
      printf '%s' "$v"; return 0 ;;
  esac

  local sec
  sec="$(printf '%s\n' "$v" | grep -oE 'AGE-SECRET-KEY-1[0-9A-Z]{58}' | head -n 1 || true)"
  if [ -n "$sec" ]; then
    command -v age-keygen >/dev/null || { echo "::error::BACKUP_AGE_RECIPIENT-д хувийн түлхүүр байна, age-keygen алга — нийтийн түлхүүрээр (age1…) солино уу" >&2; return 1; }
    pub="$(printf '%s\n' "$sec" | age-keygen -y 2>/dev/null || true)"
    if [ -z "$pub" ]; then
      echo "::error::BACKUP_AGE_RECIPIENT-д хувийн түлхүүр байгаа боловч унших боломжгүй — нийтийн түлхүүрээр (age1…) солино уу" >&2; return 1
    fi
    echo "::warning::BACKUP_AGE_RECIPIENT-д age ХУВИЙН түлхүүр (AGE-SECRET-KEY-…) байна. Нөөцийг нийтийн түлхүүрээр нь шифрлэв, гэхдээ Secrets-д хувийн түлхүүр байх ёсгүй — «age-keygen -y key.txt»-ийн гаралтаар (age1…) солино уу (runbook §11)" >&2
    printf '%s' "$pub"; return 0
  fi

  # Утгыг задлахгүй: зөвхөн урт ба эхний тэмдэгтийн ангилал
  local kind=бусад
  case "$v" in
    age1*) kind='age1… боловч урт/тэмдэгт буруу (тасарсан эсвэл том үсэгтэй?)' ;;
    AGE-SECRET-KEY-*) kind='хувийн түлхүүр, гэхдээ бүрэн биш' ;;
    -----BEGIN*) kind='PEM/armor блок (age түлхүүр биш)' ;;
    *' '*) kind='олон үгтэй текст' ;;
  esac
  echo "::error::BACKUP_AGE_RECIPIENT буруу хэлбэртэй (урт ${#v}, төрөл: ${kind}). Хүлээх утга: «age-keygen -y key.txt»-ийн гаралт — age1… (62 тэмдэгт). Runbook 07_Cloud_Deploy.md §11" >&2
  return 1
}
