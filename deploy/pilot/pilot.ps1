<#
.SYNOPSIS
  S Project — Кемп пилот (Windows, нэг машин; v0.1.6+, staging профайл v0.2.0). Пилотын хавтасны root-оос ажиллуулна:
    cd E:\MoogiiDev\Pilot\s-project
    .\deploy\pilot\pilot.ps1 <команд> [аргумент] [-Profile pilot|staging] [-Root <хавтас>]

.DESCRIPTION
  Командууд:
    check                 Шаардлага (node, pnpm, docker, caddy, 7z) + .env-ийн аюулгүй байдал
    init                  Анх / шинэчлэлийн дараа: migration хуулах, Redis + Supabase асаах, migration, app_user нууц үг
    build                 pnpm install, Prisma, backend + web (VITE_MODULES=PILOT_MODULES) build
    start                 Redis + Supabase + backend + Caddy асаана (нэг удаа)
    run                   start + харуул (watchdog): унасан backend/Caddy-г дахин асаана. Task Scheduler үүнийг ажиллуулна
    stop [-All]           Caddy + backend зогсооно. -All: Supabase, Redis ч (өгөгдөл ХАДГАЛАГДАНА)
    status                Процесс, health, published port, Firewall, Funnel, DB + storage хэмжээ
    onboard --slug= ...   Байгууллага + эзэмшигч (pnpm pilot:onboard)
    user --email= ...     Хэрэглэгч нэмэх/засах (pnpm pilot:user)
    backup                Шифрлэсэн нөөц (7-Zip AES-256) → PILOT_BACKUP_DIR (+ хуулбар PILOT_BACKUP_COPY_DIR), хуучныг устгана
    restore <файл.7z>     Нөөцөөс сэргээх (ОДООГИЙН ӨГӨГДӨЛ УСТНА — баталгаажуулалт асууна)
    rotate-db-password    postgres / supabase_admin нууц үг солих (.env шинэчилнэ; staging-ээс эхэлнэ)
    upgrade -Tag <tag>    Шинэ хувилбар: нөөц → зогсоох → git fetch/checkout <tag> → init → build → start → health
                          (бохир git tree бол эхлэхгүй; алдаа гарвал буцаах заавар хэвлэнэ)
    auth-test <имэйл>     (зөвхөн -Profile staging) Нэвтрэлтийн түгжээ (PIL-07): 6 буруу нууц үг → 400×5, 429; дараа нь түгжээг тайлна
    unlock <имэйл>        5 буруу нууц үгээр түгжигдсэн бүртгэлийг шууд тайлах (PIL-07)
    firewall              (Админ) Windows Firewall: dev/пилотын портуудыг гаднаас хаах
    install-tasks         Task Scheduler: нэвтрэхэд `run`, өдөр бүр 02:00 `backup`
    uninstall-tasks       Task Scheduler-ийн даалгавруудыг устгах

  Профайл (-Profile):
    pilot (анхдагч)       .env, Supabase s-project-pilot (55321/55322), Redis 56379, backend 3100, Caddy 8088
    staging               .env.staging, Supabase s-project-staging (56521/56522, Studio 56523), Redis 56579,
                          backend 3200, Caddy 8089, нөөц staging-<slug>-*.7z. Тусдаа clone-д (-Root) ажиллуулна;
                          Task Scheduler / Funnel-гүй. Шинэчлэлийн дадлага: runbook §13в
  Мониторинг (PIL-04, заавал биш): PILOT_HEALTHCHECK_URL — run (watchdog) / status ping илгээнэ, унавал /fail.
                          PILOT_HEALTHCHECK_BACKUP_URL — backup-ийн дүн (хоосон бол алдааг л үндсэн URL руу /fail).
  -Root <хавтас>          Кодын хавтас (анхдагч: энэ скриптийн ../..). Хуучин tag-ийн clone-д шинэ скриптийг ашиглахад

  Windows PowerShell 5.1 + PowerShell 7-д ажиллана. Энэ файл UTF-8 BOM-той (5.1 кирилл зөв уншина).
  Дэлгэрэнгүй: docs/07_Tech_Stack_and_Environment/04_Pilot_Camp_Windows.md
#>
[CmdletBinding()]
param(
  [Parameter(Position = 0)] [string] $Command = 'help',
  [Parameter(Position = 1, ValueFromRemainingArguments = $true)] [string[]] $Rest,
  [switch] $All,
  [switch] $Yes,
  # $PROFILE (PowerShell-ийн автомат хувьсагч)-тай давхцахгүйн тулд дотроо $Instance
  [Alias('Profile')] [ValidateSet('pilot', 'staging')] [string] $Instance = 'pilot',
  [string] $Root = '',
  [string] $Tag = ''
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }

# ── Тогтмолууд ────────────────────────────────────────────────
$ScriptDir = $PSScriptRoot
$DefaultRoot = Split-Path -Parent (Split-Path -Parent $ScriptDir)
if ($Root) { $Root = (Resolve-Path $Root).Path } else { $Root = $DefaultRoot }
# Профайл бүрийн тогтмол (v0.2.0 §0.2). pilot-ийн утгууд v0.1.6-тай ЯГ ижил.
#   pilot: ажлын хавтас = <Root>\deploy\pilot (run\, supabase\ — скриптийг өөр газраас ажиллуулсан ч пилотынх)
#   staging: ажлын хавтас = энэ скриптийн ..\staging (хуучин tag-ийн clone-д deploy\staging байхгүй тул tools хуулбарт)
$Profiles = @{
  pilot   = @{
    Dir = (Join-Path (Join-Path $Root 'deploy') 'pilot'); EnvFile = '.env'; ProjectId = 's-project-pilot'; RedisContainer = 's-project-pilot-redis'
    ApiPort = 55321; DbPort = 55322; StudioPort = 55323; RedisPort = 56379; Port = '3100'; HttpPort = '8088'; BackupPrefix = ''; Tasks = $true
    NetworkId = 's-project-pilot-loopback'
  }
  staging = @{
    Dir = (Join-Path (Split-Path -Parent $ScriptDir) 'staging'); EnvFile = '.env.staging'; ProjectId = 's-project-staging'
    RedisContainer = 's-project-staging-redis'; ApiPort = 56521; DbPort = 56522; StudioPort = 56523; RedisPort = 56579; Port = '3200'; HttpPort = '8089'
    BackupPrefix = 'staging-'; Tasks = $false; NetworkId = 's-project-staging-loopback'
  }
}
$Prof = $Profiles[$Instance]
$PilotDir = $Prof.Dir
$ProjectId = $Prof.ProjectId
$DbContainer = "supabase_db_$ProjectId"
$RedisContainer = $Prof.RedisContainer
$RedisCompose = Join-Path $PilotDir 'docker-compose.redis.yml'
$RunDir = Join-Path $PilotDir 'run'
$LogDir = Join-Path $RunDir 'logs'
$BackendDir = Join-Path (Join-Path $Root 'apps') 'core-kernel'
$WebDist = Join-Path (Join-Path (Join-Path $Root 'apps') 'web-shell') 'dist'
$SupabaseApiPort = $Prof.ApiPort
# Supabase local-ийн олон нийтэд ил demo нууц — пилотод ХЭЗЭЭ Ч болохгүй
$DemoJwtSecret = 'super-secret-jwt-token-with-at-least-32-characters-long'
$DefaultAppUserPassword = 'change_in_production'
$IsWin = ([Environment]::OSVersion.Platform -eq 'Win32NT')

# ── Гаралт ───────────────────────────────────────────────────
function Write-Step([string] $m) { Write-Host "==> $m" -ForegroundColor Cyan }
function Write-Ok([string] $m) { Write-Host "  [OK] $m" -ForegroundColor Green }
function Write-Warn2([string] $m) { Write-Host "  [!]  $m" -ForegroundColor Yellow }
function Stop-Pilot2([string] $m) { throw "[АЛДАА] $m" }

function Write-Log([string] $file, [string] $m) {
  New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
  $line = "{0} {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $m
  Add-Content -Path (Join-Path $LogDir $file) -Value $line -Encoding UTF8
}

function Format-NativeCommandError([string] $exe, [string[]] $arguments, [int] $code) {
  $safe = @()
  $redactNext = $false
  foreach ($argument in $arguments) {
    if ($redactNext) { $safe += '***'; $redactNext = $false; continue }
    if ($argument -match '(?i)^PGPASSWORD=') { $safe += 'PGPASSWORD=***' }
    elseif ([System.IO.Path]::GetFileNameWithoutExtension($exe) -ieq '7z' -and $argument -match '^-p.+') { $safe += '-p***' }
    elseif ($argument -match "(?i)^--?(password|pass|secret|token)$") { $safe += $argument; $redactNext = $true }
    elseif ($argument -match "(?i)^--?(password|pass|secret|token)=.*$") { $safe += ($argument -replace '=.*$', '=***') }
    elseif ($argument -match '(?i)\bALTER\s+ROLE\b.*\bPASSWORD\b') { $safe += '<SQL redacted>' }
    else { $safe += $argument }
  }
  return "$exe $($safe -join ' ') → exit $code"
}

# ── Native команд (5.1: stderr + ErrorActionPreference=Stop → алдаа шиддэг тул түр Continue) ──
function Invoke-Native {
  param([string] $Exe, [string[]] $Arguments, [switch] $AllowFail, [switch] $Quiet, [switch] $Capture)
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    if ($Capture) {
      $out = & $Exe @Arguments 2>$null
      $code = $LASTEXITCODE
    } elseif ($Quiet) {
      & $Exe @Arguments *> $null
      $code = $LASTEXITCODE
      $out = $null
    } else {
      & $Exe @Arguments | Out-Host
      $code = $LASTEXITCODE
      $out = $null
    }
  } finally {
    $ErrorActionPreference = $prev
  }
  if ($code -ne 0 -and -not $AllowFail) {
    Stop-Pilot2 (Format-NativeCommandError $Exe $Arguments $code)
  }
  return [pscustomobject]@{ Code = $code; Out = $out }
}

# ── .env ─────────────────────────────────────────────────────
function Read-DotEnv([string] $path) {
  $h = @{}
  foreach ($raw in (Get-Content -Path $path -Encoding UTF8)) {
    $line = $raw.Trim()
    if ($line -eq '' -or $line.StartsWith('#')) { continue }
    $i = $line.IndexOf('=')
    if ($i -lt 1) { continue }
    $k = $line.Substring(0, $i).Trim()
    $v = $line.Substring($i + 1).Trim()
    if ($v.Length -ge 2 -and (($v.StartsWith('"') -and $v.EndsWith('"')) -or ($v.StartsWith("'") -and $v.EndsWith("'")))) {
      $v = $v.Substring(1, $v.Length - 2)
    }
    $h[$k] = $v
  }
  return $h
}

function Get-Cfg([hashtable] $cfg, [string] $key, [string] $default = '') {
  if ($cfg.ContainsKey($key) -and $cfg[$key] -ne '') { return [string] $cfg[$key] }
  return $default
}

# ── Мониторинг (PIL-04): healthchecks.io-ийн ping. URL хоосон бол юу ч хийхгүй; алдаа хэзээ ч шидэхгүй ──
# $Kind: 'main' (PILOT_HEALTHCHECK_URL) | 'backup' (PILOT_HEALTHCHECK_BACKUP_URL; хоосон бол зөвхөн /fail-ийг main руу)
# URL-д check-ийн токен байдаг тул лог/дэлгэцэнд URL-ийг хэвлэхгүй.
function Send-HealthPing([hashtable] $cfg, [string] $Kind = 'main', [switch] $Fail, [string] $Message = '') {
  $url = Get-Cfg $cfg 'PILOT_HEALTHCHECK_URL'
  if ($Kind -eq 'backup') {
    $bu = Get-Cfg $cfg 'PILOT_HEALTHCHECK_BACKUP_URL'
    if ($bu) { $url = $bu } elseif (-not $Fail) { return $false }
  }
  if (-not $url) { return $false }
  $target = $url.TrimEnd('/')
  if ($Fail) { $target += '/fail' }
  $body = "$Instance $Kind $Message"
  if ($body.Length -gt 1000) { $body = $body.Substring(0, 1000) }
  try {
    $null = Invoke-WebRequest -Uri $target -Method Post -Body ([Text.Encoding]::UTF8.GetBytes($body)) -ContentType 'text/plain; charset=utf-8' -TimeoutSec 10 -UseBasicParsing
    return $true
  } catch {
    Write-Log 'pilot.log' "healthcheck ping ($Kind$(if ($Fail) { '/fail' })) амжилтгүй: $($_.Exception.Message)"
    return $false
  }
}

