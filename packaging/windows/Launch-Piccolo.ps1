param(
  [Parameter(Mandatory = $true)][string]$Url,
  [ValidateSet("TPV", "KDS", "Fichaje")][string]$Profile = "TPV"
)

if ($Url -notmatch "^https://[A-Za-z0-9.:-]+(?:/.*)?$") {
  Add-Type -AssemblyName PresentationFramework
  [System.Windows.MessageBox]::Show(
    "La dirección Piccolo debe empezar por https://. Ejecuta Reparar para corregirla.",
    "Piccolo TPV",
    "OK",
    "Error"
  ) | Out-Null
  exit 1
}

$browser = @(
  "$env:ProgramFiles(x86)\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "$env:ProgramFiles(x86)\Google\Chrome\Application\chrome.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $browser) {
  Start-Process $Url
  exit 0
}

$arguments = @("--app=$Url", "--start-maximized")
if ($Profile -eq "KDS") { $arguments += "--kiosk" }
Start-Process -FilePath $browser -ArgumentList $arguments
