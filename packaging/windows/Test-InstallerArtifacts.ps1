param([string]$ReleaseDirectory = "release/piccolo")

$ErrorActionPreference = "Stop"
$client = Join-Path $ReleaseDirectory "Piccolo-TPV-Setup.exe"
$server = Join-Path $ReleaseDirectory "Piccolo-Server-Setup.exe"
foreach ($file in @($client, $server)) {
  if (-not (Test-Path $file)) { throw "Falta $(Split-Path $file -Leaf)" }
  $bytes = [IO.File]::ReadAllBytes($file)
  if ($bytes.Length -lt 1024 -or $bytes[0] -ne 0x4D -or $bytes[1] -ne 0x5A) {
    throw "$(Split-Path $file -Leaf) no es un ejecutable Windows válido."
  }
}

$clientRoot = Join-Path $env:RUNNER_TEMP "PiccoloClientSmoke"
Remove-Item $clientRoot -Recurse -Force -ErrorAction SilentlyContinue
& $client /S "/D=$clientRoot"
if ($LASTEXITCODE -ne 0 -or -not (Test-Path "$clientRoot\Uninstall.exe")) {
  throw "Instalación silenciosa del cliente fallida."
}
& "$clientRoot\Uninstall.exe" /S

$serverRoot = Join-Path $env:RUNNER_TEMP "PiccoloServerSmoke"
Remove-Item $serverRoot -Recurse -Force -ErrorAction SilentlyContinue
& $server /S "/D=$serverRoot"
if ($LASTEXITCODE -ne 0 -or -not (Test-Path "$serverRoot\server\dist\index.mjs")) {
  throw "Instalación silenciosa del servidor fallida."
}
if (-not (Test-Path "$serverRoot\node\node.exe") -or -not (Test-Path "$serverRoot\caddy\caddy.exe")) {
  throw "El servidor no contiene los runtimes verificados."
}
& "$serverRoot\Uninstall.exe" /S

$manifest = Get-Content (Join-Path $ReleaseDirectory "artifact-manifest.json") -Raw | ConvertFrom-Json
foreach ($artifact in $manifest.artifacts) {
  $actual = (Get-FileHash -Algorithm SHA256 (Join-Path $ReleaseDirectory $artifact.path)).Hash.ToLowerInvariant()
  if ($actual -ne $artifact.sha256) { throw "Checksum incorrecto: $($artifact.path)" }
}
Write-Host "Install/update payload, uninstall and checksums passed."
