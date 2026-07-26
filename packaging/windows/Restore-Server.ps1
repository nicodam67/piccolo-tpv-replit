param(
  [string]$BackupPath,
  [string]$AppRoot = "$env:ProgramFiles\Piccolo TPV",
  [string]$DataRoot = "$env:ProgramData\PiccoloTPV"
)

. (Join-Path $PSScriptRoot "Common.ps1")
Assert-Administrator
Initialize-PiccoloPaths $DataRoot

if (-not $BackupPath) {
  Add-Type -AssemblyName System.Windows.Forms
  $dialog = New-Object System.Windows.Forms.OpenFileDialog
  $dialog.Title = "Selecciona una copia completa de Piccolo"
  $dialog.Filter = "Backup PostgreSQL (*.dump)|*.dump"
  if ($dialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { exit 0 }
  $BackupPath = $dialog.FileName
}
if (-not (Test-Path -LiteralPath $BackupPath)) { throw "La copia seleccionada no existe." }
$checksumPath = "$BackupPath.sha256"
if (-not (Test-Path $checksumPath)) { throw "Falta el checksum de la copia; no se restaurará." }
$expected = (Get-Content $checksumPath -First 1).Split(" ")[0].Trim().ToLowerInvariant()
$actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $BackupPath).Hash.ToLowerInvariant()
if ($expected -ne $actual) { throw "La integridad de la copia no es válida." }

$confirmation = Read-Host "Escribe RESTAURAR BASE DE DATOS para continuar"
if ($confirmation -ne "RESTAURAR BASE DE DATOS") { throw "Restauración cancelada sin cambios." }

$secrets = Read-PiccoloEnv (Join-Path $DataRoot "secrets\secrets.env")
if (-not $secrets.ContainsKey("DATABASE_URL")) { throw "Servidor no configurado." }
$uri = [Uri]$secrets["DATABASE_URL"]
$userInfo = $uri.UserInfo.Split(":", 2)
$user = [Uri]::UnescapeDataString($userInfo[0])
$password = if ($userInfo.Length -gt 1) { [Uri]::UnescapeDataString($userInfo[1]) } else { "" }
$database = $uri.AbsolutePath.TrimStart("/")
$pgBin = Get-ChildItem "$env:ProgramFiles\PostgreSQL\*\bin" -Directory -ErrorAction SilentlyContinue |
  Sort-Object FullName -Descending | Select-Object -First 1
if (-not $pgBin) { throw "No se encuentran pg_dump/pg_restore." }

$safetyBackup = Join-Path $DataRoot "rollback\pre-restore-$(Get-Date -Format yyyyMMdd-HHmmss).dump"
$env:PGPASSWORD = $password
try {
  & (Join-Path $pgBin.FullName "pg_dump.exe") -h $uri.Host -p $uri.Port -U $user -d $database -Fc -f $safetyBackup
  if ($LASTEXITCODE -ne 0) { throw "No se pudo crear la copia de seguridad previa." }
  $safetyHash = (Get-FileHash -Algorithm SHA256 $safetyBackup).Hash.ToLowerInvariant()
  Set-Content "$safetyBackup.sha256" "$safetyHash  $(Split-Path $safetyBackup -Leaf)" -Encoding ASCII
  Stop-PiccoloTasks
  & (Join-Path $pgBin.FullName "pg_restore.exe") -h $uri.Host -p $uri.Port -U $user -d $database --clean --if-exists --no-owner --exit-on-error $BackupPath
  if ($LASTEXITCODE -ne 0) {
    Write-PiccoloLog $DataRoot "Restauración fallida; recuperando estado previo."
    & (Join-Path $pgBin.FullName "pg_restore.exe") -h $uri.Host -p $uri.Port -U $user -d $database --clean --if-exists --no-owner --exit-on-error $safetyBackup
    throw "La restauración falló y se recuperó la copia previa."
  }
  Invoke-PiccoloMigration $AppRoot $DataRoot "check"
  Start-PiccoloTasks
  Write-PiccoloLog $DataRoot "Restauración completada y verificada."
} finally {
  $env:PGPASSWORD = $null
}