function Import-PilotEnv {
  $envFile = Join-Path $Root $Prof.EnvFile
  if (-not (Test-Path $envFile)) {
    if ($Instance -eq 'staging') { Stop-Pilot2 ".env.staging алга ($envFile). copy deploy\staging\.env.staging.example .env.staging → <...>-г бөглөнө" }
    Stop-Pilot2 ".env алга ($envFile). copy deploy\pilot\.env.pilot.example .env → <...>-г бөглөнө"
  }
  $cfg = Read-DotEnv $envFile
  foreach ($k in $cfg.Keys) { Set-Item -Path "env:$k" -Value $cfg[$k] }
  return $cfg
}

function Get-UrlPassword([string] $url) {
  if ($url -match '^postgres(?:ql)?://([^:/@]+):([^@]*)@') { return $Matches[2] }
  return ''
}

function Set-DotEnvValue([string] $content, [string] $key, [string] $value) {
  $pattern = "(?m)^[ \t]*$([regex]::Escape($key))=.*$"
  if ([regex]::IsMatch($content, $pattern)) {
    return [regex]::Replace($content, $pattern, "$key=$value")
  }
  return "$($content.TrimEnd("`r", "`n"))`r`n$key=$value`r`n"
}

function Save-DotEnvValue([string] $path, [string] $key, [string] $value) {
  $content = [System.IO.File]::ReadAllText($path)
  $updated = Set-DotEnvValue $content $key $value
  $temp = "$path.$PID.tmp"
  try {
    $encoding = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($temp, $updated, $encoding)
    Move-Item -LiteralPath $temp -Destination $path -Force
  } finally {
    if (Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp -Force -ErrorAction SilentlyContinue }
  }
}

function ConvertFrom-SecureInput([securestring] $value) {
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($value)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}

function Invoke-DbPasswordRotation {
  $cfg = Import-PilotEnv
  $envFile = Join-Path $Root $Prof.EnvFile
  $oldPassword = Get-Cfg $cfg 'PILOT_DB_ADMIN_PASSWORD' 'postgres'
  if ($Instance -eq 'pilot') {
    if (-not $Yes) { Stop-Pilot2 'Пилотын нууц үг солиход staging-г эхэлж шалгасны дараа -Yes өгнө' }
    $confirmation = Read-Host "Баталгаажуулахын тулд $($cfg['DEDICATED_TENANT_SLUG']) гэж бич"
    if ($confirmation -cne $cfg['DEDICATED_TENANT_SLUG']) { Stop-Pilot2 'Пилотын нууц үг солих цуцлагдлаа' }
  }
  $first = Read-Host 'Шинэ DB administrator нууц үг (32+ латин үсэг/тоо)' -AsSecureString
  $second = Read-Host 'Шинэ DB administrator нууц үгийг давтан оруул' -AsSecureString
  $newPassword = ConvertFrom-SecureInput $first
  $confirmPassword = ConvertFrom-SecureInput $second
  if ($newPassword -notmatch '^[A-Za-z0-9]{32,}$') { Stop-Pilot2 'DB administrator нууц үг зөвхөн латин үсэг/тоо, 32+ тэмдэгт байна' }
  if ($newPassword -cne $confirmPassword) { Stop-Pilot2 'Нууц үг таарсангүй' }
  if ($newPassword -ceq $oldPassword) { Stop-Pilot2 'Шинэ нууц үг одоогийн нууц үгтэй ижил байна' }

  $null = Invoke-DbSql 'SELECT current_user' -Capture -User 'postgres' -Password $oldPassword
  $sql = "BEGIN; ALTER ROLE postgres WITH PASSWORD '$newPassword'; ALTER ROLE supabase_admin WITH PASSWORD '$newPassword'; COMMIT;"
  Invoke-DbSql $sql -User 'postgres' -Password $oldPassword | Out-Null
  try {
    foreach ($role in 'postgres', 'supabase_admin') {
      $result = Invoke-DbSql 'SELECT current_user' -Capture -User $role -Password $newPassword
      if ((@($result.Out) -join '').Trim() -ne $role) { Stop-Pilot2 "DB administrator нууц үгийн шалгалт амжилтгүй ($role)" }
    }
    Save-DotEnvValue $envFile 'PILOT_DB_ADMIN_PASSWORD' $newPassword
  } catch {
    $saveError = $_.Exception.Message
    try {
      $rollback = "BEGIN; ALTER ROLE postgres WITH PASSWORD '$oldPassword'; ALTER ROLE supabase_admin WITH PASSWORD '$oldPassword'; COMMIT;"
      Invoke-DbSql $rollback -User 'postgres' -Password $newPassword | Out-Null
    } catch {
      Stop-Pilot2 "DB password шинэчлэгдсэн боловч .env бичих болон DB rollback хоёулаа амжилтгүй. Нууцыг гараар сэргээнэ. .env алдаа: $saveError; rollback: $($_.Exception.Message)"
    }
    Stop-Pilot2 ".env бичиж чадсангүй; DB нууц үгийг хуучнаар буцаав: $saveError"
  }
  $env:PILOT_DB_ADMIN_PASSWORD = $newPassword
  Write-Ok 'postgres / supabase_admin нууц үг солигдож .env шинэчлэгдэв; нууцыг нууц үгийн менежерт хадгал'
}

# Алдааны жагсаалт буцаана (хоосон = OK). Анхааруулгыг шууд хэвлэнэ.
function Test-PilotEnv([hashtable] $cfg, [switch] $NeedBackup) {
  $errors = New-Object System.Collections.Generic.List[string]
  $required = 'NODE_ENV', 'PORT', 'DEPLOYMENT_MODE', 'DEDICATED_TENANT_SLUG', 'DATABASE_URL', 'SYSTEM_DATABASE_URL',
    'DIRECT_URL', 'SUPABASE_URL', 'SUPABASE_AUTH_JWT_SECRET', 'JWT_SECRET', 'REDIS_URL'
  foreach ($k in $required) { if ((Get-Cfg $cfg $k) -eq '') { $errors.Add("$k тохируулаагүй") } }
  foreach ($k in $cfg.Keys) {
    if ([string]$cfg[$k] -match '<[^>]*>') { $errors.Add("$k — <...> загварын утга хэвээр") }
  }
  if ((Get-Cfg $cfg 'NODE_ENV') -ne 'production') { $errors.Add('NODE_ENV=production байх ёстой') }
  if ((Get-Cfg $cfg 'DEPLOYMENT_MODE') -ne 'dedicated') { $errors.Add('DEPLOYMENT_MODE=dedicated байх ёстой') }
  $slug = Get-Cfg $cfg 'DEDICATED_TENANT_SLUG'
  if ($slug -notmatch '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$') { $errors.Add("DEDICATED_TENANT_SLUG буруу: '$slug'") }

  $sec = Get-Cfg $cfg 'SUPABASE_AUTH_JWT_SECRET'
  if ($sec.Length -lt 32) { $errors.Add('SUPABASE_AUTH_JWT_SECRET 32+ тэмдэгт байх ёстой') }
  if ($sec -eq $DemoJwtSecret) { $errors.Add('SUPABASE_AUTH_JWT_SECRET = Supabase-ийн НИЙТЭД ИЛ demo нууц — солино') }
  if ((Get-Cfg $cfg 'JWT_SECRET').Length -lt 32) { $errors.Add('JWT_SECRET 32+ тэмдэгт байх ёстой') }
  if ((Get-Cfg $cfg 'JWT_SECRET') -match 'CHANGE') { $errors.Add('JWT_SECRET жишээ утга хэвээр') }
  $dbAdminPassword = Get-Cfg $cfg 'PILOT_DB_ADMIN_PASSWORD'
  if (-not $dbAdminPassword) { Write-Warn2 'PILOT_DB_ADMIN_PASSWORD тохируулаагүй — нөөцлөсний дараа pilot.ps1 rotate-db-password ажиллуулна' }
  elseif ($dbAdminPassword -notmatch '^[A-Za-z0-9]{32,}$') { $errors.Add('PILOT_DB_ADMIN_PASSWORD зөвхөн латин үсэг/тоо, 32+ тэмдэгт байна') }
  $storageDbWarnGb = Get-Cfg $cfg 'PILOT_STORAGE_DB_WARN_GB' '10'
  if ($storageDbWarnGb -notmatch '^\d+(?:\.\d+)?$' -or [double]$storageDbWarnGb -le 0) {
    $errors.Add('PILOT_STORAGE_DB_WARN_GB эерэг тоо байна')
  }
  foreach ($k in @('PILOT_HEALTHCHECK_URL', 'PILOT_HEALTHCHECK_BACKUP_URL')) {
    $u = Get-Cfg $cfg $k
    if ($u -and $u -notmatch '^https://[^\s/]+/\S*$') { $errors.Add("$k нь https://... URL байх ёстой") }
  }

  $dbUrl = Get-Cfg $cfg 'DATABASE_URL'
  if ($dbUrl -notmatch '^postgres(?:ql)?://app_user:') { $errors.Add('DATABASE_URL нь app_user-ээр (RLS) холбогдох ёстой') }
  $pw = Get-UrlPassword $dbUrl
  if ($pw -eq $DefaultAppUserPassword) { $errors.Add('DATABASE_URL: app_user-ийн анхдагч нууц үг (change_in_production) — солино') }
  if ($pw -notmatch '^[A-Za-z0-9]{24,}$') { $errors.Add('DATABASE_URL: app_user нууц үг зөвхөн латин үсэг/тоо, 24+ тэмдэгт') }
  if ($dbUrl -notmatch "@127\.0\.0\.1:$($Prof.DbPort)/") { Write-Warn2 "DATABASE_URL нь 127.0.0.1:$($Prof.DbPort) биш ($Instance-ийн Supabase)?" }
  if ($Instance -eq 'staging') {
    # Staging ХЭЗЭЭ Ч пилотын DB / Redis / порт руу холбогдохгүй (шинэчлэлийн дадлага пилотын өгөгдлийг өөрчлөхгүй)
    foreach ($k in 'DATABASE_URL', 'SYSTEM_DATABASE_URL', 'DIRECT_URL') {
      if ((Get-Cfg $cfg $k) -match ':5532[0-9]/') { $errors.Add("$k пилотын DB (5532x) руу заасан — staging: 127.0.0.1:$($Prof.DbPort)") }
    }
    if ((Get-Cfg $cfg 'SUPABASE_URL') -match ':5532[0-9]') { $errors.Add("SUPABASE_URL пилотынх — staging: http://127.0.0.1:$($Prof.ApiPort)") }
    if ((Get-Cfg $cfg 'REDIS_URL') -match ':56379') { $errors.Add("REDIS_URL пилотынх — staging: redis://127.0.0.1:$($Prof.RedisPort)") }
    if ((Get-Cfg $cfg 'PORT') -in @('3000', '3100')) { $errors.Add("PORT=$(Get-Cfg $cfg 'PORT') нь dev/пилоттой давхцана — staging: $($Prof.Port)") }
    if ((Get-Cfg $cfg 'PILOT_HTTP_PORT' '8088') -eq '8088') { $errors.Add("PILOT_HTTP_PORT нь пилоттой давхцана — staging: $($Prof.HttpPort)") }
  }
  if ((Get-Cfg $cfg 'SUPABASE_URL') -ne "http://127.0.0.1:$SupabaseApiPort") { Write-Warn2 "SUPABASE_URL нь http://127.0.0.1:$SupabaseApiPort биш?" }
  if ((Get-Cfg $cfg 'REDIS_URL') -ne "redis://127.0.0.1:$($Prof.RedisPort)") { Write-Warn2 "REDIS_URL нь $Instance-ийн Redis (redis://127.0.0.1:$($Prof.RedisPort)) биш?" }
  if ($Instance -eq 'pilot' -and (Get-Cfg $cfg 'PORT') -eq '3000') { Write-Warn2 'PORT=3000 нь dev backend-тэй давхцана (3100 зөвлөнө)' }
  if ((Get-Cfg $cfg 'ESCALATION_CRON') -ne 'off') { Write-Warn2 'ESCALATION_CRON=off биш — автомат escalation асаалттай' }

  $bpw = Get-Cfg $cfg 'PILOT_BACKUP_PASSWORD'
  if ($bpw -notmatch '^[A-Za-z0-9]{16,}$') {
    $m = 'PILOT_BACKUP_PASSWORD зөвхөн латин үсэг/тоо, 16+ тэмдэгт'
    if ($NeedBackup) { $errors.Add($m) } else { Write-Warn2 "$m — нөөцлөлт ажиллахгүй" }
  }
  if ((Get-Cfg $cfg 'PILOT_BACKUP_DIR') -eq '') {
    if ($NeedBackup) { $errors.Add('PILOT_BACKUP_DIR тохируулаагүй') } else { Write-Warn2 'PILOT_BACKUP_DIR тохируулаагүй' }
  }
  return ,$errors
}

