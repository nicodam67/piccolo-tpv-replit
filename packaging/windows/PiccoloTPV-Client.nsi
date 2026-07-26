Unicode true
!include "MUI2.nsh"
!include "nsDialogs.nsh"
!include "LogicLib.nsh"
!include "x64.nsh"

!ifndef VERSION
  !define VERSION "0.9.0-rc.1"
!endif
!ifndef OUTPUT_DIR
  !define OUTPUT_DIR "..\..\release\piccolo"
!endif
!ifndef PACKAGING_DIR
  !define PACKAGING_DIR "."
!endif

Name "Piccolo TPV ${VERSION} — Solo para pruebas"
OutFile "${OUTPUT_DIR}\Piccolo-TPV-Setup.exe"
InstallDir "$LOCALAPPDATA\Programs\Piccolo TPV"
RequestExecutionLevel user
SetCompressor /SOLID lzma
ShowInstDetails show
ShowUninstDetails show

!define MUI_ABORTWARNING
!define MUI_FINISHPAGE_RUN
!define MUI_FINISHPAGE_RUN_TEXT "Abrir Piccolo TPV"
!define MUI_FINISHPAGE_RUN_FUNCTION LaunchPiccolo
!insertmacro MUI_PAGE_WELCOME
Page custom ServerPageCreate ServerPageLeave
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "Spanish"

Var ServerUrl
Var ServerUrlField
Var InstallLog

Function .onInit
  ${IfNot} ${RunningX64}
    MessageBox MB_ICONSTOP "Piccolo TPV requiere Windows de 64 bits."
    Abort
  ${EndIf}
  StrCpy $ServerUrl "https://piccolo.local"
FunctionEnd

Function ServerPageCreate
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}
  ${NSD_CreateLabel} 0 0 100% 24u "Dirección segura del servidor Piccolo (proporcionada por el instalador del servidor):"
  Pop $0
  ${NSD_CreateText} 0 30u 100% 13u "$ServerUrl"
  Pop $ServerUrlField
  ${NSD_CreateLabel} 0 52u 100% 32u "No se guardan contraseñas ni tokens. La dirección debe empezar por https://."
  Pop $0
  nsDialogs::Show
FunctionEnd

Function ServerPageLeave
  ${NSD_GetText} $ServerUrlField $ServerUrl
  ${If} $ServerUrl == ""
    MessageBox MB_ICONEXCLAMATION "Introduce la dirección del servidor."
    Abort
  ${EndIf}
  StrCpy $0 $ServerUrl 8
  ${If} $0 != "https://"
    MessageBox MB_ICONEXCLAMATION "La dirección debe empezar por https://"
    Abort
  ${EndIf}
FunctionEnd

Section "Piccolo TPV" SecClient
  SetOutPath "$INSTDIR"
  File "${PACKAGING_DIR}\Launch-Piccolo.ps1"
  FileOpen $InstallLog "$INSTDIR\install.log" a
  FileWrite $InstallLog "$\r$\nPiccolo TPV ${VERSION} instalado en $INSTDIR$\r$\nServidor: $ServerUrl$\r$\n"
  FileClose $InstallLog
  FileOpen $0 "$INSTDIR\server-url.txt" w
  FileWrite $0 "$ServerUrl"
  FileClose $0
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  CreateDirectory "$SMPROGRAMS\Piccolo TPV"
  CreateShortCut "$DESKTOP\Piccolo TPV.lnk" "$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" '-NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\Launch-Piccolo.ps1" -Url "$ServerUrl" -Profile TPV'
  CreateShortCut "$SMPROGRAMS\Piccolo TPV\Piccolo TPV.lnk" "$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" '-NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\Launch-Piccolo.ps1" -Url "$ServerUrl" -Profile TPV'
  CreateShortCut "$SMPROGRAMS\Piccolo TPV\Desinstalar.lnk" "$INSTDIR\Uninstall.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\PiccoloTPVClient" "DisplayName" "Piccolo TPV ${VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\PiccoloTPVClient" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\PiccoloTPVClient" "Publisher" "Piccolo TPV"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\PiccoloTPVClient" "UninstallString" "$INSTDIR\Uninstall.exe"
SectionEnd

Function LaunchPiccolo
  ExecShell "open" "$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" '-NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\Launch-Piccolo.ps1" -Url "$ServerUrl" -Profile TPV'
FunctionEnd

Section "Uninstall"
  Delete "$DESKTOP\Piccolo TPV.lnk"
  RMDir /r "$SMPROGRAMS\Piccolo TPV"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\PiccoloTPVClient"
  RMDir /r "$INSTDIR"
SectionEnd
