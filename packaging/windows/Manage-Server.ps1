param(
  [ValidateSet("Install", "Update", "Repair", "Uninstall")]
  [string]$Mode = "Install",
  [Parameter(Mandatory = $false)][string]$SourceRoot,
  [string]$AppRoot = "$env:ProgramFiles\Piccolo TPV",
  [string]$DataRoot = "$env:ProgramData\PiccoloTPV"
)

. (Join-Path $PSScriptRoot "Common.ps1")
Assert-Administrator
Initialize-PiccoloPaths $DataRoot
$statePath = Join-Path $DataRoot "install-state.json"

function Expand-PiccoloRuntime([string]$TargetRoot) {
  $nodeZip = Join-Path $TargetRoot "dependencies\node-win-x64.zip"
  $caddyZip = Join-Path $TargetRoot "dependencies\caddy-win-x64.zip"
  if (Test-Path $nodeZip) {
    $nodeTemp = Join-Path $TargetRoot "_node"
    Expand-Archive -LiteralPath $nodeZip -DestinationPath $nodeTemp -Force
    $nodeFolder = Get-ChildItem $nodeTemp -Directory | Select-Object -First 1
    Move-Item $nodeFolder.FullName (Join-Path $TargetRoot "node") -Force
    Remove-Item $nodeTemp -Recurse -Force
  }
  if (Test-Path $caddyZip) {
    Expand-Archive -LiteralPath $caddyZip -DestinationPath (Join-Path $TargetRoot "caddy") -Force
  }
  Remove-Item (Join-Path $TargetRoot "dependencies") -Recurse -Force -ErrorAction SilentlyContinue
}

function New-PreUpdateBackup {
  $secrets = Read-PiccoloEnv (Join-Path $DataRoot "secrets\secrets.env")
  if (-not $secrets.ContainsKey("DATABASE_URL")) { throw "No hay DATABASE_URL configurada; la actualización se ha cancelado." }
  $pgDump = Get-Command pg_dump.exe -ErrorAction SilentlyContinue
  if (-not $pgDump) {
    $pgDump = Get-ChildItem "$env:ProgramFiles\PostgreSQL\*\bin\pg_dump.exe" -ErrorAction SilentlyContinue |
      Sort-Object FullName -Descending | Select-Object -First 1
  }
  if (-not $pgDump) { throw "pg_dump no está disponible. No se actualizará sin una copia completa previa." }
  $uri = [Uri]$secrets["DATABASE_URL"]
  $userInfo = $uri.UserInfo.Split(":", 2)
  $env:PGPASSWORD = if ($userInfo.Length -gt 1) { [Uri]::UnescapeDataString($userInfo[1]) } else { "" }
  $user = [Uri]::UnescapeDataString($userInfo[0])
  $database = $uri.AbsolutePath.TrimStart("/")
  $backupPath = Join-Path $DataRoot "rollback\pre-update-$(Get-Date -Format yyyyMMdd-HHmmss).dump"
  try {
    & $pgDump.FullName -h $uri.Host -p $uri.Port -U $user -d $database -Fc -f $backupPath
    if ($LASTEXITCODE -ne 0) { throw "pg_dump falló; actualización cancelada sin cambios." }
  } finally { $env:PGPASSWORD = $null }
  $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $backupPath).Hash.ToLowerInvariant()
  Set-Content -LiteralPath "$backupPath.sha256" -Value "$hash  $(Split-Path $backupPath -Leaf)" -Encoding ASCII
  Write-PiccoloLog $DataRoot "Backup pre-update verificado: $(Split-Path $backupPath -Leaf)"
  return $backupPath
}

if ($Mode -eq "Uninstall") {
  Write-PiccoloLog $DataRoot "Desinstalación de aplicación solicitada; datos preservados."
  Remove-PiccoloTasks
  Remove-Item -LiteralPath $AppRoot -Recurse -Force -ErrorAction SilentlyContinue
  Write-Host "Aplicación eliminada. Los datos permanecen en $DataRoot." -ForegroundColor Green
  exit 0
}