function Assert-PilotEnv([hashtable] $cfg, [switch] $NeedBackup) {
  $errors = Test-PilotEnv $cfg -NeedBackup:$NeedBackup
  if ($errors.Count -gt 0) {
    foreach ($e in $errors) { Write-Host "  [X]  $e" -ForegroundColor Red }
    Stop-Pilot2 "$($Prof.EnvFile)-д $($errors.Count) алдаа (pilot.ps1 check -Profile $Instance)"
  }
}

# ── JWT (HS256) шалгалт: anon key аль нууцаар гарын үсэг зурсан бэ ──
function ConvertTo-Base64Url([byte[]] $bytes) {
  return [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}

function Test-JwtHs256([string] $jwt, [string] $secret) {
  $parts = $jwt.Split('.')
  if ($parts.Count -ne 3) { return $false }
  $hmac = New-Object System.Security.Cryptography.HMACSHA256 (, [System.Text.Encoding]::UTF8.GetBytes($secret))
  try {
    $sig = $hmac.ComputeHash([System.Text.Encoding]::ASCII.GetBytes("$($parts[0]).$($parts[1])"))
  } finally { $hmac.Dispose() }
  return (ConvertTo-Base64Url $sig) -eq $parts[2]
}

# ── Supabase ─────────────────────────────────────────────────
function Invoke-Supabase([string[]] $Arguments, [switch] $Capture, [switch] $AllowFail) {
  if (-not (Test-NodeDeps)) { Stop-Pilot2 'Supabase CLI алга (node_modules) → pnpm install --frozen-lockfile, эсвэл pilot.ps1 init' }
  $a = @('exec', 'supabase') + $Arguments + @('--workdir', $PilotDir)
  Push-Location $Root
  try { return Invoke-Native -Exe 'pnpm' -Arguments $a -Capture:$Capture -AllowFail:$AllowFail } finally { Pop-Location }
}

function Get-SupabaseKeys {
  $r = Invoke-Supabase -Arguments @('status', '-o', 'env') -Capture -AllowFail
  if ($r.Code -ne 0) { return $null }
  $keys = @{}
  foreach ($line in @($r.Out)) {
    if ([string]$line -match '^\s*([A-Z_]+)\s*=\s*"?([^"]*)"?\s*$') { $keys[$Matches[1]] = $Matches[2] }
  }
  if (-not $keys.ContainsKey('ANON_KEY') -or -not $keys.ContainsKey('SERVICE_ROLE_KEY')) { return $null }
  return $keys
}

function Assert-KeysSecure([hashtable] $keys, [string] $secret) {
  foreach ($k in 'ANON_KEY', 'SERVICE_ROLE_KEY') {
    if (Test-JwtHs256 $keys[$k] $DemoJwtSecret) {
      Stop-Pilot2 "$k нь Supabase-ийн НИЙТЭД ИЛ demo нууцаар гарын үсэгтэй! SUPABASE_AUTH_JWT_SECRET орчинд байгаагүй үед Supabase асаасан. → pilot.ps1 stop -All; pilot.ps1 start"
    }
    if (-not (Test-JwtHs256 $keys[$k] $secret)) {
      Write-Warn2 "$k-ийн гарын үсгийг SUPABASE_AUTH_JWT_SECRET-ээр баталгаажуулж чадсангүй (Supabase-ийг энэ нууцаар асаасан эсэхийг шалга)"
    }
  }
}

function Set-KeysEnv([hashtable] $keys) {
  $env:SUPABASE_ANON_KEY = $keys['ANON_KEY']
  $env:SUPABASE_SERVICE_ROLE_KEY = $keys['SERVICE_ROLE_KEY']
}

function Wait-Docker([int] $timeoutSec = 300) {
  $deadline = (Get-Date).AddSeconds($timeoutSec)
  while ($true) {
    $r = Invoke-Native -Exe 'docker' -Arguments @('info') -Quiet -AllowFail
    if ($r.Code -eq 0) { return }
    if ((Get-Date) -gt $deadline) { Stop-Pilot2 'Docker Desktop ажиллахгүй байна (docker info)' }
    Write-Host '  ... Docker Desktop-ийг хүлээж байна'
    Start-Sleep -Seconds 5
  }
}

function Start-PilotRedis {
  Invoke-Native -Exe 'docker' -Arguments @('compose', '-f', $RedisCompose, '-p', $RedisContainer, 'up', '-d') | Out-Null
  Write-Ok "Redis ($RedisContainer, 127.0.0.1:$($Prof.RedisPort))"
}

# PIL-07: config.toml-ийн өөрчлөлт (жнь [auth.hook.*]) ажиллаж буй Supabase-д үйлчлэхгүй — `supabase start` үед л уншина.
# Асаасан үеийн config.toml-ийн SHA256-г run\supabase-config.sha256-д хадгалж, init үед зөрвөл дахин асаана.
function Get-SupabaseConfigFingerprint {
  $configHash = (Get-FileHash -LiteralPath (Join-Path (Join-Path $PilotDir 'supabase') 'config.toml') -Algorithm SHA256).Hash
  return "$configHash|$($Prof.NetworkId)"
}
function Get-SupabaseConfigStampFile { return Join-Path $RunDir 'supabase-config.sha256' }
function Save-SupabaseConfigStamp {
  New-Item -ItemType Directory -Force -Path $RunDir | Out-Null
  Set-Content -Path (Get-SupabaseConfigStampFile) -Value (Get-SupabaseConfigFingerprint) -Encoding ASCII
}
function Test-SupabaseConfigChanged {
  $f = Get-SupabaseConfigStampFile
  $prev = if (Test-Path $f) { (Get-Content -Path $f -Raw).Trim() } else { '' }
  return ($prev -ne (Get-SupabaseConfigFingerprint))
}

function Get-SupabaseNetworkHostBinding {
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { return $null }
  $r = Invoke-Native 'docker' @('network', 'inspect', '--format', '{{ index .Options "com.docker.network.bridge.host_binding_ipv4" }}', $Prof.NetworkId) -Capture -AllowFail
  if ($r.Code -ne 0) { return $null }
  return (@($r.Out) -join '').Trim()
}

function Show-SupabasePortBindings {
  $r = Invoke-Native 'docker' @('ps', '--format', '{{.Ports}}') -Capture -AllowFail
  if ($r.Code -ne 0) {
    Write-Warn2 'Docker port binding шалгаж чадсангүй'
    return
  }
  $bindings = @($r.Out) -join "`n"
  foreach ($port in @(
    @('Supabase API', $Prof.ApiPort),
    @('PostgreSQL', $Prof.DbPort),
    @('Supabase Studio', $Prof.StudioPort)
  )) {
    $label = $port[0]
    $number = [int]$port[1]
    $pattern = "(?<address>(?:\d{1,3}\.){3}\d{1,3}|\[::\]|::):$number->"
    $match = [regex]::Match($bindings, $pattern)
    if ($match.Success) {
      if ($match.Groups['address'].Value -eq '127.0.0.1') { Write-Ok "$label port $number → 127.0.0.1" }
      else { Write-Warn2 "$label port $number гадна интерфэйстэй холбогдсон ($($match.Groups['address'].Value))" }
    } elseif ($bindings -match "(?<!\d)$number->") {
      Write-Warn2 "$label port $number host address тодорхойгүй"
    } elseif ($label -eq 'Supabase Studio') {
      Write-Host "  Studio port $number нийтлэгдээгүй (унтраалттай үед хэвийн)"
    } else {
      Write-Warn2 "$label port $number нийтлэгдээгүй (контейнер зогссон эсвэл port mapping алга)"
    }
  }
}

function Ensure-SupabaseLoopbackNetwork {
  $binding = Get-SupabaseNetworkHostBinding
  if ($null -eq $binding) {
    Invoke-Native 'docker' @('network', 'create', '--driver', 'bridge', '--opt', 'com.docker.network.bridge.host_binding_ipv4=127.0.0.1', $Prof.NetworkId) -Quiet | Out-Null
    $binding = Get-SupabaseNetworkHostBinding
  }
  if ($binding -ne '127.0.0.1') {
    Stop-Pilot2 "Docker network '$($Prof.NetworkId)' loopback-д холбогдоогүй (host binding='$binding'); холбогдсон контейнергүйг шалгаад сүлжээг гараар дахин үүсгэнэ"
  }
}

function Start-PilotSupabase([hashtable] $cfg, [switch] $AllowPendingConfigChange) {
  # env() → SUPABASE_AUTH_JWT_SECRET. Байхгүй бол CLI demo нууцаар асдаг тул заавал шалгана
  if ((Get-Cfg $cfg 'SUPABASE_AUTH_JWT_SECRET').Length -lt 32) { Stop-Pilot2 'SUPABASE_AUTH_JWT_SECRET алга' }
  if ((Get-Cfg $cfg 'PILOT_DB_ADMIN_PASSWORD') -notmatch '^[A-Za-z0-9]{32,}$') {
    Stop-Pilot2 'PILOT_DB_ADMIN_PASSWORD тохируулаагүй/буруу — staging → pilot дарааллаар rotate-db-password ажиллуулна'
  }
  Ensure-SupabaseLoopbackNetwork
  $env:SUPABASE_AUTH_JWT_SECRET = $cfg['SUPABASE_AUTH_JWT_SECRET']
  $keys = Get-SupabaseKeys
  if ($null -eq $keys) {
    Write-Step 'Supabase (пилот) асааж байна'
    Invoke-Supabase -Arguments @('start', '--network-id', $Prof.NetworkId) | Out-Null
    $keys = Get-SupabaseKeys
    if ($null -eq $keys) { Stop-Pilot2 'supabase status — түлхүүр уншиж чадсангүй' }
    Save-SupabaseConfigStamp
  } elseif ((Test-SupabaseConfigChanged) -and -not $AllowPendingConfigChange) {
    Stop-Pilot2 'Supabase config/network өөрчлөгдсөн — өгөгдлийг хадгалсан init-ээр шинэчилнэ'
  }
  Assert-KeysSecure $keys $cfg['SUPABASE_AUTH_JWT_SECRET']
  Set-KeysEnv $keys
  Write-Ok "Supabase ($ProjectId, API 127.0.0.1:$SupabaseApiPort)"
  return $keys
}

function Sync-Migrations {
  $src = Join-Path (Join-Path $Root 'supabase') 'migrations'
  $dst = Join-Path (Join-Path $PilotDir 'supabase') 'migrations'
  New-Item -ItemType Directory -Force -Path $dst | Out-Null
  $srcNames = @(Get-ChildItem -Path $src -Filter '*.sql' | ForEach-Object { $_.Name })
  foreach ($f in (Get-ChildItem -Path $dst -Filter '*.sql')) {
    if ($srcNames -notcontains $f.Name) { Write-Warn2 "migration $($f.Name) кодонд алга — устгав"; Remove-Item $f.FullName }
  }
  Copy-Item -Path (Join-Path $src '*.sql') -Destination $dst -Force
  Write-Ok "migration-ууд хуулагдав ($($srcNames.Count))"
}

# Container доторх psql (supabase_admin = Supabase-ийн superuser; lessons TEST-007)
function Invoke-DbSql([string] $sql, [switch] $Capture, [string] $User = 'supabase_admin', [string] $Password = '') {
  if (-not $Password) {
    $Password = if ($env:PILOT_DB_ADMIN_PASSWORD) { $env:PILOT_DB_ADMIN_PASSWORD } else { 'postgres' }
  }
  $a = @('exec', '-e', "PGPASSWORD=$Password", $DbContainer, 'psql', '-h', '127.0.0.1', '-U', $User, '-d', 'postgres',
    '-v', 'ON_ERROR_STOP=1', '-At', '-c', $sql)
  $result = Invoke-Native -Exe 'docker' -Arguments $a -Capture:$Capture -AllowFail
  if ($result.Code -ne 0) { Stop-Pilot2 "PostgreSQL command амжилтгүй (exit $($result.Code))" }
  return $result
}

function Set-AppUserPassword([hashtable] $cfg) {
  $pw = Get-UrlPassword (Get-Cfg $cfg 'DATABASE_URL')
  if ($pw -notmatch '^[A-Za-z0-9]{24,}$') { Stop-Pilot2 'DATABASE_URL-ийн app_user нууц үг буруу' }
  Invoke-DbSql "ALTER ROLE app_user PASSWORD '$pw'" | Out-Null
  $r = Invoke-DbSql 'SELECT current_user' -User 'app_user' -Password $pw -Capture
  if ((@($r.Out) -join '').Trim() -ne 'app_user') { Stop-Pilot2 'app_user шинэ нууц үгээр нэвтэрч чадсангүй' }
  Write-Ok 'app_user нууц үг тохируулав (RLS холболт)'
}

# ── Процесс (PID файл) ───────────────────────────────────────
function Get-PidFile([string] $name) { return Join-Path $RunDir "$name.pid" }

function Get-PilotProcess([string] $name, [string] $procName) {
  $f = Get-PidFile $name
  if (-not (Test-Path $f)) { return $null }
  $id = [int] ((Get-Content $f -Raw).Trim())
  $p = Get-Process -Id $id -ErrorAction SilentlyContinue
  if ($null -eq $p) { return $null }
  if ($p.ProcessName -notlike "$procName*") { return $null }  # PID дахин ашиглагдсан
  return $p
}

function Start-PilotProcess([string] $name, [string] $exe, [string[]] $arguments, [string] $workDir) {
  New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
  $out = Join-Path $LogDir "$name.log"
  $err = Join-Path $LogDir "$name.err.log"
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  foreach ($f in $out, $err) {
    if ((Test-Path $f) -and (Get-Item $f).Length -gt 0) {
      Move-Item $f ($f -replace '\.log$', "-$stamp.log") -Force
    }
  }
  # Хуучин логоос сүүлийн 10-ыг үлдээнэ
  Get-ChildItem -Path $LogDir -Filter "$name*-*.log" | Sort-Object LastWriteTime -Descending | Select-Object -Skip 20 |
    Remove-Item -Force -ErrorAction SilentlyContinue
  # 5.1: ArgumentList-ийг зайгаар нийлүүлдэг → зайтай замыг хашилтанд
  $quoted = $arguments | ForEach-Object { if ($_ -match '\s') { '"' + $_ + '"' } else { $_ } }
  $sp = @{
    FilePath = $exe; ArgumentList = $quoted; WorkingDirectory = $workDir; PassThru = $true
    RedirectStandardOutput = $out; RedirectStandardError = $err
  }
  if ($IsWin) { $sp['WindowStyle'] = 'Hidden' }
  $p = Start-Process @sp
  New-Item -ItemType Directory -Force -Path $RunDir | Out-Null
  Set-Content -Path (Get-PidFile $name) -Value $p.Id -Encoding ASCII
  return $p
}

function Stop-Watchdog {
  $f = Get-PidFile 'watchdog'
  if (Test-Path $f) {
    $id = [int] ((Get-Content $f -Raw).Trim())
    $p = Get-Process -Id $id -ErrorAction SilentlyContinue
    if ($null -ne $p -and $p.ProcessName -match '^(powershell|pwsh)$' -and $id -ne $PID) {
      Stop-Process -Id $id -Force
      Write-Ok "watchdog зогсов (PID $id) — дахин: Start-ScheduledTask 'S-Project Pilot'"
    }
    Remove-Item $f -Force -ErrorAction SilentlyContinue
  }
}

function Stop-PilotProcess([string] $name, [string] $procName) {
  $p = Get-PilotProcess $name $procName
  if ($null -ne $p) {
    Stop-Process -Id $p.Id -Force
    Write-Ok "$name зогсов (PID $($p.Id))"
  } else {
    Write-Host "  $name ажиллаагүй"
  }
  Remove-Item (Get-PidFile $name) -Force -ErrorAction SilentlyContinue
}

function Wait-Http([string] $url, [int] $timeoutSec = 60) {
  $deadline = (Get-Date).AddSeconds($timeoutSec)
  while ((Get-Date) -lt $deadline) {
    try {
      $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 5
      if ($r.StatusCode -eq 200) { return $true }
    } catch { }
    Start-Sleep -Milliseconds 700
  }
  return $false
}

function Get-CaddyExe {
  if ($env:PILOT_CADDY) { return $env:PILOT_CADDY }
  $c = Get-Command caddy -ErrorAction SilentlyContinue
  if ($c) { return $c.Source }
  Stop-Pilot2 'caddy олдсонгүй (winget install CaddyServer.Caddy, эсвэл .env PILOT_CADDY=...\caddy.exe)'
}

function Get-7zExe {
  if ($env:PILOT_7Z) { return $env:PILOT_7Z }
  $c = Get-Command 7z -ErrorAction SilentlyContinue
  if ($c) { return $c.Source }
  if ($env:ProgramFiles) {
    $p = Join-Path $env:ProgramFiles '7-Zip\7z.exe'
    if (Test-Path $p) { return $p }
  }
  Stop-Pilot2 '7-Zip олдсонгүй (winget install 7zip.7zip, эсвэл .env PILOT_7Z=...\7z.exe)'
}

function Assert-Built([hashtable] $keys) {
  if (-not (Test-Path (Join-Path (Join-Path (Join-Path $BackendDir 'dist') 'src') 'main.js'))) { Stop-Pilot2 'backend build алга → pilot.ps1 build' }
  if (-not (Test-Path (Join-Path $WebDist 'index.html'))) { Stop-Pilot2 'web build алга → pilot.ps1 build' }
  # Web build-д шингэсэн anon key одоогийн Supabase-тэй таарах ёстой (нууц солигдсон бол дахин build)
  $hit = Get-ChildItem -Path (Join-Path $WebDist 'assets') -Filter '*.js' | Select-String -SimpleMatch -Pattern $keys['ANON_KEY'] -List | Select-Object -First 1
  if ($null -eq $hit) { Stop-Pilot2 'web build-ийн anon key одоогийн Supabase-тэй таарахгүй (JWT нууц солигдсон?) → pilot.ps1 build' }
}

function Start-Backend([hashtable] $cfg) {
  $p = Get-PilotProcess 'backend' 'node'
  if ($null -ne $p) { Write-Ok "backend ажиллаж байна (PID $($p.Id))"; return }
  $port = Get-Cfg $cfg 'PORT' $Prof.Port
  # backend STORAGE_DIR-ийг уншина; backup/restore-ийн хавтастай ЯГ ИЖИЛ байх ёстой
  $env:STORAGE_DIR = Get-StorageDir $cfg
  $p = Start-PilotProcess 'backend' 'node' @('dist/src/main.js') $BackendDir
  if (-not (Wait-Http "http://127.0.0.1:$port/api/v1/health" 90)) {
    Stop-Pilot2 "backend эхэлсэнгүй — $(Join-Path $LogDir 'backend.err.log'), backend.log-ийг үз"
  }
  Write-Ok "backend (PID $($p.Id), 127.0.0.1:$port)"
  Write-Log 'pilot.log' "backend started pid=$($p.Id)"
}

function Start-Caddy([hashtable] $cfg) {
  $p = Get-PilotProcess 'caddy' 'caddy'
  if ($null -ne $p) { Write-Ok "Caddy ажиллаж байна (PID $($p.Id))"; return }
  $env:PILOT_WEB_ROOT = $WebDist
  $env:PILOT_API_PORT = Get-Cfg $cfg 'PORT' $Prof.Port
  $env:PILOT_SUPABASE_PORT = [string] $SupabaseApiPort
  $env:PILOT_HTTP_PORT = Get-Cfg $cfg 'PILOT_HTTP_PORT' $Prof.HttpPort
  $env:PILOT_LOG_DIR = $LogDir
  $caddyfile = Join-Path $ScriptDir 'Caddyfile'
  $p = Start-PilotProcess 'caddy' (Get-CaddyExe) @('run', '--config', $caddyfile, '--adapter', 'caddyfile') $PilotDir
  if (-not (Wait-Http "http://127.0.0.1:$($env:PILOT_HTTP_PORT)/api/v1/health" 30)) {
    Stop-Pilot2 "Caddy эхэлсэнгүй — $(Join-Path $LogDir 'caddy.err.log')-ийг үз"
  }
  Write-Ok "Caddy (PID $($p.Id), http://127.0.0.1:$($env:PILOT_HTTP_PORT) → Funnel)"
  Write-Log 'pilot.log' "caddy started pid=$($p.Id)"
}

function Start-Pilot([int] $DockerTimeoutSec = 300) {
  $cfg = Import-PilotEnv
  Assert-PilotEnv $cfg
  Write-Step 'Docker'
  Wait-Docker $DockerTimeoutSec
  Start-PilotRedis
  $keys = Start-PilotSupabase $cfg
  Assert-Built $keys
  Write-Step 'Backend + Caddy'
  Start-Backend $cfg
  Start-Caddy $cfg
  return $cfg
}

# ── Нөөцлөлт ─────────────────────────────────────────────────
$BackupAuthTables = @('auth.users', 'auth.identities')

# PIL-05: нөөцийг 2 дахь хавтас руу (OneDrive/USB). Хуулбарын алдаа үндсэн нөөцийг эвдэхгүй — $false буцаана.
function Copy-BackupToSecondary([hashtable] $cfg, [string] $archive, [string] $pattern, [int] $keep) {
  $copyDir = Get-Cfg $cfg 'PILOT_BACKUP_COPY_DIR'
  if (-not $copyDir) { return $true }
  try {
    $src = (Resolve-Path -LiteralPath (Split-Path -Parent $archive)).Path.TrimEnd('\', '/')
    New-Item -ItemType Directory -Force -Path $copyDir | Out-Null
    $dst = (Resolve-Path -LiteralPath $copyDir).Path.TrimEnd('\', '/')
    if ($src -ieq $dst) { throw 'PILOT_BACKUP_COPY_DIR = PILOT_BACKUP_DIR (өөр хавтас/диск заана)' }
    $dest = Join-Path $dst (Split-Path -Leaf $archive)
    Copy-Item -LiteralPath $archive -Destination $dest -Force
    $h1 = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash
    $h2 = (Get-FileHash -LiteralPath $dest -Algorithm SHA256).Hash
    if ($h1 -ne $h2) { throw "хуулбарын SHA256 таарахгүй ($dest)" }
    Write-Ok "хуулбар: $dest"
    Write-Log 'backup.log' "COPY OK $dest"
    $old = Get-ChildItem -Path $dst -Filter $pattern | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$keep) }
    foreach ($f in $old) { Remove-Item $f.FullName -Force; Write-Host "  хуучин хуулбар устгав: $($f.Name)" }
    return $true
  } catch {
    Write-Warn2 "Нөөцийн хуулбар амжилтгүй (үндсэн нөөц хэвээр): $($_.Exception.Message)"
    Write-Log 'backup.log' "COPY FAIL $($_.Exception.Message)"
    return $false
  }
}

function Get-StorageDir([hashtable] $cfg) {
  $d = Get-Cfg $cfg 'PILOT_STORAGE_DIR'
  if ($d) { return $d }
  return (Join-Path $Root 'storage')
}

function Get-DbAdminPassword([hashtable] $cfg) {
  return (Get-Cfg $cfg 'PILOT_DB_ADMIN_PASSWORD' 'postgres')
}

# Junction-ийг (target-г БИШ) устгана — Remove-Item -Recurse PS 5.1 дээр junction-ийн дотрох файлыг устгадаг тул
function Remove-StorageLink([string] $link) {
  if (Test-Path -LiteralPath $link) { [System.IO.Directory]::Delete($link) }
}

function Invoke-Backup {
  $cfg = Import-PilotEnv
  Assert-PilotEnv $cfg -NeedBackup
  $sevenZip = Get-7zExe
  $slug = $cfg['DEDICATED_TENANT_SLUG']
  $dir = $cfg['PILOT_BACKUP_DIR']
  $keep = [int] (Get-Cfg $cfg 'PILOT_BACKUP_KEEP_DAYS' '14')
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $tmp = Join-Path $RunDir "backup-$stamp"
  New-Item -ItemType Directory -Force -Path $tmp | Out-Null
  try {
    Write-Step "Нөөцлөлт ($slug, $stamp)"
    $pgEnv = @('exec', '-e', "PGPASSWORD=$(Get-DbAdminPassword $cfg)", $DbContainer)
    $pgConn = @('-h', '127.0.0.1', '-U', 'supabase_admin', '-d', 'postgres')
    # Зөвхөн ӨГӨГДӨЛ: schema нь кодын migration-оос (ижил хувилбар) — сэргээхэд migration жагсаалтыг тулгана
    Invoke-Native 'docker' ($pgEnv + @('pg_dump') + $pgConn + @('-Fc', '--data-only', '--schema=public', '-f', '/tmp/pilot-public.dump')) | Out-Null
    $authArgs = @()
    foreach ($t in $BackupAuthTables) { $authArgs += @('-t', $t) }
    Invoke-Native 'docker' ($pgEnv + @('pg_dump') + $pgConn + @('-Fc', '--data-only') + $authArgs + @('-f', '/tmp/pilot-auth.dump')) | Out-Null
    Invoke-Native 'docker' @('cp', "${DbContainer}:/tmp/pilot-public.dump", (Join-Path $tmp 'public.dump')) | Out-Null
    Invoke-Native 'docker' @('cp', "${DbContainer}:/tmp/pilot-auth.dump", (Join-Path $tmp 'auth.dump')) | Out-Null
    Invoke-Native 'docker' @('exec', $DbContainer, 'rm', '-f', '/tmp/pilot-public.dump', '/tmp/pilot-auth.dump') | Out-Null

    $mig = Invoke-DbSql 'SELECT version FROM supabase_migrations.schema_migrations ORDER BY version' -Capture
    $versions = @($mig.Out | Where-Object { "$_".Trim() -ne '' } | ForEach-Object { "$_".Trim() })
    Set-Content -Path (Join-Path $tmp 'migrations.txt') -Value $versions -Encoding ASCII
    $counts = Invoke-DbSql "SELECT (SELECT count(*) FROM public.tenants) || ' ' || (SELECT count(*) FROM public.core_users) || ' ' || (SELECT count(*) FROM auth.users)" -Capture
    $c = ((@($counts.Out) -join '').Trim()).Split(' ')
    $pkg = Get-Content (Join-Path $Root 'package.json') -Raw | ConvertFrom-Json
    $manifest = [ordered]@{
      app = 's-project'; version = $pkg.version; slug = $slug; createdAt = (Get-Date).ToString('o')
      migrations = $versions.Count; tenants = [int]$c[0]; coreUsers = [int]$c[1]; authUsers = [int]$c[2]
      format = 'pg_dump -Fc --data-only (public, auth.users, auth.identities)'
    }
    ($manifest | ConvertTo-Json) | Set-Content -Path (Join-Path $tmp 'manifest.json') -Encoding UTF8

    # Feed-ийн зураг: junction-оор tmp\storage болгож 7z-д нэмнэ (хуулбар үүсгэхгүй); хавтас байхгүй бол алгасна
    $storageDir = Get-StorageDir $cfg
    $storageLink = Join-Path $tmp 'storage'
    if (Test-Path -LiteralPath $storageDir -PathType Container) {
      New-Item -ItemType Junction -Path $storageLink -Target $storageDir | Out-Null
      $manifest['storage'] = $true
      ($manifest | ConvertTo-Json) | Set-Content -Path (Join-Path $tmp 'manifest.json') -Encoding UTF8
    } else {
      Write-Host "  storage хавтас алга ($storageDir) — алгасав"
    }

    $archive = Join-Path $dir "$($Prof.BackupPrefix)$slug-$stamp.7z"
    # -mhe=on: файлын нэрийг ч шифрлэнэ (AES-256)
    Invoke-Native $sevenZip @('a', '-t7z', '-mhe=on', '-mx=5', "-p$($cfg['PILOT_BACKUP_PASSWORD'])", $archive, (Join-Path $tmp '*')) -Quiet | Out-Null
    Invoke-Native $sevenZip @('t', "-p$($cfg['PILOT_BACKUP_PASSWORD'])", $archive) -Quiet | Out-Null
    $size = [math]::Round((Get-Item $archive).Length / 1KB, 1)
    Write-Ok "$archive ($size KB; tenants $($c[0]), хэрэглэгч $($c[1]), migration $($versions.Count))"
    Write-Log 'backup.log' "OK $archive ${size}KB tenants=$($c[0]) users=$($c[1])"

    $pattern = "$($Prof.BackupPrefix)$slug-*.7z"
    $old = Get-ChildItem -Path $dir -Filter $pattern | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$keep) }
    foreach ($f in $old) { Remove-Item $f.FullName -Force; Write-Host "  хуучин нөөц устгав: $($f.Name)" }
    $copied = Copy-BackupToSecondary $cfg $archive $pattern $keep
    if ($copied) { $null = Send-HealthPing $cfg 'backup' -Message "OK $(Split-Path -Leaf $archive) ${size}KB" }
    else { $null = Send-HealthPing $cfg 'backup' -Fail -Message "backup OK, copy FAIL ($(Split-Path -Leaf $archive))" }
    return $archive
  } catch {
    Write-Log 'backup.log' "FAIL $($_.Exception.Message)"
    $null = Send-HealthPing $cfg 'backup' -Fail -Message "backup FAIL: $($_.Exception.Message)"
    throw
  } finally {
    Remove-StorageLink (Join-Path $tmp 'storage')
    Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
  }
}

