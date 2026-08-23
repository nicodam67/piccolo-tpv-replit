param(
  [string]$AppRoot = "$env:ProgramFiles\Piccolo TPV",
  [string]$DataRoot = "$env:ProgramData\PiccoloTPV"
)

. (Join-Path $PSScriptRoot "Common.ps1")
Assert-Administrator
Initialize-PiccoloPaths $DataRoot
Write-PiccoloLog $DataRoot "Inicio del configurador guiado Piccolo TPV 0.9.0-rc.2."

function Find-Psql {
  $command = Get-Command psql.exe -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }
  $candidate = Get-ChildItem "$env:ProgramFiles\PostgreSQL\*\bin\psql.exe" -ErrorAction SilentlyContinue |
    Sort-Object FullName -Descending | Select-Object -First 1
  if ($candidate) { return $candidate.FullName }
  return $null
}

$psql = Find-Psql
if (-not $psql) {
  Write-Host "PostgreSQL 16 no está instalado." -ForegroundColor Yellow
  $install = Read-Host "¿Deseas abrir el instalador oficial mediante winget? (S/N)"
  if ($install -match "^[Ss]") {
    if (-not (Get-Command winget.exe -ErrorAction SilentlyContinue)) {
      throw "winget no está disponible. Instala PostgreSQL 16 desde https://www.postgresql.org/download/windows/ y vuelve a abrir el configurador."
    }
    & winget.exe install --id PostgreSQL.PostgreSQL.16 --exact --interactive --accept-package-agreements --accept-source-agreements
    if ($LASTEXITCODE -ne 0) { throw "La instalación de PostgreSQL no finalizó correctamente." }
    $psql = Find-Psql
  }
}
if (-not $psql) { throw "PostgreSQL 16 es obligatorio. Instálalo y vuelve a ejecutar Configurar servidor." }

$hostName = Read-Host "Nombre del servidor para tablets/KDS [piccolo.local]"
if (-not $hostName) { $hostName = "piccolo.local" }
if ($hostName -notmatch "^[A-Za-z0-9.-]+$") { throw "Nombre de servidor no válido." }
$apiPortInput = Read-Host "Puerto interno del servidor [8080]"
$apiPort = if ($apiPortInput) { [int]$apiPortInput } else { 8080 }
if ($apiPort -lt 1024 -or $apiPort -gt 65535) { throw "Puerto no válido." }
$occupiedApi = Get-NetTCPConnection -State Listen -LocalPort $apiPort -ErrorAction SilentlyContinue
if ($occupiedApi) { throw "El puerto $apiPort ya está ocupado. Elige otro puerto." }
$occupiedHttps = Get-NetTCPConnection -State Listen -LocalPort 443 -ErrorAction SilentlyContinue
if ($occupiedHttps) { throw "El puerto HTTPS 443 está ocupado. Detén el servicio en conflicto antes de continuar." }

$dbHost = Read-Host "Servidor PostgreSQL [localhost]"
if (-not $dbHost) { $dbHost = "localhost" }
$dbPortInput = Read-Host "Puerto PostgreSQL [5432]"
$dbPort = if ($dbPortInput) { [int]$dbPortInput } else { 5432 }
$dbName = Read-Host "Nombre de base de datos [piccolo_tpv]"
if (-not $dbName) { $dbName = "piccolo_tpv" }
$dbUser = Read-Host "Usuario Piccolo [piccolo]"
if (-not $dbUser) { $dbUser = "piccolo" }
if ($dbName -notmatch "^[A-Za-z0-9_]+$" -or $dbUser -notmatch "^[A-Za-z0-9_]+$") {
  throw "El nombre de base de datos y usuario solo pueden contener letras, números y guion bajo."
}

$superUser = Read-Host "Usuario administrador PostgreSQL [postgres]"
if (-not $superUser) { $superUser = "postgres" }
$superPasswordSecure = Read-Host "Contraseña del administrador PostgreSQL" -AsSecureString
$superPasswordPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($superPasswordSecure)
$superPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($superPasswordPtr)

