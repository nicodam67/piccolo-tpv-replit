param([string]$ReleaseDirectory = "release/piccolo")

$ErrorActionPreference = "Stop"
if (-not $env:WINDOWS_SIGNING_PFX -or -not $env:WINDOWS_SIGNING_PASSWORD) {
  @"
UNSIGNED
No existe certificado Authenticode configurado.
Windows puede mostrar una advertencia de editor desconocido.
No se inventa ni simula una firma válida.
"@ | Set-Content (Join-Path $ReleaseDirectory "SIGNING-STATUS.txt") -Encoding UTF8
  node scripts/refresh-release-manifest.mjs
  exit 0
}

$certificate = Join-Path $env:RUNNER_TEMP "piccolo-signing.pfx"
[IO.File]::WriteAllBytes($certificate, [Convert]::FromBase64String($env:WINDOWS_SIGNING_PFX))
$signtool = Get-ChildItem "${env:ProgramFiles(x86)}\Windows Kits\10\bin\*\x64\signtool.exe" |
  Sort-Object FullName -Descending | Select-Object -First 1
if (-not $signtool) { throw "signtool.exe no encontrado." }

try {
  Get-ChildItem $ReleaseDirectory -Filter "*.exe" | ForEach-Object {
    & $signtool.FullName sign /fd SHA256 /f $certificate /p $env:WINDOWS_SIGNING_PASSWORD /tr http://timestamp.digicert.com /td SHA256 $_.FullName
    if ($LASTEXITCODE -ne 0) { throw "Firma Authenticode fallida: $($_.Name)" }
    & $signtool.FullName verify /pa $_.FullName
    if ($LASTEXITCODE -ne 0) { throw "Verificación Authenticode fallida: $($_.Name)" }
  }
  "SIGNED: Authenticode verificado por CI." | Set-Content (Join-Path $ReleaseDirectory "SIGNING-STATUS.txt") -Encoding UTF8
  node scripts/refresh-release-manifest.mjs --signed
} finally {
  Remove-Item $certificate -Force -ErrorAction SilentlyContinue
}
