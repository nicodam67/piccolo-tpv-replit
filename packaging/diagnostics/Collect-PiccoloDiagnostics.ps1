param(
  [string]$AppRoot = "$env:ProgramFiles\Piccolo TPV",
  [string]$DataRoot = "$env:ProgramData\PiccoloTPV",
  [string]$OutputDirectory = "$env:USERPROFILE\Desktop"
)

$ErrorActionPreference = "Stop"
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$temp = Join-Path $env:TEMP "Piccolo-Diagnostico-$stamp"
$output = Join-Path $OutputDirectory "Piccolo-Diagnostico-$stamp.zip"
New-Item -ItemType Directory -Force -Path $temp | Out-Null

function Redact([string]$text) {
  $text = $text -replace '(?i)(password|secret|token|authorization|cookie|certificate|database_url)\s*[=:]\s*[^\s,;]+', '$1=[REDACTED]'
  $text = $text -replace '(?i)postgres(?:ql)?://[^\s]+', 'postgresql://[REDACTED]'
  $text = $text -replace '(?i)Bearer\s+[A-Za-z0-9._~+/-]+=*', 'Bearer [REDACTED]'
  return $text
}

$versionFile = Join-Path $AppRoot "VERSION.txt"
$commitFile = Join-Path $AppRoot "COMMIT.txt"
$summary = [ordered]@{
  generatedAt = (Get-Date -Format o)
  warning = "VERSIÓN DE PRUEBAS — NO USAR PARA FACTURACIÓN FISCAL REAL"
  computerName = $env:COMPUTERNAME
  os = (Get-CimInstance Win32_OperatingSystem | Select-Object Caption, Version, OSArchitecture)
  version = if (Test-Path $versionFile) { (Get-Content $versionFile -Raw).Trim() } else { "unknown" }
  commit = if (Test-Path $commitFile) { (Get-Content $commitFile -Raw).Trim() } else { "unknown" }
}

try {
  $health = Invoke-RestMethod "http://127.0.0.1:8080/api/healthz" -TimeoutSec 5
  $summary.health = $health
} catch {
  $summary.health = @{ ok = $false; error = $_.Exception.Message }
}

$summary | ConvertTo-Json -Depth 6 | Set-Content (Join-Path $temp "system-summary.json") -Encoding UTF8

$stateFile = Join-Path $DataRoot "install-state.json"
if (Test-Path $stateFile) {
  Redact (Get-Content $stateFile -Raw) | Set-Content (Join-Path $temp "install-state-redacted.json") -Encoding UTF8
}

$logDir = Join-Path $DataRoot "logs"
if (Test-Path $logDir) {
  New-Item -ItemType Directory -Force -Path (Join-Path $temp "logs") | Out-Null
  Get-ChildItem $logDir -File | Where-Object { $_.Length -lt 50MB } | ForEach-Object {
    $safe = Redact ((Get-Content $_.FullName -Tail 500 -ErrorAction SilentlyContinue) -join "`n")
    $safe | Set-Content (Join-Path $temp "logs\$($_.Name).txt") -Encoding UTF8
  }
}

@"
Paquete de diagnóstico Piccolo.
No contiene secrets.env, piccolo.env, certificados, tokens ni copias de base de datos.
Entrega este ZIP al soporte junto con el paso exacto que falló.
"@ | Set-Content (Join-Path $temp "LEEME.txt") -Encoding UTF8

New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
Compress-Archive -Path "$temp\*" -DestinationPath $output -Force
Remove-Item $temp -Recurse -Force
Write-Host "Diagnóstico creado: $output" -ForegroundColor Green