function Invoke-Restore([string] $file) {
  if (-not $file -or -not (Test-Path $file)) { Stop-Pilot2 'Хэрэглээ: pilot.ps1 restore <нөөц.7z>' }
  $file = (Resolve-Path $file).Path
  $cfg = Import-PilotEnv
  Assert-PilotEnv $cfg -NeedBackup
  $sevenZip = Get-7zExe
  $slug = $cfg['DEDICATED_TENANT_SLUG']
  $tmp = Join-Path $RunDir ("restore-" + (Get-Date -Format 'yyyyMMdd-HHmmss'))
  New-Item -ItemType Directory -Force -Path $tmp | Out-Null
  try {
    Write-Step "Нөөц задлах: $file"
    Invoke-Native $sevenZip @('x', "-p$($cfg['PILOT_BACKUP_PASSWORD'])", "-o$tmp", '-y', $file) -Quiet | Out-Null
    foreach ($n in 'public.dump', 'auth.dump', 'migrations.txt', 'manifest.json') {
      if (-not (Test-Path (Join-Path $tmp $n))) { Stop-Pilot2 "нөөцөд $n алга" }
    }
    $manifest = Get-Content (Join-Path $tmp 'manifest.json') -Raw | ConvertFrom-Json
    if ($manifest.slug -ne $slug) { Stop-Pilot2 "нөөц өөр байгууллагынх ($($manifest.slug)) — .env: $slug" }

    # Schema (migration) ижил байх ёстой — ӨГӨГДЛИЙГ УСТГАХААС ӨМНӨ шалгана
    Sync-Migrations
    $files = @(Get-ChildItem -Path (Join-Path (Join-Path $PilotDir 'supabase') 'migrations') -Filter '*.sql' |
      ForEach-Object { ($_.Name -split '_')[0] } | Sort-Object)
    $backupVersions = @(Get-Content (Join-Path $tmp 'migrations.txt') | Where-Object { $_.Trim() -ne '' } | ForEach-Object { $_.Trim() } | Sort-Object)
    if (($files -join ',') -ne ($backupVersions -join ',')) {
      Stop-Pilot2 "migration зөрүүтэй: нөөц $($backupVersions.Count), код $($files.Count). Нөөцийг үүсгэсэн хувилбарын кодыг (git tag) checkout хийж сэргээнэ"
    }
    Write-Ok "нөөц: $($manifest.createdAt), хувилбар $($manifest.version), tenants $($manifest.tenants), хэрэглэгч $($manifest.coreUsers)"

    if (-not $Yes) {
      Write-Host ''
      Write-Host "  АНХААР: пилотын ОДООГИЙН бүх өгөгдөл устаж, нөөцийнхөөр солигдоно." -ForegroundColor Red
      $answer = Read-Host "  Үргэлжлүүлэх бол байгууллагын slug-ийг ($slug) бичнэ үү"
      if ($answer -ne $slug) { Stop-Pilot2 'цуцлав' }
    }

    Write-Step 'Апп зогсоож, DB-г migration-оос шинээр үүсгэнэ'
    $suspended = Suspend-PilotTask
    Stop-Watchdog
    Stop-PilotProcess 'caddy' 'caddy'
    Stop-PilotProcess 'backend' 'node'
    Wait-Docker
    Start-PilotRedis
    Start-PilotSupabase $cfg -AllowPendingConfigChange | Out-Null
    Invoke-Supabase -Arguments @('db', 'reset', '--local', '--no-seed', '--yes') | Out-Null

    Write-Step 'Өгөгдөл сэргээх'
    Invoke-Native 'docker' @('cp', (Join-Path $tmp 'public.dump'), "${DbContainer}:/tmp/pilot-public.dump") | Out-Null
    Invoke-Native 'docker' @('cp', (Join-Path $tmp 'auth.dump'), "${DbContainer}:/tmp/pilot-auth.dump") | Out-Null
    # migration-ийн seed (0003 tenant-ууд, кемпийн анхдагч роль г.м.) + auth.users-ийг цэвэрлээд нөөцийнхийг хийнэ
    $truncate = "DO `$`$ BEGIN EXECUTE (SELECT 'TRUNCATE TABLE ' || string_agg(format('%I.%I', schemaname, tablename), ', ') || ' RESTART IDENTITY CASCADE' FROM pg_tables WHERE schemaname = 'public'); TRUNCATE auth.users CASCADE; END `$`$"
    Invoke-DbSql $truncate | Out-Null
    $pgEnv = @('exec', '-e', "PGPASSWORD=$(Get-DbAdminPassword $cfg)", $DbContainer)
    $pgConn = @('-h', '127.0.0.1', '-U', 'supabase_admin', '-d', 'postgres')
    foreach ($d in 'auth', 'public') {
      Invoke-Native 'docker' ($pgEnv + @('pg_restore') + $pgConn + @('--data-only', '--disable-triggers', '--single-transaction', '--exit-on-error', "/tmp/pilot-$d.dump")) | Out-Null
    }
    Invoke-Native 'docker' @('exec', $DbContainer, 'rm', '-f', '/tmp/pilot-public.dump', '/tmp/pilot-auth.dump') | Out-Null
    Set-AppUserPassword $cfg
    $counts = Invoke-DbSql "SELECT (SELECT count(*) FROM public.tenants) || ' ' || (SELECT count(*) FROM public.core_users) || ' ' || (SELECT count(*) FROM auth.users)" -Capture
    $c = ((@($counts.Out) -join '').Trim()).Split(' ')
    if ([int]$c[0] -ne [int]$manifest.tenants -or [int]$c[1] -ne [int]$manifest.coreUsers -or [int]$c[2] -ne [int]$manifest.authUsers) {
      Stop-Pilot2 "тоо зөрүүтэй: DB $($c -join '/'), нөөц $($manifest.tenants)/$($manifest.coreUsers)/$($manifest.authUsers)"
    }
    Write-Ok "сэргээв: tenants $($c[0]), хэрэглэгч $($c[1]), auth $($c[2])"
    $restoredStorage = Join-Path $tmp 'storage'
    if (Test-Path -LiteralPath $restoredStorage -PathType Container) {
      $storageDir = Get-StorageDir $cfg
      New-Item -ItemType Directory -Force -Path $storageDir | Out-Null
      # /MIR: DB-тэй нийцүүлж одоогийн зургийг нөөцийнхөөр солино (>=8 = алдаа)
      & robocopy $restoredStorage $storageDir /MIR /R:2 /W:2 /NFL /NDL /NJH /NJS /NP | Out-Null
      if ($LASTEXITCODE -ge 8) { Stop-Pilot2 "storage сэргээж чадсангүй (robocopy $LASTEXITCODE): $storageDir" }
      Write-Ok "storage сэргээв: $storageDir"
    } else {
      Write-Warn2 'нөөцөд storage (зураг) алга — алгаслаа'
    }
    Invoke-Native 'docker' @('exec', $RedisContainer, 'redis-cli', 'FLUSHALL') -Quiet | Out-Null
    Write-Ok 'Redis cache цэвэрлэв'
    Write-Log 'backup.log' "RESTORE OK $file"
  } finally {
    Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
    # Алдаа гарсан ч Task-ийг идэвхжүүлнэ (эс бөгөөс Start-ScheduledTask "disabled" алдаа өгнө)
    if (Test-Path variable:suspended) { Resume-PilotTask $suspended }
  }
  Start-Pilot | Out-Null
}

