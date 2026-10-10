<#
.SYNOPSIS
  S Project v0.1.6 — Кемп пилот (Windows, нэг машин). Пилотын хавтасны root-оос ажиллуулна:
    cd E:\MoogiiDev\Pilot\s-project
    .\deploy\pilot\pilot.ps1 <команд> [аргумент]

.DESCRIPTION
  Командууд:
    check                 Шаардлага (node, pnpm, docker, caddy, 7z) + .env-ийн аюулгүй байдал
    init                  Анх / шинэчлэлийн дараа: migration хуулах, Redis + Supabase асаах, migration, app_user нууц үг
    build                 pnpm install, Prisma, backend + web (VITE_MODULES=PILOT_MODULES) build
    start                 Redis + Supabase + backend + Caddy асаана (нэг удаа)
    run                   start + харуул (watchdog): унасан backend/Caddy-г дахин асаана. Task Scheduler үүнийг ажиллуулна
    stop [-All]           Caddy + backend зогсооно. -All: Supabase, Redis ч (өгөгдөл ХАДГАЛАГДАНА)
    status                Процесс, health, контейнер, Tailscale Funnel
    onboard --slug= ...   Байгууллага + эзэмшигч (pnpm pilot:onboard)
    user --email= ...     Хэрэглэгч нэмэх/засах (pnpm pilot:user)
    backup                Шифрлэсэн нөөц (7-Zip AES-256) → PILOT_BACKUP_DIR, хуучныг устгана
    restore <файл.7z>     Нөөцөөс сэргээх (ОДООГИЙН ӨГӨГДӨЛ УСТНА — баталгаажуулалт асууна)
    firewall              (Админ) Windows Firewall: dev/пилотын портуудыг гаднаас хаах
    install-tasks         Task Scheduler: нэвтрэхэд `run`, өдөр бүр 02:00 `backup`
    uninstall-tasks       Task Scheduler-ийн даалгавруудыг устгах

  Windows PowerShell 5.1 + PowerShell 7-д ажиллана. Энэ файл UTF-8 BOM-той (5.1 кирилл зөв уншина).
  Дэлгэрэнгүй: docs/07_Tech_Stack_and_Environment/04_Pilot_Camp_Windows.md
#>
[CmdletBinding()]
param(
  [Parameter(Position = 0)] [string] $Command = 'help',
  [Parameter(Position = 1, ValueFromRemainingArguments = $true)] [string[]] $Rest,
  [switch] $All,
  [switch] $Yes
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }

# ── Тогтмолууд ────────────────────────────────────────────────
$PilotDir = $PSScriptRoot
$Root = Split-Path -Parent (Split-Path -Parent $PilotDir)
$ProjectId = 's-project-pilot'
$DbContainer = "supabase_db_$ProjectId"
$RedisContainer = 's-project-pilot-redis'
$RedisCompose = Join-Path $PilotDir 'docker-compose.redis.yml'
$RunDir = Join-Path $PilotDir 'run'
$LogDir = Join-Path $RunDir 'logs'
$BackendDir = Join-Path (Join-Path $Root 'apps') 'core-kernel'
$WebDist = Join-Path (Join-Path (Join-Path $Root 'apps') 'web-shell') 'dist'
$SupabaseApiPort = 55321
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
    Stop-Pilot2 "$Exe $($Arguments -join ' ') → exit $code"
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

