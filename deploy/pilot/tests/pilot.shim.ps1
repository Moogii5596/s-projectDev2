# v0.2.1 #15 — pilot.ps1-ийн shim тест (PIL-04 мониторинг, PIL-05 хуулбар, PIL-07 Supabase дахин асаалт)
#   docker / 7z / pnpm / Invoke-WebRequest-ийг function-оор орлуулна (function нь cmdlet/exe-ээс түрүүлж дуудагдана).
#   Docker, Supabase, сүлжээ хэрэггүй; пилотын өгөгдөлд ХҮРЭХГҮЙ (түр хавтсанд хуурамч root үүсгэнэ).
#   Ажиллуулах — Windows PowerShell 5.1 (pwsh суугаагүй машин):
#     powershell -NoProfile -ExecutionPolicy Bypass -File deploy/pilot/tests/pilot.shim.ps1
#   Ажиллуулах — pwsh 7:  pwsh -NoProfile -File deploy/pilot/tests/pilot.shim.ps1
$ErrorActionPreference = 'Stop'
$Repo = (Resolve-Path (Join-Path $PSScriptRoot '../../..')).Path
$T = Join-Path ([IO.Path]::GetTempPath()) "s-project-pilot-shim-$PID"; Remove-Item -Recurse -Force $T -ErrorAction SilentlyContinue
$R = Join-Path $T 'root'
New-Item -ItemType Directory -Force "$R/deploy/pilot/supabase", "$R/supabase/migrations", "$R/node_modules/.bin" | Out-Null
New-Item -ItemType Directory -Force "$R/deploy/staging/supabase" | Out-Null
Copy-Item $Repo/deploy/pilot/pilot.ps1 "$R/deploy/pilot/"
Copy-Item $Repo/deploy/pilot/supabase/config.toml "$R/deploy/pilot/supabase/"
Copy-Item $Repo/deploy/pilot/docker-compose.redis.yml "$R/deploy/pilot/"
Copy-Item $Repo/deploy/staging/supabase/config.toml "$R/deploy/staging/supabase/"
Copy-Item $Repo/deploy/staging/docker-compose.redis.yml "$R/deploy/staging/"
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
PILOT_DB_ADMIN_PASSWORD=$('C' * 40)
SUPABASE_URL=http://127.0.0.1:55321
PILOT_HTTP_PORT=8088
ESCALATION_CRON=off
PILOT_BACKUP_DIR=$T/bk
PILOT_BACKUP_PASSWORD=$('B' * 24)
PILOT_BACKUP_KEEP_DAYS=14
PILOT_STORAGE_DIR=$R/storage
PILOT_STORAGE_DB_WARN_GB=10
PILOT_7Z=7z
PILOT_CADDY=$R/caddy.exe
PILOT_HEALTHCHECK_URL=https://hc.example/main
PILOT_HEALTHCHECK_BACKUP_URL=https://hc.example/bk
"@
$global:Log = [System.Collections.Generic.List[string]]::new()
$global:SbRunning = $true; $global:Fail7z = $false; $global:HealthDown = $false
$global:NetworkPresent = $false; $global:NetworkBinding = '127.0.0.1'; $global:NetworkContainers = @(); $global:RedisNetworkGone = $false
$global:FunnelStatus = 'No serve config'; $global:FirewallEnabled = $true
$global:FirewallPorts = @('3000', '3100', '3200', '5173', '5174', '6379', '8088', '8089', '54320-54329', '55320-55329', '56379', '56520-56529', '56579')
$global:FailDbPassword = $false; $global:NewDbPassword = 'N' * 40
$global:DatabaseSizeBytes = [int64](1GB)
$global:PortMappings = '127.0.0.1:55321->8000/tcp, 127.0.0.1:55322->5432/tcp'
$global:ArchiveIncludesStorage = $false
$global:MockProcessId = 40000
$global:MockProcesses = @{}
New-Item -ItemType Directory -Force "$R/storage/Feed" | Out-Null
Set-Content "$R/storage/Feed/pilot.jpg" 'fixture'
New-Item -ItemType Directory -Force "$R/apps/core-kernel/dist/src", "$R/apps/web-shell/dist/assets" | Out-Null
Set-Content "$R/apps/core-kernel/dist/src/main.js" 'fixture'
Set-Content "$R/apps/web-shell/dist/index.html" 'fixture'
Set-Content "$R/apps/web-shell/dist/assets/app.js" 'x.y.z'
function global:docker {
  $a = $args -join ' '; $global:Log.Add("docker $a")
  if ($a -match '^network inspect') {
    if ($global:NetworkPresent) {
      $global:LASTEXITCODE = 0
      if ($a -notmatch '\{\{json \.Options\}\}') { return 'template parsing error' }
      if (-not $global:NetworkBinding) { return '{}' }
      return ('{"com.docker.network.bridge.host_binding_ipv4":"' + $global:NetworkBinding + '"}')
    }
    $global:LASTEXITCODE = 1; return
  }
  if ($a -match '^ps --format') { $global:LASTEXITCODE = 0; return $global:PortMappings }
  if ($a -match '^network create') {
    $global:NetworkPresent = $true; $global:NetworkBinding = '127.0.0.1'; $global:LASTEXITCODE = 0; return 'network-id'
  }
  if ($a -match '^network rm') { $global:NetworkPresent = $false; $global:LASTEXITCODE = 0; return }
  if ($a -match '^ps -a -q --filter network=') { $global:LASTEXITCODE = 0; return $global:NetworkContainers }
  if ($a -match '^compose .* up -d$' -and $global:RedisNetworkGone) { $global:LASTEXITCODE = 1; return 'network not found' }
  if ($a -match '^compose .* up -d --force-recreate$') { $global:RedisNetworkGone = $false }
  if ($global:FailDbPassword -and $a -match 'ALTER ROLE') { $global:LASTEXITCODE = 2; return }
  # Supabase: postgres superuser биш — privileged role-ийг зөвхөн supabase_admin солино
  if ($a -match 'ALTER ROLE' -and $a -match '\-U postgres') { $global:LASTEXITCODE = 1; return 'ERROR:  permission denied to alter role' }
  if ($a -match 'pg_database_size') { $global:LASTEXITCODE = 0; return "$global:DatabaseSizeBytes" }
  if ($a -match 'psql' -and $a -match 'schema_migrations') { $global:LASTEXITCODE = 0; return @('20261012006') }
  if ($a -match 'psql' -and $a -match 'count\(\*\)') { $global:LASTEXITCODE = 0; return '1 2 2' }
  if ($a -match 'SELECT current_user') {
    $global:LASTEXITCODE = 0
    if ($a -match '\-U postgres') { return 'postgres' }
    if ($a -match '\-U supabase_admin') { return 'supabase_admin' }
    return 'app_user'
  }
  $global:LASTEXITCODE = 0
}
function global:7z {
  $a = $args; $global:Log.Add("7z $($a[0])")
  if ($global:Fail7z) { $global:LASTEXITCODE = 2; return }
  if ($a[0] -eq 'a') {
    $arc = $a | Where-Object { "$_" -like '*.7z' } | Select-Object -First 1
    Set-Content -Path $arc -Value 'ARCHIVE'
    $source = $a | Where-Object { "$_" -match '\\\*$' } | Select-Object -First 1
    $global:ArchiveIncludesStorage = Test-Path (Join-Path (Split-Path -Parent $source) 'storage/Feed/pilot.jpg')
  } elseif ($a[0] -eq 'x') {
    $destination = ($a | Where-Object { "$_" -like '-o*' } | Select-Object -First 1).Substring(2)
    New-Item -ItemType Directory -Force "$destination/storage/Feed" | Out-Null
    Set-Content "$destination/public.dump" 'public'
    Set-Content "$destination/auth.dump" 'auth'
    Set-Content "$destination/migrations.txt" '20261012006'
    @{ slug = 'sinohydro'; createdAt = '2026-11-07T00:00:00Z'; version = '0.2.1'; tenants = 1; coreUsers = 2; authUsers = 2 } |
      ConvertTo-Json | Set-Content "$destination/manifest.json"
    Set-Content "$destination/storage/Feed/restored.jpg" 'restored'
  }
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
function global:tailscale {
  $global:Log.Add("tailscale $($args -join ' ')")
  $global:LASTEXITCODE = 0
  if (($args -join ' ') -eq 'funnel status') { return $global:FunnelStatus }
}
function global:Get-NetFirewallRule {
  param([string] $DisplayName, [string] $ErrorAction)
  if ($global:FirewallEnabled) {
    return [pscustomobject]@{ Enabled = 'True'; Direction = 'Inbound'; Action = 'Block' }
  }
}
function global:Get-NetFirewallPortFilter {
  param([object] $AssociatedNetFirewallRule, [string] $ErrorAction)
  return [pscustomobject]@{ Protocol = 'TCP'; LocalPort = $global:FirewallPorts }
}
function global:Read-Host {
  param([string] $Prompt, [switch] $AsSecureString)
  if ($AsSecureString) { return ConvertTo-SecureString $global:NewDbPassword -AsPlainText -Force }
  return ''
}
function global:Invoke-WebRequest { param($Uri, $Method, $Body, $ContentType, $TimeoutSec, [switch]$UseBasicParsing)
  $b = if ($Body -is [byte[]]) { [Text.Encoding]::UTF8.GetString($Body) } else { "$Body" }
  if ($global:HealthDown -and "$Uri" -like 'http://127.0.0.1*') { throw 'connection refused' }
  $global:Log.Add("PING $Uri | $b"); return [pscustomobject]@{ StatusCode = 200 } }
function global:robocopy {
  $source = $args[0]; $destination = $args[1]
  if (Test-Path $destination) {
    Get-ChildItem -LiteralPath $destination -Force | Remove-Item -Recurse -Force
  }
  New-Item -ItemType Directory -Force -Path $destination | Out-Null
  Copy-Item -Path (Join-Path $source '*') -Destination $destination -Recurse -Force
  $global:LASTEXITCODE = 1
}
function global:Start-Process {
  param([string] $FilePath, [string[]] $ArgumentList, [string] $WorkingDirectory, [switch] $PassThru,
    [string] $RedirectStandardOutput, [string] $RedirectStandardError, [string] $WindowStyle)
  $global:MockProcessId++
  $process = [pscustomobject]@{ Id = $global:MockProcessId; ProcessName = [IO.Path]::GetFileNameWithoutExtension($FilePath) }
  $global:MockProcesses["$($process.Id)"] = $process
  return $process
}
function global:Get-Process {
  param([int] $Id, [string] $ErrorAction)
  if ($global:MockProcesses.ContainsKey("$Id")) { return $global:MockProcesses["$Id"] }
  return Microsoft.PowerShell.Management\Get-Process -Id $Id -ErrorAction SilentlyContinue
}

$fail = 0
function Check($name, $cond) { if ($cond) { Write-Host "  ok   $name" } else { Write-Host "  FAIL $name" -ForegroundColor Red; $script:fail++ } }
function Run([string[]] $a) {
  $global:Log.Clear(); $global:LASTEXITCODE = 0
  $invokeArgs = @{ Command = $a[0] }
  $rest = @()
  for ($i = 1; $i -lt $a.Count; $i++) {
    if ($a[$i] -eq '-Profile' -and ($i + 1) -lt $a.Count) { $invokeArgs.Instance = $a[++$i] }
    elseif ($a[$i] -eq '-Yes') { $invokeArgs.Yes = $true }
    elseif ($a[$i] -eq '-Generate') { $invokeArgs.Generate = $true }
    else { $rest += $a[$i] }
  }
  if ($rest.Count -gt 0) { $invokeArgs.Rest = $rest }
  try { & "$R/deploy/pilot/pilot.ps1" @invokeArgs *> "$T/out.txt"; $ok = ($global:LASTEXITCODE -eq 0) }
  catch { "$_" | Add-Content "$T/out.txt"; $ok = $false }
  if (-not $ok) { Write-Host "  command failed: $($a -join ' ')"; Get-Content "$T/out.txt" | ForEach-Object { Write-Host "    $_" } }
  return $ok
}
function Pings { @($global:Log | Where-Object { $_ -like 'PING https://hc.example*' }) }
function WriteEnv([string] $extra) { ($global:EnvText + "`n" + $extra) | Set-Content "$R/.env" }
$stageEnv = $global:EnvText -replace '55322', '56522' -replace '55321', '56521' -replace '56379', '56579' -replace 'PORT=3100', 'PORT=3200' -replace 'PILOT_HTTP_PORT=8088', 'PILOT_HTTP_PORT=8089'
$stageEnv | Set-Content "$R/.env.staging"

Write-Host '1) backup + хуулбар OK'
WriteEnv "PILOT_BACKUP_COPY_DIR=$T/copy"
Check 'backup амжилттай' (Run @('backup'))
Check 'үндсэн нөөц' (@(Get-ChildItem "$T/bk" -Filter 'sinohydro-*.7z').Count -eq 1)
Check 'хуулбар' (@(Get-ChildItem "$T/copy" -Filter 'sinohydro-*.7z').Count -eq 1)
Check 'Feed storage archive-д орсон' $global:ArchiveIncludesStorage
Check 'ping → bk (OK)' ((Pings) -join ';' -match '^PING https://hc.example/bk \| pilot backup OK sinohydro-')

Write-Host '2) хуулбар = үндсэн хавтас → анхааруулга, /fail, backup амжилттай хэвээр'
WriteEnv "PILOT_BACKUP_COPY_DIR=$T/bk"
Check 'backup амжилттай' (Run @('backup'))
Check 'ping → bk/fail' ((Pings) -join ';' -match 'hc.example/bk/fail \| pilot backup backup OK, copy FAIL')
Check 'COPY FAIL лог' ((Get-Content "$R/deploy/pilot/run/logs/backup.log" -Raw) -match 'COPY FAIL')

Write-Host '3) 7z унавал → backup алдаа, /fail'
WriteEnv ''; $global:Fail7z = $true
Check 'backup алдаа шидэв' (-not (Run @('backup')))
Check 'ping → bk/fail (backup FAIL)' ((Pings) -join ';' -match 'hc.example/bk/fail \| pilot backup backup FAIL')
Check 'backup нууц үг алдааны output-д нуугдав' ((Get-Content "$T/out.txt" -Raw) -notmatch [regex]::Escape(('B' * 24)))
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
$global:HealthDown = $false; $global:DatabaseSizeBytes = [int64](11GB); $null = Run @('status')
$diskAlert = (
  ((Get-Content "$T/out.txt" -Raw) -match 'PostgreSQL \+ storage: 11 GB') -and
  ((Pings) -join ';' -match 'hc.example/main/fail \| pilot main status: PostgreSQL \+ storage хэмжээ босго давсан')
)
Check 'DB + storage босго давсан → анхааруулга + /fail' $diskAlert
$global:DatabaseSizeBytes = [int64](1GB)

Write-Host '6) init: тэмдэг алга → Supabase stop/start (migration-ы дараа), 2 дахь init → дахин асаахгүй'
Remove-Item "$R/deploy/pilot/run/supabase-config.sha256" -ErrorAction SilentlyContinue
Check 'init амжилттай' (Run @('init'))
Check 'loopback network үүсгэв' ($global:NetworkPresent -and ($global:Log -match 'docker network create.*host_binding_ipv4=127.0.0.1'))
$sb = @($global:Log | Where-Object { $_ -match 'supabase (start|stop|migration)' } | ForEach-Object { ($_ -split ' ')[3] })
Check "дараалал: migration up → stop → start ($($sb -join ', '))" (($sb -join ',') -eq 'migration,stop,start')
Check 'Supabase loopback network-д холбогдов' ($global:Log -match 'pnpm exec supabase start --network-id s-project-pilot-loopback')
Check 'тэмдэг үүсэв' (Test-Path "$R/deploy/pilot/run/supabase-config.sha256")
Check 'init #2' (Run @('init'))
Check 'дахин асаагаагүй' (-not ($global:Log -match 'supabase stop'))
Add-Content "$R/deploy/pilot/supabase/config.toml" '# өөрчлөлт'
Check 'init #3 (config өөрчлөгдсөн)' (Run @('init'))
Check 'дахин асаав' (@($global:Log -match 'supabase stop').Count -eq 1)

Write-Host '7) status: loopback, firewall, Funnel шалгалт'
$null = Run @('status')
Check 'status loopback network OK' ((Get-Content "$T/out.txt" -Raw) -match 'Supabase Docker network: 127\.0\.0\.1')
Check 'status firewall OK' ((Get-Content "$T/out.txt" -Raw) -match 'Windows Firewall: inbound блоклох дүрэм идэвхтэй')
Check 'status Funnel унтраалттай' ((Get-Content "$T/out.txt" -Raw) -match 'Tailscale Funnel унтраалттай')
$global:NetworkBinding = '0.0.0.0'; $null = Run @('status')
Check 'status loopback биш бол анхааруулав' ((Get-Content "$T/out.txt" -Raw) -match 'Supabase Docker network loopback биш')
$global:NetworkBinding = '127.0.0.1'
$global:PortMappings = '0.0.0.0:55321->8000/tcp, 127.0.0.1:55322->5432/tcp'
$null = Run @('status')
Check 'status published портын loopback биш binding-ийг анхааруулав' ((Get-Content "$T/out.txt" -Raw) -match 'Supabase API port 55321 гадна интерфэйстэй холбогдсон')
$global:PortMappings = '127.0.0.1:55321->8000/tcp, 127.0.0.1:55322->5432/tcp'
$global:NetworkBinding = '127.0.0.1'; $global:FunnelStatus = 'https://pilot.example (Funnel on)'; $null = Run @('status')
Check 'status Funnel асаалттайг анхааруулав' ((Get-Content "$T/out.txt" -Raw) -match 'Tailscale Funnel асаалттай')
$global:FunnelStatus = 'No serve config'; $global:FirewallEnabled = $false; $null = Run @('status')
Check 'status firewall унтраалттай бол анхааруулав' ((Get-Content "$T/out.txt" -Raw) -match 'Windows Firewall дүрэм алга/идэвхгүй')
$global:FirewallEnabled = $true
$global:FirewallPorts = @('3100')
$null = Run @('status')
Check 'status Firewall port жагсаалт дутуу бол анхааруулав' ((Get-Content "$T/out.txt" -Raw) -match 'Windows Firewall дүрэм алга/идэвхгүй')
$global:FirewallPorts = @('3000', '3100', '3200', '5173', '5174', '6379', '8088', '8089', '54320-54329', '55320-55329', '56379', '56520-56529', '56579')

Write-Host '7б) loopback биш сүлжээ: контейнергүй бол дахин үүсгэнэ, контейнертэй бол зогсоно (v0.2.4.2)'
$global:NetworkPresent = $true; $global:NetworkBinding = ''; $global:NetworkContainers = @()
Check 'контейнергүй сүлжээг дахин үүсгээд init амжилттай' (Run @('init', '-Profile', 'staging'))
Check 'network rm → create loopback' (($global:Log -match 'docker network rm') -and ($global:Log -match 'docker network create.*host_binding_ipv4=127.0.0.1') -and $global:NetworkBinding -eq '127.0.0.1')
$global:NetworkBinding = ''; $global:NetworkContainers = @('abc123')
Check 'контейнертэй сүлжээг устгахгүй, init зогсоно' (-not (Run @('init', '-Profile', 'staging')))
Check 'контейнертэй үед network rm хийгээгүй' (-not ($global:Log -match 'docker network rm'))
$global:NetworkBinding = '127.0.0.1'; $global:NetworkContainers = @()

Write-Host '7в) Redis контейнер устсан сүлжээ рүү заасан → force-recreate (v0.2.4.2)'
$global:RedisNetworkGone = $true
Check 'Redis дахин үүсгээд init амжилттай' (Run @('init', '-Profile', 'staging'))
Check 'force-recreate дуудсан' ($global:Log -match 'docker compose .* up -d --force-recreate')
$global:RedisNetworkGone = $false

Write-Host '8) restore: DB өгөгдөл ба Feed storage-ийг тусгаарласан root-д сэргээх'
Check 'тусгаарласан staging fixture init' (Run @('init', '-Profile', 'staging'))
$restoreArchive = Get-ChildItem "$T/bk" -Filter 'sinohydro-*.7z' | Select-Object -First 1
Check 'restore команд' (Run @('restore', $restoreArchive.FullName, '-Profile', 'staging', '-Yes'))
Check 'restore db reset-ийн дараа postgres нууцыг .env-ээр сэргээв' (
  ($global:Log -match '-U supabase_admin .*ALTER ROLE postgres WITH PASSWORD') -and
  ((Get-Content "$T/out.txt" -Raw) -notmatch [regex]::Escape('C' * 40))
)
Check 'restore storage archive-оос орсон' (
  (Test-Path "$R/storage/Feed/restored.jpg") -and -not (Test-Path "$R/storage/Feed/pilot.jpg") -and
  ((Get-Content "$T/out.txt" -Raw) -match 'storage сэргээв')
)

Write-Host '9) DB administrator нууц үг staging-д солих'
Check 'staging DB нууц солигдов' (Run @('rotate-db-password', '-Profile', 'staging'))
Check 'staging .env шинэчлэгдэв' ((Get-Content "$R/.env.staging" -Raw) -match "PILOT_DB_ADMIN_PASSWORD=$global:NewDbPassword")
Check 'staging DIRECT_URL / SYSTEM_DATABASE_URL шинэ нууцтай' (
  ((Get-Content "$R/.env.staging" -Raw) -match "(?m)^DIRECT_URL=postgresql://postgres:$global:NewDbPassword@127\.0\.0\.1:56522/") -and
  ((Get-Content "$R/.env.staging" -Raw) -match "(?m)^SYSTEM_DATABASE_URL=postgresql://postgres:$global:NewDbPassword@127\.0\.0\.1:56522/") -and
  ((Get-Content "$R/.env.staging" -Raw) -match "(?m)^DATABASE_URL=postgresql://app_user:A{26}@")
)
Check 'нууц command log/out-д гараагүй' ((Get-Content "$T/out.txt" -Raw) -notmatch [regex]::Escape($global:NewDbPassword))
Check 'staging нөөц шинэ DB нууц ашиглав' ((Run @('backup', '-Profile', 'staging')) -and ($global:Log -match "PGPASSWORD=$global:NewDbPassword") -and ($global:Log -notmatch 'PGPASSWORD=postgres'))
$oldStageEnv = Get-Content "$R/.env.staging" -Raw
$global:NewDbPassword = 'Z' * 40; $global:FailDbPassword = $true
Check 'DB солилт алдааг ил гаргав' (-not (Run @('rotate-db-password', '-Profile', 'staging')))
Check 'DB солилтын алдаанд .env хэвээр' ((Get-Content "$R/.env.staging" -Raw) -eq $oldStageEnv)
Check 'DB солилтын алдаанд нууц log/out-д гараагүй' ((Get-Content "$T/out.txt" -Raw) -notmatch [regex]::Escape($global:NewDbPassword))
$global:FailDbPassword = $false

Write-Host '9б) staging зогссон + нууц хоосон: rotate -Generate DB-г асааж солино (v0.2.4.2)'
$stageEnv = Get-Content "$R/.env.staging" -Raw
($stageEnv -replace '(?m)^PILOT_DB_ADMIN_PASSWORD=.*$', 'PILOT_DB_ADMIN_PASSWORD=') | Set-Content "$R/.env.staging"
$global:SbRunning = $false
Check 'зогссон staging rotate амжилттай' (Run @('rotate-db-password', '-Profile', 'staging', '-Generate'))
Check 'rotate Supabase асаав' (@($global:Log) -match 'supabase start')
Check 'rotate анхдагч нууцаар supabase_admin-аар солив' (@($global:Log) -match 'PGPASSWORD=postgres .*-U supabase_admin .*ALTER ROLE')
Check 'зогссон staging .env шинэ нууцтай' ((Get-Content "$R/.env.staging" -Raw) -match '(?m)^PILOT_DB_ADMIN_PASSWORD=[A-Za-z0-9]{40}\s*$')
$global:SbRunning = $true

Write-Host '10) check: http:// URL → алдаа'
($global:EnvText -replace 'https://hc.example/main', 'http://hc.example/main') | Set-Content "$R/.env"
Check 'check унав' (-not (Run @('check')))
Check 'мессеж' ((Get-Content "$T/out.txt" -Raw) -match 'PILOT_HEALTHCHECK_URL нь https')
Remove-Item -Recurse -Force $T -ErrorAction SilentlyContinue
"FAILED=$fail"
if ($fail -gt 0) { exit 1 }