# ── Шинэ хувилбар (PIL-11, v0.2.0 §0.3) ─────────────────────
# Энэ скриптийг (ижил профайл, -Root) дэд процессоор дуудна: checkout-ын дараа ШИНЭ хувилбарын pilot.ps1-ийн init/build/start
function Invoke-Self([string] $cmd) {
  $exe = (Get-Process -Id $PID).Path
  $a = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $ScriptDir 'pilot.ps1'), $cmd)
  # Анхдагч үед нэмэлт параметргүй (v0.2.0-оос өмнөх pilot.ps1-д -Profile/-Root алга — буцаах tag-д ч ажиллана)
  if ($Instance -ne 'pilot') { $a += @('-Profile', $Instance) }
  if ($Root -ne $DefaultRoot) { $a += @('-Root', $Root) }
  Write-Step "pilot.ps1 $cmd ($Instance)"
  # PS-003: `& exe | Out-Host` нь stdout-ыг PIPE-аар холбодог. `start`-ийн асаасан backend/Caddy (Start-Process) тэр
  # pipe-ийн handle-ийг удамшуулж авдаг тул дэд процесс дууссан ч pipe хаагдахгүй → upgrade мөнхөд хүлээнэ (Windows).
  # → Process.Start, redirect-гүй (консолыг шууд хуваалцана), зөвхөн тухайн процессыг хүлээнэ.
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $exe
  $psi.Arguments = ($a | ForEach-Object { if ($_ -eq '' -or $_ -match '[\s"]') { '"' + (($_ -replace '"', '\"') -replace '(\\+)$', '$1$1') + '"' } else { $_ } }) -join ' '
  $psi.UseShellExecute = $false
  $psi.WorkingDirectory = (Get-Location).Path
  $p = [System.Diagnostics.Process]::Start($psi)
  $p.WaitForExit()
  if ($p.ExitCode -ne 0) { Stop-Pilot2 "pilot.ps1 $cmd → exit $($p.ExitCode)" }
}