function Import-PilotEnv {
  $envFile = Join-Path $Root '.env'
  if (-not (Test-Path $envFile)) {
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

  $dbUrl = Get-Cfg $cfg 'DATABASE_URL'
  if ($dbUrl -notmatch '^postgres(?:ql)?://app_user:') { $errors.Add('DATABASE_URL нь app_user-ээр (RLS) холбогдох ёстой') }
  $pw = Get-UrlPassword $dbUrl
  if ($pw -eq $DefaultAppUserPassword) { $errors.Add('DATABASE_URL: app_user-ийн анхдагч нууц үг (change_in_production) — солино') }
  if ($pw -notmatch '^[A-Za-z0-9]{24,}$') { $errors.Add('DATABASE_URL: app_user нууц үг зөвхөн латин үсэг/тоо, 24+ тэмдэгт') }
  if ($dbUrl -notmatch '@127\.0\.0\.1:55322/') { Write-Warn2 'DATABASE_URL нь 127.0.0.1:55322 биш (пилотын Supabase)?' }
  if ((Get-Cfg $cfg 'SUPABASE_URL') -ne "http://127.0.0.1:$SupabaseApiPort") { Write-Warn2 "SUPABASE_URL нь http://127.0.0.1:$SupabaseApiPort биш?" }
  if ((Get-Cfg $cfg 'REDIS_URL') -ne 'redis://127.0.0.1:56379') { Write-Warn2 'REDIS_URL нь пилотын Redis (redis://127.0.0.1:56379) биш?' }
  if ((Get-Cfg $cfg 'PORT') -eq '3000') { Write-Warn2 'PORT=3000 нь dev backend-тэй давхцана (3100 зөвлөнө)' }
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
    Stop-Pilot2 ".env-д $($errors.Count) алдаа (.\deploy\pilot\pilot.ps1 check)"
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
  Invoke-Native -Exe 'docker' -Arguments @('compose', '-f', $RedisCompose, '-p', 's-project-pilot-redis', 'up', '-d') | Out-Null
  Write-Ok "Redis ($RedisContainer, 127.0.0.1:56379)"
}

function Start-PilotSupabase([hashtable] $cfg) {
  # env() → SUPABASE_AUTH_JWT_SECRET. Байхгүй бол CLI demo нууцаар асдаг тул заавал шалгана
  if ((Get-Cfg $cfg 'SUPABASE_AUTH_JWT_SECRET').Length -lt 32) { Stop-Pilot2 'SUPABASE_AUTH_JWT_SECRET алга' }
  $env:SUPABASE_AUTH_JWT_SECRET = $cfg['SUPABASE_AUTH_JWT_SECRET']
  $keys = Get-SupabaseKeys
  if ($null -eq $keys) {
    Write-Step 'Supabase (пилот) асааж байна'
    Invoke-Supabase -Arguments @('start') | Out-Null
    $keys = Get-SupabaseKeys
    if ($null -eq $keys) { Stop-Pilot2 'supabase status — түлхүүр уншиж чадсангүй' }
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
function Invoke-DbSql([string] $sql, [switch] $Capture, [string] $User = 'supabase_admin', [string] $Password = 'postgres') {
  $a = @('exec', '-e', "PGPASSWORD=$Password", $DbContainer, 'psql', '-h', '127.0.0.1', '-U', $User, '-d', 'postgres',
    '-v', 'ON_ERROR_STOP=1', '-At', '-c', $sql)
  return Invoke-Native -Exe 'docker' -Arguments $a -Capture:$Capture
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
  $port = Get-Cfg $cfg 'PORT' '3100'
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
  $env:PILOT_API_PORT = Get-Cfg $cfg 'PORT' '3100'
  $env:PILOT_SUPABASE_PORT = [string] $SupabaseApiPort
  $env:PILOT_HTTP_PORT = Get-Cfg $cfg 'PILOT_HTTP_PORT' '8088'
  $env:PILOT_LOG_DIR = $LogDir
  $caddyfile = Join-Path $PilotDir 'Caddyfile'
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
    $pgEnv = @('exec', '-e', 'PGPASSWORD=postgres', $DbContainer)
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

    $archive = Join-Path $dir "$slug-$stamp.7z"
    # -mhe=on: файлын нэрийг ч шифрлэнэ (AES-256)
    Invoke-Native $sevenZip @('a', '-t7z', '-mhe=on', '-mx=5', "-p$($cfg['PILOT_BACKUP_PASSWORD'])", $archive, (Join-Path $tmp '*')) -Quiet | Out-Null
    Invoke-Native $sevenZip @('t', "-p$($cfg['PILOT_BACKUP_PASSWORD'])", $archive) -Quiet | Out-Null
    $size = [math]::Round((Get-Item $archive).Length / 1KB, 1)
    Write-Ok "$archive ($size KB; tenants $($c[0]), хэрэглэгч $($c[1]), migration $($versions.Count))"
    Write-Log 'backup.log' "OK $archive ${size}KB tenants=$($c[0]) users=$($c[1])"

    $old = Get-ChildItem -Path $dir -Filter "$slug-*.7z" | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$keep) }
    foreach ($f in $old) { Remove-Item $f.FullName -Force; Write-Host "  хуучин нөөц устгав: $($f.Name)" }
  } catch {
    Write-Log 'backup.log' "FAIL $($_.Exception.Message)"
    throw
  } finally {
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
    Stop-Watchdog
    Stop-PilotProcess 'caddy' 'caddy'
    Stop-PilotProcess 'backend' 'node'
    Wait-Docker
    Start-PilotRedis
    Start-PilotSupabase $cfg | Out-Null
    Invoke-Supabase -Arguments @('db', 'reset', '--local', '--no-seed', '--yes') | Out-Null

    Write-Step 'Өгөгдөл сэргээх'
    Invoke-Native 'docker' @('cp', (Join-Path $tmp 'public.dump'), "${DbContainer}:/tmp/pilot-public.dump") | Out-Null
    Invoke-Native 'docker' @('cp', (Join-Path $tmp 'auth.dump'), "${DbContainer}:/tmp/pilot-auth.dump") | Out-Null
    # migration-ийн seed (0003 tenant-ууд, кемпийн анхдагч роль г.м.) + auth.users-ийг цэвэрлээд нөөцийнхийг хийнэ
    $truncate = "DO `$`$ BEGIN EXECUTE (SELECT 'TRUNCATE TABLE ' || string_agg(format('%I.%I', schemaname, tablename), ', ') || ' RESTART IDENTITY CASCADE' FROM pg_tables WHERE schemaname = 'public'); TRUNCATE auth.users CASCADE; END `$`$"
    Invoke-DbSql $truncate | Out-Null
    $pgEnv = @('exec', '-e', 'PGPASSWORD=postgres', $DbContainer)
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
    Invoke-Native 'docker' @('exec', $RedisContainer, 'redis-cli', 'FLUSHALL') -Quiet | Out-Null
    Write-Ok 'Redis cache цэвэрлэв'
    Write-Log 'backup.log' "RESTORE OK $file"
  } finally {
    Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
  }
  Start-Pilot | Out-Null
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
$BlockedPorts = @('3000', '3100', '5173', '5174', '6379', '8088', '54320-54329', '55320-55329', '56379')

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
  $ps = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
  $script = Join-Path $PilotDir 'pilot.ps1'
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
  $port = Get-Cfg $cfg 'PORT' '3100'
  $fails = 0
  while ($true) {
    Start-Sleep -Seconds 30
    try {
      if ($null -eq (Get-PilotProcess 'backend' 'node')) {
        Write-Log 'pilot.log' 'backend down → restart'
        Start-Backend $cfg
      } elseif (-not (Wait-Http "http://127.0.0.1:$port/api/v1/health" 10)) {
        $fails++
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
        Start-Caddy $cfg
      }
    } catch {
      Write-Log 'pilot.log' "watchdog error: $($_.Exception.Message)"
    }
  }
}

