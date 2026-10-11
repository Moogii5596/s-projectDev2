# v0.2.1 #15 — pilot.ps1-ийн shim тест (PIL-04 мониторинг, PIL-05 хуулбар, PIL-07 Supabase дахин асаалт)
#   docker / 7z / pnpm / Invoke-WebRequest-ийг function-оор орлуулна (function нь cmdlet/exe-ээс түрүүлж дуудагдана).
#   Docker, Supabase, сүлжээ хэрэггүй; пилотын өгөгдөлд ХҮРЭХГҮЙ (түр хавтсанд хуурамч root үүсгэнэ).
#   Ажиллуулах (Windows PowerShell 5.1 / pwsh 7):  pwsh -NoProfile -File deploy/pilot/tests/pilot.shim.ps1
$ErrorActionPreference = 'Stop'
$Repo = (Resolve-Path (Join-Path $PSScriptRoot '../../..')).Path
$T = Join-Path ([IO.Path]::GetTempPath()) "s-project-pilot-shim-$PID"; Remove-Item -Recurse -Force $T -ErrorAction SilentlyContinue
$R = Join-Path $T 'root'
New-Item -ItemType Directory -Force "$R/deploy/pilot/supabase", "$R/supabase/migrations", "$R/node_modules/.bin" | Out-Null
Copy-Item $Repo/deploy/pilot/pilot.ps1 "$R/deploy/pilot/"
Copy-Item $Repo/deploy/pilot/supabase/config.toml "$R/deploy/pilot/supabase/"
Copy-Item $Repo/deploy/pilot/docker-compose.redis.yml "$R/deploy/pilot/"
Copy-Item $Repo/supabase/migrations/20261012006_auth_password_guard.sql "$R/supabase/migrations/"
'{"version":"0.2.1"}' | Set-Content "$R/package.json"
'' | Set-Content "$R/node_modules/.bin/supabase"
$pw = 'A' * 26
$global:EnvText = @"
NODE_ENV=production
PORT=3100
DEPLOYMENT_MODE=dedicated
DEDICATED_TENANT_SLUG=sinohydro
DATABASE_URL=postgresql://app_user:$pw@127.0.0.1:55322/postgres
SYSTEM_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55322/postgres
DIRECT_URL=postgresql://postgres:postgres@127.0.0.1:55322/postgres
SUPABASE_AUTH_JWT_SECRET=$('s' * 40)
JWT_SECRET=$('j' * 40)
REDIS_URL=redis://127.0.0.1:56379
SUPABASE_URL=http://127.0.0.1:55321
ESCALATION_CRON=off
PILOT_BACKUP_DIR=$T/bk
PILOT_BACKUP_PASSWORD=$('B' * 24)
PILOT_BACKUP_KEEP_DAYS=14
PILOT_7Z=7z
PILOT_HEALTHCHECK_URL=https://hc.example/main
PILOT_HEALTHCHECK_BACKUP_URL=https://hc.example/bk
"@
$global:Log = [System.Collections.Generic.List[string]]::new()
$global:SbRunning = $true; $global:Fail7z = $false; $global:HealthDown = $false
function global:docker {
  $a = $args -join ' '; $global:Log.Add("docker $a")
  if ($a -match 'psql' -and $a -match 'schema_migrations') { $global:LASTEXITCODE = 0; return @('20261012006') }
  if ($a -match 'psql' -and $a -match 'count\(\*\)') { $global:LASTEXITCODE = 0; return '1 2 2' }
  if ($a -match 'SELECT current_user') { $global:LASTEXITCODE = 0; return 'app_user' }
  $global:LASTEXITCODE = 0
}
function global:7z {
  $a = $args; $global:Log.Add("7z $($a[0])")
  if ($global:Fail7z) { $global:LASTEXITCODE = 2; return }
  if ($a[0] -eq 'a') { $arc = $a | Where-Object { "$_" -like '*.7z' } | Select-Object -First 1; Set-Content -Path $arc -Value 'ARCHIVE' }
  $global:LASTEXITCODE = 0
}
function global:pnpm {
  $a = $args -join ' '; $global:Log.Add("pnpm $a")
  if ($a -match 'supabase status') {
    if ($global:SbRunning) { $global:LASTEXITCODE = 0; return @('ANON_KEY="x.y.z"', 'SERVICE_ROLE_KEY="x.y.z"') }
    $global:LASTEXITCODE = 1; return
  }
  if ($a -match 'supabase stop') { $global:SbRunning = $false }
  if ($a -match 'supabase start') { $global:SbRunning = $true }
  $global:LASTEXITCODE = 0
}
function global:Invoke-WebRequest { param($Uri, $Method, $Body, $ContentType, $TimeoutSec, [switch]$UseBasicParsing)
  $b = if ($Body -is [byte[]]) { [Text.Encoding]::UTF8.GetString($Body) } else { "$Body" }
  if ($global:HealthDown -and "$Uri" -like 'http://127.0.0.1*') { throw 'connection refused' }
  $global:Log.Add("PING $Uri | $b"); return [pscustomobject]@{ StatusCode = 200 } }