$appPassword = New-PiccoloSecret 32
$env:PGPASSWORD = $superPassword
try {
  $databaseExists = (& $psql -h $dbHost -p $dbPort -U $superUser -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$dbName'").Trim() -eq "1"
  $roleExists = (& $psql -h $dbHost -p $dbPort -U $superUser -d postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname='$dbUser'").Trim() -eq "1"
  if ($databaseExists) {
    Write-Host "La base de datos '$dbName' ya existe. No se borrará ni sobrescribirá." -ForegroundColor Yellow
    $confirmExisting = Read-Host "Escribe CONSERVAR para utilizarla y crear una copia previa"
    if ($confirmExisting -ne "CONSERVAR") { throw "Configuración cancelada sin modificar la base de datos." }
    $dump = Join-Path $DataRoot "backups\pre-install-$(Get-Date -Format yyyyMMdd-HHmmss).dump"
    $pgDump = Join-Path (Split-Path $psql) "pg_dump.exe"
    if (-not (Test-Path $pgDump)) { throw "pg_dump no está disponible; no se continuará sin copia de seguridad." }
    & $pgDump -h $dbHost -p $dbPort -U $superUser -d $dbName -Fc -f $dump
    if ($LASTEXITCODE -ne 0) { throw "No se pudo crear la copia previa; no se ha modificado la base de datos." }
    Write-PiccoloLog $DataRoot "Copia previa creada: $(Split-Path $dump -Leaf)"
    if ($roleExists) {
      $existingPassword = Read-Host "Contraseña actual del usuario '$dbUser'" -AsSecureString
      $existingPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($existingPassword)
      $appPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($existingPtr)
      [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($existingPtr)
    }
  } else {
    if (-not $roleExists) {
      $escapedPassword = $appPassword.Replace("'", "''")
      & $psql -h $dbHost -p $dbPort -U $superUser -d postgres -v ON_ERROR_STOP=1 -c "CREATE ROLE $dbUser LOGIN PASSWORD '$escapedPassword'"
      if ($LASTEXITCODE -ne 0) { throw "No se pudo crear el usuario de base de datos." }
    }
    & $psql -h $dbHost -p $dbPort -U $superUser -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE $dbName OWNER $dbUser"
    if ($LASTEXITCODE -ne 0) { throw "No se pudo crear la base de datos." }
  }
} finally {
  $env:PGPASSWORD = $null
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($superPasswordPtr)
  $superPassword = $null
}

$encodedPassword = [Uri]::EscapeDataString($appPassword)
$databaseUrl = "postgresql://${dbUser}:${encodedPassword}@${dbHost}:${dbPort}/${dbName}"
$secretsPath = Join-Path $DataRoot "secrets\secrets.env"
$secrets = Read-PiccoloEnv $secretsPath
if (-not $secrets.ContainsKey("SESSION_SECRET")) { $secrets["SESSION_SECRET"] = New-PiccoloSecret }
if (-not $secrets.ContainsKey("QR_TABLE_HMAC_SECRET")) { $secrets["QR_TABLE_HMAC_SECRET"] = New-PiccoloSecret }
if (-not $secrets.ContainsKey("BOOTSTRAP_SECRET")) { $secrets["BOOTSTRAP_SECRET"] = New-PiccoloSecret }
$secrets["DATABASE_URL"] = $databaseUrl
Write-PiccoloEnv $secretsPath $secrets
Protect-PiccoloSecrets $secretsPath

$restaurantId = "piccolo-" + [Guid]::NewGuid().ToString("N").Substring(0, 12)
$configPath = Join-Path $DataRoot "config\piccolo.env"
$config = Read-PiccoloEnv $configPath
$config["PORT"] = "$apiPort"
$config["PICCOLO_VERSION"] = "0.9.0-rc.2"
$config["PICCOLO_ALLOW_AEAT_PRODUCTION"] = "false"
$config["PICCOLO_PRINT_CONNECTOR"] = "network"
if (-not $config.ContainsKey("RESTAURANT_ID")) { $config["RESTAURANT_ID"] = $restaurantId }
$config["ALLOWED_ORIGINS"] = "https://$hostName,http://localhost:$apiPort,http://127.0.0.1:$apiPort"
Write-PiccoloEnv $configPath $config

$caddyFile = Join-Path $DataRoot "config\Caddyfile"
@"
https://$hostName {
  tls internal
  reverse_proxy 127.0.0.1:$apiPort
  encode zstd gzip
}
"@ | Set-Content -LiteralPath $caddyFile -Encoding UTF8

Invoke-PiccoloMigration $AppRoot $DataRoot "apply"
Register-PiccoloTasks $AppRoot $DataRoot
New-NetFirewallRule -DisplayName "Piccolo TPV HTTPS" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 443 -Profile Private -ErrorAction SilentlyContinue | Out-Null
Start-PiccoloTasks
if (-not (Wait-PiccoloHealth $apiPort 120)) {
  throw "El servidor no respondió tras la instalación. Revisa $DataRoot\logs\server.log."
}

$state = @{
  version = "0.9.0-rc.2"
  channel = "release-candidate"
  configuredAt = (Get-Date -Format o)
  appRoot = $AppRoot
  dataRoot = $DataRoot
  serverUrl = "https://$hostName"
  productionCertified = $false
}
$state | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $DataRoot "install-state.json") -Encoding UTF8
Write-PiccoloLog $DataRoot "Configuración completada. Hardware aún pendiente de certificación física."
Start-Process "https://$hostName/setup"
Write-Host "Piccolo TPV 0.9.0-rc.2 instalado. NO usar para facturación fiscal real." -ForegroundColor Green