Test-PiccoloSystemRequirements $AppRoot

if (-not $SourceRoot -or -not (Test-Path (Join-Path $SourceRoot "server\dist\index.mjs"))) {
  throw "Paquete de instalación incompleto."
}

$effectiveMode = $Mode
if ($Mode -eq "Install" -and (Test-Path $statePath)) {
  $choice = Read-Host "Se detectó una instalación anterior. Escribe ACTUALIZAR o REPARAR"
  if ($choice -eq "ACTUALIZAR") { $effectiveMode = "Update" }
  elseif ($choice -eq "REPARAR") { $effectiveMode = "Repair" }
  else { throw "Operación cancelada sin cambios." }
}

$rollbackApp = $null
try {
  if ($effectiveMode -eq "Update") {
    Write-PiccoloLog $DataRoot "Inicio de actualización aprobada por el propietario."
    $existingNode = Get-PiccoloNode $AppRoot
    $env:PICCOLO_APP_ROOT = $AppRoot
    $env:PICCOLO_DATA_ROOT = $DataRoot
    & $existingNode (Join-Path $AppRoot "runtime\preflight.mjs")
    if ($LASTEXITCODE -ne 0) {
      throw "Actualización bloqueada: cierra caja, impresiones/reintentos y backups en curso."
    }
    New-PreUpdateBackup | Out-Null
  } elseif ($effectiveMode -eq "Repair") {
    Write-PiccoloLog $DataRoot "Inicio de reparación; datos y secretos se preservan."
  } else {
    Write-PiccoloLog $DataRoot "Inicio de instalación nueva."
  }

  Stop-PiccoloTasks
  $newRoot = "$AppRoot.new"
  Remove-Item $newRoot -Recurse -Force -ErrorAction SilentlyContinue
  Copy-Item -LiteralPath $SourceRoot -Destination $newRoot -Recurse -Force
  Expand-PiccoloRuntime $newRoot

  if (Test-Path $AppRoot) {
    $rollbackApp = Join-Path $DataRoot "rollback\app-$(Get-Date -Format yyyyMMdd-HHmmss)"
    Move-Item -LiteralPath $AppRoot -Destination $rollbackApp
  }
  Move-Item -LiteralPath $newRoot -Destination $AppRoot

  if (Test-Path (Join-Path $DataRoot "secrets\secrets.env")) {
    Invoke-PiccoloMigration $AppRoot $DataRoot $(if ($effectiveMode -eq "Repair") { "check" } else { "apply" })
    Register-PiccoloTasks $AppRoot $DataRoot
    Start-PiccoloTasks
    $config = Read-PiccoloEnv (Join-Path $DataRoot "config\piccolo.env")
    $port = if ($config.ContainsKey("PORT")) { [int]$config["PORT"] } else { 8080 }
    if (-not (Wait-PiccoloHealth $port 120)) { throw "El servicio nuevo no superó el health check." }
  }

  @{
    version = "0.9.0-rc.1"
    channel = "release-candidate"
    installedAt = (Get-Date -Format o)
    mode = $effectiveMode
    dataPreserved = $true
    productionCertified = $false
  } | ConvertTo-Json | Set-Content -LiteralPath $statePath -Encoding UTF8
  Write-PiccoloLog $DataRoot "$effectiveMode completado correctamente."
} catch {
  Write-PiccoloLog $DataRoot "ERROR: $($_.Exception.Message)"
  Stop-PiccoloTasks
  if ($rollbackApp -and (Test-Path $rollbackApp)) {
    Remove-Item $AppRoot -Recurse -Force -ErrorAction SilentlyContinue
    Move-Item $rollbackApp $AppRoot
    Register-PiccoloTasks $AppRoot $DataRoot
    Start-PiccoloTasks
    Write-PiccoloLog $DataRoot "Archivos anteriores restaurados. El backup de base de datos queda disponible para restauración aprobada."
  }
  throw
}
