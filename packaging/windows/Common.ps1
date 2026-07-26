Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Assert-Administrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Piccolo requiere ejecutar este configurador como administrador."
  }
}

function Test-PiccoloSystemRequirements([string]$InstallPath) {
  $os = Get-CimInstance Win32_OperatingSystem
  if ([Environment]::OSVersion.Version.Major -lt 10) {
    throw "Piccolo requiere Windows 10 22H2 o Windows 11 de 64 bits."
  }
  $memoryGb = [math]::Round($os.TotalVisibleMemorySize / 1MB, 1)
  if ($memoryGb -lt 4) { throw "Memoria insuficiente: se requieren al menos 4 GB (8 GB recomendados)." }
  if ($memoryGb -lt 8) { Write-Warning "Se recomiendan 8 GB de RAM." }
  $qualifier = Split-Path -Qualifier $InstallPath
  $driveName = $qualifier.TrimEnd(":\")
  $drive = Get-PSDrive -Name $driveName
  if ($drive.Free -lt 10GB) { throw "Espacio insuficiente: se requieren al menos 10 GB libres." }
}

function Initialize-PiccoloPaths([string]$DataRoot) {
  @("config", "secrets", "backups", "uploads", "logs", "rollback", "staging") |
    ForEach-Object { New-Item -ItemType Directory -Force -Path (Join-Path $DataRoot $_) | Out-Null }
}

function Write-PiccoloLog([string]$DataRoot, [string]$Message) {
  $logPath = Join-Path $DataRoot "logs\installer.log"
  $line = "$(Get-Date -Format o) $Message"
  Add-Content -LiteralPath $logPath -Value $line -Encoding UTF8
  Write-Host $Message
}

function New-PiccoloSecret([int]$Bytes = 48) {
  $buffer = New-Object byte[] $Bytes
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($buffer) } finally { $rng.Dispose() }
  return [Convert]::ToBase64String($buffer)
}

function Protect-PiccoloSecrets([string]$FilePath) {
  & icacls.exe $FilePath /inheritance:r /grant:r "SYSTEM:F" "Administrators:F" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "No se pudieron proteger las credenciales." }
}

function Read-PiccoloEnv([string]$FilePath) {
  $values = @{}
  if (-not (Test-Path -LiteralPath $FilePath)) { return $values }
  foreach ($line in Get-Content -LiteralPath $FilePath) {
    if ($line -match "^\s*([^#][A-Za-z0-9_]+)\s*=(.*)$") {
      $values[$Matches[1]] = $Matches[2].Trim().Trim('"').Trim("'")
    }
  }
  return $values
}

function Write-PiccoloEnv([string]$FilePath, [hashtable]$Values) {
  $content = $Values.GetEnumerator() |
    Sort-Object Name |
    ForEach-Object { "$($_.Name)=$($_.Value)" }
  Set-Content -LiteralPath $FilePath -Value $content -Encoding UTF8
}

function Get-PiccoloNode([string]$AppRoot) {
  $node = Join-Path $AppRoot "node\node.exe"
  if (-not (Test-Path -LiteralPath $node)) { throw "Runtime Node de Piccolo no encontrado." }
  return $node
}

function Invoke-PiccoloMigration(
  [string]$AppRoot,
  [string]$DataRoot,
  [ValidateSet("apply", "check")][string]$Mode
) {
  $node = Get-PiccoloNode $AppRoot
  $env:PICCOLO_APP_ROOT = $AppRoot
  $env:PICCOLO_DATA_ROOT = $DataRoot
  & $node (Join-Path $AppRoot "runtime\migrate.mjs") $Mode
  if ($LASTEXITCODE -ne 0) { throw "La validación de migraciones ha fallado." }
}

function Register-PiccoloTasks([string]$AppRoot, [string]$DataRoot) {
  $node = Get-PiccoloNode $AppRoot
  $serverLog = Join-Path $DataRoot "logs\server.log"
  $serverArgs = "/d /s /c `"`"`"$node`" `"`$(Join-Path $AppRoot 'runtime\launch.mjs')`" >> `"$serverLog`" 2>&1`""
  $serverAction = New-ScheduledTaskAction -Execute "$env:ComSpec" -Argument $serverArgs -WorkingDirectory $AppRoot
  $trigger = New-ScheduledTaskTrigger -AtStartup
  $settings = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable
  Register-ScheduledTask -TaskName "PiccoloTPVServer" -Action $serverAction -Trigger $trigger -Settings $settings -User "SYSTEM" -RunLevel Highest -Force | Out-Null

  $caddy = Join-Path $AppRoot "caddy\caddy.exe"
  $caddyFile = Join-Path $DataRoot "config\Caddyfile"
  $caddyLog = Join-Path $DataRoot "logs\caddy.log"
  if (Test-Path -LiteralPath $caddy) {
    $caddyData = Join-Path $DataRoot "caddy"
    New-Item -ItemType Directory -Force -Path $caddyData | Out-Null
    $caddyCommand = "`$env:XDG_DATA_HOME='$caddyData'; & '$caddy' run --config '$caddyFile' *>> '$caddyLog'"
    $caddyArgs = "-NoProfile -NonInteractive -WindowStyle Hidden -Command `"$caddyCommand`""
    $caddyAction = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $caddyArgs -WorkingDirectory (Split-Path $caddy)
    Register-ScheduledTask -TaskName "PiccoloTPVCaddy" -Action $caddyAction -Trigger $trigger -Settings $settings -User "SYSTEM" -RunLevel Highest -Force | Out-Null
  }
}

function Stop-PiccoloTasks {
  foreach ($name in @("PiccoloTPVCaddy", "PiccoloTPVServer")) {
    if (Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue) {
      Stop-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
    }
  }
}

function Remove-PiccoloTasks {
  Stop-PiccoloTasks
  foreach ($name in @("PiccoloTPVCaddy", "PiccoloTPVServer")) {
    Unregister-ScheduledTask -TaskName $name -Confirm:$false -ErrorAction SilentlyContinue
  }
}

function Start-PiccoloTasks {
  if (Get-ScheduledTask -TaskName "PiccoloTPVServer" -ErrorAction SilentlyContinue) {
    Start-ScheduledTask -TaskName "PiccoloTPVServer"
  }
  if (Get-ScheduledTask -TaskName "PiccoloTPVCaddy" -ErrorAction SilentlyContinue) {
    Start-ScheduledTask -TaskName "PiccoloTPVCaddy"
  }
}

function Wait-PiccoloHealth([int]$Port = 8080, [int]$TimeoutSeconds = 120) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    try {
      $response = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$Port/api/healthz" -TimeoutSec 3
      if ($response.StatusCode -eq 200) { return $true }
    } catch { Start-Sleep -Seconds 2 }
  } while ((Get-Date) -lt $deadline)
  return $false
}