$fail = 0
function Check($name, $cond) { if ($cond) { Write-Host "  ok   $name" } else { Write-Host "  FAIL $name" -ForegroundColor Red; $script:fail++ } }
function Run([string[]] $a) { $global:Log.Clear(); $global:LASTEXITCODE = 0; try { & "$R/deploy/pilot/pilot.ps1" @a *> "$T/out.txt"; return ($global:LASTEXITCODE -eq 0) } catch { "$_" | Add-Content "$T/out.txt"; return $false } }
function Pings { @($global:Log | Where-Object { $_ -like 'PING https://hc.example*' }) }
function WriteEnv([string] $extra) { ($global:EnvText + "`n" + $extra) | Set-Content "$R/.env" }

Write-Host '1) backup + хуулбар OK'
WriteEnv "PILOT_BACKUP_COPY_DIR=$T/copy"
Check 'backup амжилттай' (Run @('backup'))
Check 'үндсэн нөөц' (@(Get-ChildItem "$T/bk" -Filter 'sinohydro-*.7z').Count -eq 1)
Check 'хуулбар' (@(Get-ChildItem "$T/copy" -Filter 'sinohydro-*.7z').Count -eq 1)
Write-Host ("DBG: " + ($global:Log -join " || ")); Check 'ping → bk (OK)' ((Pings) -join ';' -match '^PING https://hc.example/bk \| pilot backup OK sinohydro-')

Write-Host '2) хуулбар = үндсэн хавтас → анхааруулга, /fail, backup амжилттай хэвээр'
WriteEnv "PILOT_BACKUP_COPY_DIR=$T/bk"
Check 'backup амжилттай' (Run @('backup'))
Check 'ping → bk/fail' ((Pings) -join ';' -match 'hc.example/bk/fail \| pilot backup backup OK, copy FAIL')
Check 'COPY FAIL лог' ((Get-Content "$R/deploy/pilot/run/logs/backup.log" -Raw) -match 'COPY FAIL')

Write-Host '3) 7z унавал → backup алдаа, /fail'
WriteEnv ''; $global:Fail7z = $true
Check 'backup алдаа шидэв' (-not (Run @('backup')))
Check 'ping → bk/fail (backup FAIL)' ((Pings) -join ';' -match 'hc.example/bk/fail \| pilot backup backup FAIL')
$global:Fail7z = $false

Write-Host '4) backup URL хоосон → алдааг main/fail руу'
($global:EnvText -replace 'PILOT_HEALTHCHECK_BACKUP_URL=.*', 'PILOT_HEALTHCHECK_BACKUP_URL=') + "`nPILOT_BACKUP_COPY_DIR=$T/bk" | Set-Content "$R/.env"
Check 'backup амжилттай' (Run @('backup'))
Check 'ping → main/fail' ((Pings) -join ';' -match 'hc.example/main/fail')

Write-Host '5) status → main ping'
WriteEnv ''
$null = Run @('status')
Check 'status эрүүл → main OK' ((Pings) -join ';' -eq 'PING https://hc.example/main | pilot main status OK')
$global:HealthDown = $true; $null = Run @('status'); $global:HealthDown = $false
Check 'status health алга → main/fail' ((Pings) -join ';' -eq 'PING https://hc.example/main/fail | pilot main status: backend health алга')

Write-Host '6) init: тэмдэг алга → Supabase stop/start (migration-ы дараа), 2 дахь init → дахин асаахгүй'
Remove-Item "$R/deploy/pilot/run/supabase-config.sha256" -ErrorAction SilentlyContinue
Check 'init амжилттай' (Run @('init'))
$sb = @($global:Log | Where-Object { $_ -match 'supabase (start|stop|migration)' } | ForEach-Object { ($_ -split ' ')[3] })
Check "дараалал: migration up → stop → start ($($sb -join ', '))" (($sb -join ',') -eq 'migration,stop,start')
Check 'тэмдэг үүсэв' (Test-Path "$R/deploy/pilot/run/supabase-config.sha256")
Check 'init #2' (Run @('init'))
Check 'дахин асаагаагүй' (-not ($global:Log -match 'supabase stop'))
Add-Content "$R/deploy/pilot/supabase/config.toml" '# өөрчлөлт'
Check 'init #3 (config өөрчлөгдсөн)' (Run @('init'))
Check 'дахин асаав' (@($global:Log -match 'supabase stop').Count -eq 1)

Write-Host '7) check: http:// URL → алдаа'
($global:EnvText -replace 'https://hc.example/main', 'http://hc.example/main') | Set-Content "$R/.env"
Check 'check унав' (-not (Run @('check')))
Check 'мессеж' ((Get-Content "$T/out.txt" -Raw) -match 'PILOT_HEALTHCHECK_URL нь https')
Remove-Item -Recurse -Force $T -ErrorAction SilentlyContinue
"FAILED=$fail"
if ($fail -gt 0) { exit 1 }