function Get-SelfCommand {
  $c = '.\deploy\pilot\pilot.ps1'
  if ($Root -ne $DefaultRoot) { $c = "& `"$(Join-Path $ScriptDir 'pilot.ps1')`" -Root `"$Root`"" }
  if ($Instance -ne 'pilot') { $c += " -Profile $Instance" }
  return $c
}

# Task Scheduler-ийн 'run' даалгавар (RestartCount 3, 1 мин) watchdog-ийг алсны дараа дахин асааж, шинэчлэл / сэргээлтийн
# дундуур backend-ийг асаахаас сэргийлж түр идэвхгүй болгоно
function Suspend-PilotTask {
  if (-not ($IsWin -and $Prof.Tasks)) { return $false }
  $t = Get-ScheduledTask -TaskName $TaskRun -ErrorAction SilentlyContinue
  if ($null -eq $t) { return $false }
  Stop-ScheduledTask -TaskName $TaskRun -ErrorAction SilentlyContinue
  Disable-ScheduledTask -TaskName $TaskRun | Out-Null
  Write-Ok "Task '$TaskRun' түр идэвхгүй"
  return $true
}

function Resume-PilotTask([bool] $suspended, [switch] $Start) {
  if (-not $suspended) { return }
  Enable-ScheduledTask -TaskName $TaskRun | Out-Null
  if ($Start) { Start-ScheduledTask -TaskName $TaskRun; Write-Ok "Task '$TaskRun' (watchdog) дахин асав" } else { Write-Ok "Task '$TaskRun' идэвхжүүлэв" }
}

function Invoke-Upgrade([string] $tag) {
  if (-not $tag) { Stop-Pilot2 'Хэрэглээ: pilot.ps1 upgrade -Tag v0.2.0' }
  if ($tag -notmatch '^v\d+\.\d+\.\d+(\.\d+)?$') { Stop-Pilot2 "tag буруу: $tag (жнь v0.2.0)" }
  $cfg = Import-PilotEnv
  Assert-PilotEnv $cfg -NeedBackup
  $null = Get-7zExe
  $self = Get-SelfCommand

  Write-Step "Git ($Root)"
  Push-Location $Root
  try {
    # Tracked файлд commit хийгээгүй өөрчлөлт байвал checkout дарж устгах эрсдэлтэй → зогсоно (.env, run/ — gitignored)
    $dirty = @((Invoke-Native 'git' @('status', '--porcelain', '--untracked-files=no') -Capture).Out | Where-Object { "$_".Trim() -ne '' })
    if ($dirty.Count -gt 0) {
      Stop-Pilot2 "git tree бохир ($($dirty.Count) файл: $(($dirty | Select-Object -First 5) -join '; ')) → git status / git diff; өөрчлөлтийг хадгалж (git stash) эсвэл буцаагаад дахин"
    }
    $prev = ((Invoke-Native 'git' @('rev-parse', 'HEAD') -Capture).Out | Select-Object -First 1).Trim()
    $d = Invoke-Native 'git' @('describe', '--tags', '--exact-match', 'HEAD') -Capture -AllowFail
    $prevName = if ($d.Code -eq 0 -and $d.Out) { (@($d.Out)[0]).Trim() } else { $prev.Substring(0, 12) }
    Invoke-Native 'git' @('fetch', '--tags', '--quiet') | Out-Null
    $t = Invoke-Native 'git' @('rev-parse', '--verify', '--quiet', "refs/tags/$tag^{commit}") -Capture -AllowFail
    if ($t.Code -ne 0 -or -not $t.Out) { Stop-Pilot2 "tag $tag олдсонгүй (git tag -l 'v*' — GitHub-д push хийсэн эсэх?)" }
    $target = (@($t.Out)[0]).Trim()
    if ($target -eq $prev) { Write-Ok "аль хэдийн $tag дээр байна ($prevName) — юу ч хийсэнгүй"; return }
  } finally { Pop-Location }
  Write-Ok "$prevName → $tag"
  Write-Log 'upgrade.log' "START $Instance $prevName -> $tag"

  Write-Step 'Нөөц (шинэчлэлийн өмнө)'
  $archive = @(Invoke-Backup)[-1]

  Write-Step 'Зогсоох'
  $suspended = Suspend-PilotTask
  Stop-Watchdog
  Stop-PilotProcess 'caddy' 'caddy'
  Stop-PilotProcess 'backend' 'node'

  $failed = $null
  try {
    Push-Location $Root
    try { Invoke-Native 'git' @('checkout', '--quiet', $tag) | Out-Null } finally { Pop-Location }
    Write-Ok "checkout $tag"
    Invoke-Self 'init'
    Invoke-Self 'build'
    Invoke-Self 'start'
    $port = Get-Cfg $cfg 'PORT' $Prof.Port
    if (-not (Wait-Http "http://127.0.0.1:$port/api/v1/health" 60)) { throw "backend health (127.0.0.1:$port) хариу өгсөнгүй" }
  } catch {
    $failed = $_.Exception.Message
  }

  if ($failed) {
    Resume-PilotTask $suspended
    Write-Log 'upgrade.log' "FAIL $Instance $prevName -> ${tag}: $failed"
    Write-Host ''
    Write-Host "  ШИНЭЧЛЭЛ АМЖИЛТГҮЙ: $failed" -ForegroundColor Red
    Write-Host "  Буцаах (өгөгдөл = шинэчлэлийн өмнөх нөөц; migration буцдаггүй тул restore заавал):" -ForegroundColor Yellow
    Write-Host "    $self stop"
    Write-Host "    git checkout $prevName"
    Write-Host "    $self restore `"$archive`""
    Write-Host "    $self build"
    if ($Prof.Tasks) { Write-Host "    Start-ScheduledTask '$TaskRun'" } else { Write-Host "    $self start" }
    Write-Host "  Лог: $LogDir (backend.err.log, upgrade.log)"
    Stop-Pilot2 "шинэчлэл амжилтгүй ($prevName → $tag)"
  }

  Write-Log 'upgrade.log' "OK $Instance $prevName -> $tag backup=$archive"
  Write-Ok "шинэчлэв: $prevName → $tag (нөөц: $archive)"
  if ($suspended) {
    Resume-PilotTask $suspended -Start
  } elseif ($Prof.Tasks) {
    Write-Warn2 "watchdog ажиллахгүй — Start-ScheduledTask '$TaskRun' (эсвэл $self run)"
  }
}

# ── Windows-ийн тохиргоо ─────────────────────────────────────
function Assert-Windows([switch] $Admin) {
  if (-not $IsWin) { Stop-Pilot2 'Зөвхөн Windows дээр' }
  if ($Admin) {
    $id = [Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()
    if (-not $id.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
      Stop-Pilot2 'PowerShell-ийг "Run as Administrator"-аар нээж ажиллуулна'
    }
  }
}

$FirewallRule = 'S-Project pilot - block inbound dev/pilot ports'
$BlockedPorts = @('3000', '3100', '3200', '5173', '5174', '6379', '8088', '8089', '54320-54329', '55320-55329', '56379', '56520-56529', '56579')

function Test-PilotFirewall {
  if (-not $IsWin -or -not (Get-Command Get-NetFirewallRule -ErrorAction SilentlyContinue) -or
    -not (Get-Command Get-NetFirewallPortFilter -ErrorAction SilentlyContinue)) { return $false }
  $rules = @(Get-NetFirewallRule -DisplayName $FirewallRule -ErrorAction SilentlyContinue)
  foreach ($rule in $rules) {
    if ([string]$rule.Enabled -ne 'True' -or [string]$rule.Direction -ne 'Inbound' -or [string]$rule.Action -ne 'Block') { continue }
    $filters = @(Get-NetFirewallPortFilter -AssociatedNetFirewallRule $rule -ErrorAction SilentlyContinue)
    foreach ($filter in $filters) {
      if ([string]$filter.Protocol -ne 'TCP') { continue }
      $ports = @($filter.LocalPort | ForEach-Object { [string]$_ })
      if ($ports -contains 'Any') { return $true }
      $complete = $true
      foreach ($port in $BlockedPorts) {
        if ($ports -notcontains [string]$port) { $complete = $false; break }
      }
      if ($complete) { return $true }
    }
  }
  return $false
}

function Assert-PilotProfile([string] $what) {
  if (-not $Prof.Tasks) { Stop-Pilot2 "$what зөвхөн pilot профайлд (одоо: $Instance)" }
}

# PIL-07: нэвтрэлтийн түгжээг (auth_guard hook) Caddy-ээр дамжуулж шалгах. Пилотын бодит хэрэглэгчийг түгжихгүйн тулд ЗӨВХӨН staging.
function Get-HttpStatus([string] $url, [string] $body, [hashtable] $headers) {
  try {
    $r = Invoke-WebRequest -Uri $url -Method Post -Body $body -ContentType 'application/json' -Headers $headers -UseBasicParsing -TimeoutSec 15
    return [int] $r.StatusCode
  } catch {
    $resp = $null
    if ($_.Exception.PSObject.Properties['Response']) { $resp = $_.Exception.Response }
    if ($resp) { return [int] $resp.StatusCode }
    return -1
  }
}

function Invoke-AuthTest([string] $email) {
  if ($Instance -ne 'staging') { Stop-Pilot2 'auth-test зөвхөн -Profile staging (пилотын хэрэглэгчийг түгжихгүй)' }
  if ($email -notmatch "^[^'\s;]+@[^'\s;]+$") { Stop-Pilot2 'auth-test <имэйл> — staging-д байгаа туршилтын хэрэглэгчийн имэйл' }
  $cfg = Import-PilotEnv
  $keys = Get-SupabaseKeys
  if ($null -eq $keys) { Stop-Pilot2 'Supabase ажиллахгүй (pilot.ps1 start -Profile staging)' }
  $n = Invoke-DbSql "SELECT count(*) FROM auth.users WHERE lower(email) = lower('$email')" -Capture
  if (((@($n.Out) -join '').Trim()) -ne '1') { Stop-Pilot2 "хэрэглэгч олдсонгүй: $email" }
  $guard = Invoke-DbSql "SELECT count(*) FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace WHERE s.nspname = 'auth_guard' AND p.proname = 'hook_password_verification_attempt'" -Capture
  if (((@($guard.Out) -join '').Trim()) -ne '1') { Stop-Pilot2 'auth_guard функц алга → pilot.ps1 init -Profile staging (migration)' }
  $unlock = "DELETE FROM auth_guard.password_failures f USING auth.users u WHERE u.id = f.user_id AND lower(u.email) = lower('$email')"
  Invoke-DbSql $unlock | Out-Null
  $http = Get-Cfg $cfg 'PILOT_HTTP_PORT' $Prof.HttpPort
  $url = "http://127.0.0.1:$http/auth/v1/token?grant_type=password"
  Write-Step "Нэвтрэлтийн түгжээ: $email → $url (6 буруу нууц үг)"
  $codes = @()
  try {
    for ($i = 1; $i -le 6; $i++) {
      $body = @{ email = $email; password = "wrong-$([guid]::NewGuid().ToString('N'))" } | ConvertTo-Json -Compress
      $codes += Get-HttpStatus $url $body @{ apikey = $keys['ANON_KEY'] }
    }
  } finally {
    Invoke-DbSql $unlock | Out-Null   # туршилтын хэрэглэгчийг түгжээтэй үлдээхгүй
  }
  $got = $codes -join ' '
  if ($got -eq '400 400 400 400 400 429') { Write-Ok "PIL-07 OK: $got (түгжээ тайлагдсан)" }
  else { Stop-Pilot2 "PIL-07: хүлээсэн '400 400 400 400 400 429', ирсэн '$got' (config.toml [auth.hook.password_verification_attempt], migration 20261012006)" }
}

# PIL-07: түгжигдсэн бүртгэлийг шууд тайлах (15 мин хүлээлгүй)
function Invoke-Unlock([string] $email) {
  if ($email -notmatch "^[^'\s;]+@[^'\s;]+$") { Stop-Pilot2 'unlock <имэйл>' }
  $null = Import-PilotEnv
  $r = Invoke-DbSql "WITH d AS (DELETE FROM auth_guard.password_failures f USING auth.users u WHERE u.id = f.user_id AND lower(u.email) = lower('$email') RETURNING 1) SELECT count(*) FROM d" -Capture
  $n = (@($r.Out) -join '').Trim()
  if ($n -eq '1') { Write-Ok "$email — түгжээ/тоолуур тэглэв" } else { Write-Ok "$email — түгжээгүй байна" }
}

function Set-PilotFirewall {
  Assert-Windows -Admin
  Get-NetFirewallRule -DisplayName $FirewallRule -ErrorAction SilentlyContinue | Remove-NetFirewallRule
  New-NetFirewallRule -DisplayName $FirewallRule -Direction Inbound -Action Block -Protocol TCP `
    -LocalPort $BlockedPorts -Profile Any | Out-Null
  Write-Ok "Firewall: гаднаас хаав — TCP $($BlockedPorts -join ', ') (localhost/Funnel нөлөөлөхгүй)"
}

$TaskRun = 'S-Project Pilot'
$TaskBackup = 'S-Project Pilot Backup'

function Install-PilotTasks {
  Assert-Windows
  Assert-PilotProfile 'install-tasks'
  $ps = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
  $script = Join-Path $ScriptDir 'pilot.ps1'
  $user = [Security.Principal.WindowsIdentity]::GetCurrent().Name
  $principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited

  $runAction = New-ScheduledTaskAction -Execute $ps -WorkingDirectory $Root `
    -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$script`" run"
  $runTrigger = New-ScheduledTaskTrigger -AtLogOn -User $user
  $runSettings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew
  Register-ScheduledTask -TaskName $TaskRun -Action $runAction -Trigger $runTrigger -Settings $runSettings `
    -Principal $principal -Description 'S Project Кемп пилот: Redis + Supabase + backend + Caddy (watchdog)' -Force | Out-Null
  Write-Ok "Task '$TaskRun' — нэвтрэхэд асна (pilot.ps1 run)"

  $bkAction = New-ScheduledTaskAction -Execute $ps -WorkingDirectory $Root `
    -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$script`" backup"
  $bkTrigger = New-ScheduledTaskTrigger -Daily -At '02:00'
  $bkSettings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 1) `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew
  Register-ScheduledTask -TaskName $TaskBackup -Action $bkAction -Trigger $bkTrigger -Settings $bkSettings `
    -Principal $principal -Description 'S Project Кемп пилот: шифрлэсэн нөөц (pilot.ps1 backup)' -Force | Out-Null
  Write-Ok "Task '$TaskBackup' — өдөр бүр 02:00 (унтарсан байвал асмагц)"
}

function Uninstall-PilotTasks {
  Assert-Windows
  foreach ($t in $TaskRun, $TaskBackup) {
    if (Get-ScheduledTask -TaskName $t -ErrorAction SilentlyContinue) {
      Unregister-ScheduledTask -TaskName $t -Confirm:$false
      Write-Ok "Task '$t' устгав"
    }
  }
}

# ── Watchdog ─────────────────────────────────────────────────
function Invoke-Watchdog {
  $cfg = Start-Pilot -DockerTimeoutSec 900
  New-Item -ItemType Directory -Force -Path $RunDir | Out-Null
  Set-Content -Path (Get-PidFile 'watchdog') -Value $PID -Encoding ASCII
  Write-Log 'pilot.log' "watchdog started pid=$PID"
  Write-Step 'Watchdog: 30 секунд тутам шалгана (Ctrl+C — зогсоох; процессууд үргэлжилнэ)'
  $port = Get-Cfg $cfg 'PORT' $Prof.Port
  $fails = 0
  # PIL-04: эрүүл үед PILOT_HEALTHCHECK_INTERVAL_SEC (анхдагч 300) тутам ping; асуудал гарвал шууд /fail (дахин давтахдаа мөн интервалаар)
  $pingEvery = [int] (Get-Cfg $cfg 'PILOT_HEALTHCHECK_INTERVAL_SEC' '300')
  $lastPing = [datetime]::MinValue
  $lastDiskCheck = [datetime]::MinValue
  $storageDbOverLimit = $false
  $lastOk = $null
  while ($true) {
    Start-Sleep -Seconds 30
    $problem = ''
    try {
      if ($null -eq (Get-PilotProcess 'backend' 'node')) {
        Write-Log 'pilot.log' 'backend down → restart'
        $problem = 'backend down → restart'
        Start-Backend $cfg
      } elseif (-not (Wait-Http "http://127.0.0.1:$port/api/v1/health" 10)) {
        $fails++
        if ($fails -ge 2) { $problem = "backend health fail #$fails" }   # нэг удаагийн саатлаар /fail илгээхгүй
        Write-Log 'pilot.log' "backend health fail #$fails"
        if ($fails -ge 3) {
          Write-Log 'pilot.log' 'backend unhealthy x3 → restart'
          Stop-PilotProcess 'backend' 'node'
          Start-Backend $cfg
          $fails = 0
        }
      } else { $fails = 0 }
      if ($null -eq (Get-PilotProcess 'caddy' 'caddy')) {
        Write-Log 'pilot.log' 'caddy down → restart'
        $problem = (@($problem, 'caddy down → restart') | Where-Object { $_ }) -join '; '
        Start-Caddy $cfg
      }
      if (((Get-Date) - $lastDiskCheck).TotalSeconds -ge $pingEvery) {
        $storageDbOverLimit = Show-StorageStatus $cfg
        $lastDiskCheck = Get-Date
      }
      if ($storageDbOverLimit -eq $true) {
        $problem = (@($problem, 'PostgreSQL + storage хэмжээ босго давсан') | Where-Object { $_ }) -join '; '
      } elseif ($null -eq $storageDbOverLimit) {
        $problem = (@($problem, 'PostgreSQL + storage хэмжээ шалгаж чадсангүй') | Where-Object { $_ }) -join '; '
      }
    } catch {
      Write-Log 'pilot.log' "watchdog error: $($_.Exception.Message)"
      $problem = "watchdog error: $($_.Exception.Message)"
    }
    $ok = ($problem -eq '')
    if (($ok -ne $lastOk) -or (((Get-Date) - $lastPing).TotalSeconds -ge $pingEvery)) {
      if ($ok) { $sent = Send-HealthPing $cfg 'main' -Message 'watchdog OK' } else { $sent = Send-HealthPing $cfg 'main' -Fail -Message $problem }
      if ($sent) { $lastPing = Get-Date; $lastOk = $ok }
    }
  }
}

function Show-StorageStatus([hashtable] $cfg) {
  $dir = Get-StorageDir $cfg
  $probe = $dir
  $storageBytes = 0L
  $storageSizeKnown = $true
  if (Test-Path -LiteralPath $dir -PathType Container) {
    try {
      $files = @(Get-ChildItem -LiteralPath $dir -Recurse -File -ErrorAction Stop)
      $bytes = ($files | Measure-Object -Property Length -Sum).Sum
      if (-not $bytes) { $bytes = 0 }
      $storageBytes = [int64]$bytes
      Write-Ok ("storage: {0} MB, {1} файл ({2})" -f [math]::Round($bytes / 1MB, 1), $files.Count, $dir)
    } catch {
      $storageSizeKnown = $false
      Write-Warn2 "storage хэмжээ шалгаж чадсангүй: $($_.Exception.Message)"
      Write-Log 'pilot.log' "WARN storage size check failed: $($_.Exception.Message)"
    }
  } else {
    Write-Host "  storage хавтас алга ($dir)"
    $probe = Split-Path -Parent $dir
  }
  $dbBytes = $null
  try {
    $dbSize = Invoke-DbSql "SELECT pg_database_size('postgres')" -Capture
    $dbBytes = [int64]((@($dbSize.Out) -join '').Trim())
    if ($storageSizeKnown) {
      $totalGb = ($storageBytes + $dbBytes) / 1GB
      $thresholdGb = [double](Get-Cfg $cfg 'PILOT_STORAGE_DB_WARN_GB' '10')
      $usage = "PostgreSQL + storage: {0} GB (анхааруулах босго {1} GB)" -f [math]::Round($totalGb, 2), $thresholdGb
      if ($totalGb -gt $thresholdGb) {
        Write-Warn2 "$usage — өсөлтийг шалгаж, нөөц/дискний багтаамжийг нэмнэ"
        Write-Log 'pilot.log' "WARN storage_db_gb=$([math]::Round($totalGb, 2)) threshold_gb=$thresholdGb"
      } else {
        Write-Ok $usage
      }
    } else {
      Write-Warn2 'PostgreSQL + storage нийлбэр хэмжээг тооцож чадсангүй'
    }
  } catch {
    Write-Warn2 "PostgreSQL + storage хэмжээ шалгаж чадсангүй: $($_.Exception.Message)"
    Write-Log 'pilot.log' "WARN PostgreSQL + storage size check failed: $($_.Exception.Message)"
  }
  # Хавтас байхгүй бол хамгийн ойрын байгаа эцэг хавтасны дискийг шалгана
  while ($probe -and -not (Test-Path -LiteralPath $probe)) { $probe = Split-Path -Parent $probe }
  $root = if ($probe) { [System.IO.Path]::GetPathRoot((Resolve-Path -LiteralPath $probe).Path) } else { $null }
  if ($root -and $root -match '^[A-Za-z]:\\') {
    try {
      $disk = Get-CimInstance -ClassName Win32_LogicalDisk -Filter "DeviceID='$($root.Substring(0, 2))'" -ErrorAction Stop
      if ($disk -and $disk.Size -gt 0) {
        $freeGb = [math]::Round($disk.FreeSpace / 1GB, 1)
        $pct = [math]::Round(100 * $disk.FreeSpace / $disk.Size, 1)
        $msg = "диск $($root.Substring(0, 2)) сул зай: $freeGb GB ($pct%)"
        if ($disk.FreeSpace -lt 10GB -or $pct -lt 10) { Write-Warn2 "$msg — дутаж байна (< 10 GB эсвэл < 10%)" } else { Write-Ok $msg }
      } else {
        Write-Warn2 "дискний багтаамж шалгаж чадсангүй ($root)"
        Write-Log 'pilot.log' "WARN disk capacity unavailable ($root)"
      }
    } catch {
      Write-Warn2 "дискний сул зай шалгаж чадсангүй ($root): $($_.Exception.Message)"
      Write-Log 'pilot.log' "WARN disk space check failed ($root): $($_.Exception.Message)"
    }
  }
  if ($null -eq $dbBytes -or -not $storageSizeKnown) { return $null }
  return (($storageBytes + $dbBytes) / 1GB) -gt [double](Get-Cfg $cfg 'PILOT_STORAGE_DB_WARN_GB' '10')
}

function Show-Status {
  $cfg = Import-PilotEnv
  Write-Ok "профайл: $Instance ($ProjectId) · код: $Root"
  $networkBinding = Get-SupabaseNetworkHostBinding
  if ($networkBinding -eq '127.0.0.1') { Write-Ok "Supabase Docker network: 127.0.0.1 ($($Prof.NetworkId))" }
  else { Write-Warn2 "Supabase Docker network loopback биш/алга ($($Prof.NetworkId), host binding='$networkBinding') — pilot.ps1 init шалгана" }
  Show-SupabasePortBindings
  if ($IsWin) {
    if (Test-PilotFirewall) { Write-Ok 'Windows Firewall: inbound блоклох дүрэм идэвхтэй' }
    else { Write-Warn2 "Windows Firewall дүрэм алга/идэвхгүй — pilot.ps1 firewall (Админ PowerShell)" }
  }
  $port = Get-Cfg $cfg 'PORT' $Prof.Port
  $http = Get-Cfg $cfg 'PILOT_HTTP_PORT' $Prof.HttpPort
  foreach ($n in @(@('backend', 'node'), @('caddy', 'caddy'))) {
    $p = Get-PilotProcess $n[0] $n[1]
    if ($p) { Write-Ok "$($n[0]) PID $($p.Id)" } else { Write-Warn2 "$($n[0]) ажиллахгүй" }
  }
  $healthy = Wait-Http "http://127.0.0.1:$port/api/v1/health" 3
  if ($healthy) { Write-Ok "backend health (127.0.0.1:$port)" } else { Write-Warn2 'backend health алга' }
  if (Wait-Http "http://127.0.0.1:$http/api/v1/health" 3) { Write-Ok "gateway health (127.0.0.1:$http)" } else { Write-Warn2 'gateway (Caddy) health алга' }
  Invoke-Native 'docker' @('ps', '--filter', "name=$ProjectId", '--format', '{{.Names}}  {{.Status}}') -AllowFail | Out-Null
  if (Get-Command tailscale -ErrorAction SilentlyContinue) {
    Write-Step 'Tailscale Funnel'
    $funnel = Invoke-Native 'tailscale' @('funnel', 'status') -Capture -AllowFail
    $funnelText = (@($funnel.Out) -join "`n")
    if ($funnel.Code -ne 0) { Write-Warn2 'Tailscale Funnel төлөвийг шалгаж чадсангүй' }
    elseif ($funnelText -match '(?i)\bFunnel on\b') { Write-Warn2 'Tailscale Funnel асаалттай — `tailscale funnel reset` ажиллуулна' }
    else { Write-Ok 'Tailscale Funnel унтраалттай' }
  } else { Write-Warn2 'Tailscale CLI олдсонгүй — Funnel унтраалттайг баталж чадсангүй' }
  # v0.2.2 D-14 (ADR-005): Cloudflare Tunnel — cloudflared Windows service (05_Cloudflare_Tunnel.md)
  $cf = if (Get-Command Get-Service -ErrorAction SilentlyContinue) { Get-Service -Name 'cloudflared' -ErrorAction SilentlyContinue } else { $null }
  if ($cf) {
    if ($cf.Status -eq 'Running') { Write-Ok 'Cloudflare Tunnel (cloudflared service) ажиллаж байна' } else { Write-Warn2 "Cloudflare Tunnel (cloudflared service): $($cf.Status)" }
  }
  $pub = Get-Cfg $cfg 'PUBLIC_APP_URL'
  if ($pub) { Write-Ok "нийтийн хаяг (PUBLIC_APP_URL): $pub" }
  $storageDbOverLimit = Show-StorageStatus $cfg
  $bdir = Get-Cfg $cfg 'PILOT_BACKUP_DIR'
  if ($bdir -and (Test-Path $bdir)) {
    $last = Get-ChildItem -Path $bdir -Filter '*.7z' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($last) { Write-Ok "сүүлийн нөөц: $($last.Name) ($($last.LastWriteTime))" } else { Write-Warn2 'нөөц алга' }
  }
  $cdir = Get-Cfg $cfg 'PILOT_BACKUP_COPY_DIR'
  if ($cdir) {
    $lastCopy = if (Test-Path $cdir) { Get-ChildItem -Path $cdir -Filter '*.7z' | Sort-Object LastWriteTime -Descending | Select-Object -First 1 } else { $null }
    if ($lastCopy) { Write-Ok "сүүлийн хуулбар: $($lastCopy.Name) ($($lastCopy.LastWriteTime))" } else { Write-Warn2 "хуулбар алга ($cdir)" }
  }
  if (Get-Cfg $cfg 'PILOT_HEALTHCHECK_URL') {
    if (-not $healthy) { $sent = Send-HealthPing $cfg 'main' -Fail -Message 'status: backend health алга' }
    elseif ($storageDbOverLimit -eq $true) { $sent = Send-HealthPing $cfg 'main' -Fail -Message 'status: PostgreSQL + storage хэмжээ босго давсан' }
    elseif ($null -eq $storageDbOverLimit) { $sent = Send-HealthPing $cfg 'main' -Fail -Message 'status: PostgreSQL + storage хэмжээ шалгаж чадсангүй' }
    else { $sent = Send-HealthPing $cfg 'main' -Message 'status OK' }
    if ($sent) { Write-Ok 'healthcheck ping илгээв' } else { Write-Warn2 'healthcheck ping амжилтгүй (logs\pilot.log)' }
  }
}

function Invoke-Check {
  # .env-ийг эхэлж уншина (PILOT_CADDY / PILOT_7Z тэнд байж болно)
  $cfg = Import-PilotEnv
  Write-Step 'Програмууд'
  foreach ($t in @(@('node', '--version'), @('pnpm', '--version'), @('docker', '--version'))) {
    $c = Get-Command $t[0] -ErrorAction SilentlyContinue
    if ($c) { $v = Invoke-Native $t[0] @($t[1]) -Capture -AllowFail; Write-Ok "$($t[0]) $((@($v.Out) -join ' ').Trim())" } else { Write-Host "  [X]  $($t[0]) алга" -ForegroundColor Red }
  }
  try { $null = Get-CaddyExe; Write-Ok 'caddy' } catch { Write-Host "  [X]  $($_.Exception.Message)" -ForegroundColor Red }
  try { $null = Get-7zExe; Write-Ok '7-Zip' } catch { Write-Warn2 $_.Exception.Message }
  if (Get-Command tailscale -ErrorAction SilentlyContinue) { Write-Ok 'tailscale' } else { Write-Warn2 'tailscale алга (интернэтэд нээхэд хэрэгтэй)' }
  Write-Step '.env'
  $errors = Test-PilotEnv $cfg
  if ($errors.Count -eq 0) { Write-Ok '.env зөв' } else {
    foreach ($e in $errors) { Write-Host "  [X]  $e" -ForegroundColor Red }
    Stop-Pilot2 ".env-д $($errors.Count) алдаа"
  }
}

# Шинэ clone-д node_modules алга → Supabase CLI (devDependency) ч алга (PROC-009)
function Test-NodeDeps {
  $bin = Join-Path (Join-Path $Root 'node_modules') '.bin'
  return (Test-Path (Join-Path $bin 'supabase.cmd')) -or (Test-Path (Join-Path $bin 'supabase'))
}

function Install-NodeDeps {
  Write-Step 'pnpm install'
  # NODE_ENV=production (.env) үед pnpm devDependency-г (Supabase CLI, TypeScript, Vite…) алгасдаг/устгадаг (PROC-010)
  $prevNodeEnv = $env:NODE_ENV
  Remove-Item env:NODE_ENV -ErrorAction SilentlyContinue
  Push-Location $Root
  try { Invoke-Native 'pnpm' @('install', '--frozen-lockfile') | Out-Null } finally {
    Pop-Location
    if ($prevNodeEnv) { $env:NODE_ENV = $prevNodeEnv }
  }
}

function Invoke-Init {
  $cfg = Import-PilotEnv
  Assert-PilotEnv $cfg
  if (-not (Test-NodeDeps)) { Install-NodeDeps }
  Sync-Migrations
  Wait-Docker
  Start-PilotRedis
  Start-PilotSupabase $cfg -AllowPendingConfigChange | Out-Null
  Write-Step 'Migration (шинэ байвал)'
  Invoke-Supabase -Arguments @('migration', 'up', '--local') | Out-Null
  # Migration-ы ДАРАА (hook-ийн функц бэлэн болсны дараа) шинэ config.toml-оор дахин асаана. Өгөгдөл хадгалагдана (--no-backup БИШ).
  # Тэмдэг алга (v0.2.1-ээс өмнөх суулгалт) бол нэг удаа дахин асаана.
  if (Test-SupabaseConfigChanged) {
    Write-Step 'Supabase config.toml өөрчлөгдсөн → дахин асаана (өгөгдөл хадгалагдана, ~1-2 мин)'
    Invoke-Supabase -Arguments @('stop') | Out-Null
    Start-PilotSupabase $cfg | Out-Null
  }
  Set-AppUserPassword $cfg
  Write-Ok 'init дууслаа → pilot.ps1 build'
}

function Invoke-Build {
  $cfg = Import-PilotEnv
  Assert-PilotEnv $cfg
  $keys = Get-SupabaseKeys
  if ($null -eq $keys) { Stop-Pilot2 'Supabase ажиллахгүй (pilot.ps1 init эсвэл start)' }
  Assert-KeysSecure $keys $cfg['SUPABASE_AUTH_JWT_SECRET']
  Push-Location $Root
  try {
    Install-NodeDeps
    Write-Step 'Prisma client'
    Invoke-Native 'pnpm' @('db:generate') | Out-Null
    Write-Step 'Backend build'
    Invoke-Native 'pnpm' @('--filter', '@s-project/core-kernel', 'build') | Out-Null
    Write-Step "Web build (VITE_MODULES=$(Get-Cfg $cfg 'PILOT_MODULES' 'camp'))"
    $env:VITE_MODULES = Get-Cfg $cfg 'PILOT_MODULES' 'camp'
    $env:VITE_SUPABASE_URL = 'same-origin'
    $env:VITE_SUPABASE_ANON_KEY = $keys['ANON_KEY']
    $env:VITE_API_BASE_URL = ''
    Invoke-Native 'pnpm' @('--filter', '@s-project/web-shell', 'build') | Out-Null
  } finally { Pop-Location }
  Assert-Built $keys
  Write-Ok 'build дууслаа → pilot.ps1 stop; pilot.ps1 start (эсвэл Task дахин асаах)'
}

function Invoke-AdminCli([string] $sub) {
  $cfg = Import-PilotEnv
  Assert-PilotEnv $cfg
  $keys = Get-SupabaseKeys
  if ($null -eq $keys) { Stop-Pilot2 'Supabase ажиллахгүй (pilot.ps1 start)' }
  Assert-KeysSecure $keys $cfg['SUPABASE_AUTH_JWT_SECRET']
  Set-KeysEnv $keys
  $cliArgs = @()
  if ($Rest) { $cliArgs = $Rest }
  # node-ийг шууд (pnpm.cmd → cmd.exe давхаргагүй: кирилл нэр, '=' тэмдэгт алдагдахгүй)
  $tsx = Join-Path (Join-Path (Join-Path (Join-Path $Root 'node_modules') 'tsx') 'dist') 'cli.mjs'
  $cli = Join-Path (Join-Path (Join-Path $BackendDir 'src') 'scripts') 'pilot-admin.cli.ts'
  if (-not (Test-Path $tsx)) { Stop-Pilot2 'tsx алга → pilot.ps1 build (pnpm install)' }
  Push-Location $BackendDir
  try { Invoke-Native 'node' (@($tsx, $cli, $sub) + $cliArgs) | Out-Null } finally { Pop-Location }
}

# ── Main ─────────────────────────────────────────────────────
# .env-ийг процессын орчинд оруулдаг → скрипт дуусахад буцаана. Эс бөгөөс таны PowerShell цонхонд пилотын
# DATABASE_URL, NODE_ENV=production г.м. үлдэж, дараагийн pnpm / тест пилотын DB руу холбогдоно (PROC-010).
$EnvSnapshot = @{}
foreach ($e in (Get-ChildItem env:)) { $EnvSnapshot[$e.Name] = $e.Value }

function Restore-Environment {
  foreach ($e in @(Get-ChildItem env:)) {
    if (-not $EnvSnapshot.ContainsKey($e.Name)) { Remove-Item -Path "env:$($e.Name)" -ErrorAction SilentlyContinue }
  }
  foreach ($k in $EnvSnapshot.Keys) {
    if ((Get-Item -Path "env:$k" -ErrorAction SilentlyContinue).Value -ne $EnvSnapshot[$k]) { Set-Item -Path "env:$k" -Value $EnvSnapshot[$k] }
  }
}

try {
  switch ($Command) {
    'check' { Invoke-Check }
    'init' { Invoke-Init }
    'build' { Invoke-Build }
    'start' { Start-Pilot | Out-Null; Write-Ok 'Пилот ажиллаж байна' }
    'run' { Invoke-Watchdog }
    'stop' {
      Stop-Watchdog
      Stop-PilotProcess 'caddy' 'caddy'
      Stop-PilotProcess 'backend' 'node'
      if ($All) {
        Invoke-Supabase -Arguments @('stop') | Out-Null   # --no-backup ХЭЗЭЭ Ч БИШ (өгөгдөл устна)
        Invoke-Native 'docker' @('compose', '-f', $RedisCompose, '-p', $RedisContainer, 'stop') | Out-Null
        Write-Ok 'Supabase, Redis зогсов (өгөгдөл хадгалагдсан)'
      }
    }
    'status' { Show-Status }
    'onboard' { Invoke-AdminCli 'onboard' }
    'user' { Invoke-AdminCli 'user' }
    'backup' { Invoke-Backup | Out-Null }
    'restore' { $f = $null; if ($Rest) { $f = $Rest[0] }; Invoke-Restore $f }
    'upgrade' { $t = $Tag; if (-not $t -and $Rest) { $t = $Rest[0] }; Invoke-Upgrade $t }
    'auth-test' { $e = ''; if ($Rest) { $e = $Rest[0] }; Invoke-AuthTest $e }
    'unlock' { $e = ''; if ($Rest) { $e = $Rest[0] }; Invoke-Unlock $e }
    'rotate-db-password' { Invoke-DbPasswordRotation }
    'firewall' { Set-PilotFirewall }
    'install-tasks' { Install-PilotTasks }
    'uninstall-tasks' { Uninstall-PilotTasks }
    default {
      # Тайлбар блокийг (.DESCRIPTION … #>) хэвлэнэ
      $lines = Get-Content -Path $PSCommandPath -Encoding UTF8
      $from = [array]::IndexOf($lines, '.DESCRIPTION')
      $to = [array]::IndexOf($lines, '#>')
      Write-Host 'S Project — Кемп пилот (pilot.ps1)'
      if ($from -ge 0 -and $to -gt $from) { $lines[($from + 1)..($to - 1)] | ForEach-Object { Write-Host $_ } }
    }
  }
} catch {
  Write-Host $_.Exception.Message -ForegroundColor Red
  Restore-Environment
  exit 1
}
Restore-Environment