function Show-Status {
  $cfg = Import-PilotEnv
  $port = Get-Cfg $cfg 'PORT' '3100'
  $http = Get-Cfg $cfg 'PILOT_HTTP_PORT' '8088'
  foreach ($n in @(@('backend', 'node'), @('caddy', 'caddy'))) {
    $p = Get-PilotProcess $n[0] $n[1]
    if ($p) { Write-Ok "$($n[0]) PID $($p.Id)" } else { Write-Warn2 "$($n[0]) ажиллахгүй" }
  }
  if (Wait-Http "http://127.0.0.1:$port/api/v1/health" 3) { Write-Ok "backend health (127.0.0.1:$port)" } else { Write-Warn2 'backend health алга' }
  if (Wait-Http "http://127.0.0.1:$http/api/v1/health" 3) { Write-Ok "gateway health (127.0.0.1:$http)" } else { Write-Warn2 'gateway (Caddy) health алга' }
  Invoke-Native 'docker' @('ps', '--filter', "name=$ProjectId", '--format', '{{.Names}}  {{.Status}}') -AllowFail | Out-Null
  if (Get-Command tailscale -ErrorAction SilentlyContinue) {
    Write-Step 'Tailscale Funnel'
    Invoke-Native 'tailscale' @('funnel', 'status') -AllowFail | Out-Null
  }
  $bdir = Get-Cfg $cfg 'PILOT_BACKUP_DIR'
  if ($bdir -and (Test-Path $bdir)) {
    $last = Get-ChildItem -Path $bdir -Filter '*.7z' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($last) { Write-Ok "сүүлийн нөөц: $($last.Name) ($($last.LastWriteTime))" } else { Write-Warn2 'нөөц алга' }
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

function Invoke-Init {
  $cfg = Import-PilotEnv
  Assert-PilotEnv $cfg
  Sync-Migrations
  Wait-Docker
  Start-PilotRedis
  Start-PilotSupabase $cfg | Out-Null
  Write-Step 'Migration (шинэ байвал)'
  Invoke-Supabase -Arguments @('migration', 'up', '--local') | Out-Null
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
    Write-Step 'pnpm install'
    Invoke-Native 'pnpm' @('install', '--frozen-lockfile') | Out-Null
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
        Invoke-Native 'docker' @('compose', '-f', $RedisCompose, '-p', 's-project-pilot-redis', 'stop') | Out-Null
        Write-Ok 'Supabase, Redis зогсов (өгөгдөл хадгалагдсан)'
      }
    }
    'status' { Show-Status }
    'onboard' { Invoke-AdminCli 'onboard' }
    'user' { Invoke-AdminCli 'user' }
    'backup' { Invoke-Backup }
    'restore' { $f = $null; if ($Rest) { $f = $Rest[0] }; Invoke-Restore $f }
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
  exit 1
}
