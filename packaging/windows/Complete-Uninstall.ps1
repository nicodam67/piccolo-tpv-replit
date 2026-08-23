param(
  [string]$AppRoot = "$env:ProgramFiles\Piccolo TPV",
  [string]$DataRoot = "$env:ProgramData\PiccoloTPV"
)

. (Join-Path $PSScriptRoot "Common.ps1")
Assert-Administrator
Write-Host "ADVERTENCIA: esta opción elimina aplicación, configuración, uploads, backups locales y base de datos." -ForegroundColor Red
$confirmation = Read-Host "Escribe ELIMINAR PICCOLO Y TODOS LOS DATOS"
if ($confirmation -ne "ELIMINAR PICCOLO Y TODOS LOS DATOS") { throw "Desinstalación completa cancelada." }

$secrets = Read-PiccoloEnv (Join-Path $DataRoot "secrets\secrets.env")
if ($secrets.ContainsKey("DATABASE_URL")) {
  $uri = [Uri]$secrets["DATABASE_URL"]
  $userInfo = $uri.UserInfo.Split(":", 2)
  $user = [Uri]::UnescapeDataString($userInfo[0])
  $password = if ($userInfo.Length -gt 1) { [Uri]::UnescapeDataString($userInfo[1]) } else { "" }
  $database = $uri.AbsolutePath.TrimStart("/")
  $pgBin = Get-ChildItem "$env:ProgramFiles\PostgreSQL\*\bin" -Directory -ErrorAction SilentlyContinue |
    Sort-Object FullName -Descending | Select-Object -First 1
  if (-not $pgBin) { throw "No se puede crear la copia final; datos preservados." }
  $finalBackup = Join-Path ([Environment]::GetFolderPath("Desktop")) "piccolo-final-$(Get-Date -Format yyyyMMdd-HHmmss).dump"
  $env:PGPASSWORD = $password
  try {
    & (Join-Path $pgBin.FullName "pg_dump.exe") -h $uri.Host -p $uri.Port -U $user -d $database -Fc -f $finalBackup
    if ($LASTEXITCODE -ne 0) { throw "No se pudo crear la copia final; datos preservados." }
    $hash = (Get-FileHash -Algorithm SHA256 $finalBackup).Hash.ToLowerInvariant()
    Set-Content "$finalBackup.sha256" "$hash  $(Split-Path $finalBackup -Leaf)" -Encoding ASCII
    $drop = Read-Host "Copia final creada en Escritorio. Escribe ELIMINAR BASE DE DATOS para borrar '$database'"
    if ($drop -ne "ELIMINAR BASE DE DATOS") { throw "Base de datos preservada; desinstalación completa cancelada." }
    Stop-PiccoloTasks
    & (Join-Path $pgBin.FullName "dropdb.exe") -h $uri.Host -p $uri.Port -U $user --if-exists $database
    if ($LASTEXITCODE -ne 0) { throw "No se pudo eliminar la base de datos; archivos preservados." }
  } finally { $env:PGPASSWORD = $null }
}

Remove-PiccoloTasks
Remove-Item -LiteralPath $AppRoot -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $DataRoot -Recurse -Force -ErrorAction SilentlyContinue
Write-Host "Piccolo y sus datos locales se han eliminado. La copia final permanece en el Escritorio." -ForegroundColor Green
