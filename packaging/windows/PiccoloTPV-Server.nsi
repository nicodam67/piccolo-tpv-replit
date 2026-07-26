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
!ifndef STAGE_DIR
  !define STAGE_DIR "..\..\release\piccolo\staging"
!endif

Name "Piccolo TPV Servidor ${VERSION} — Solo para pruebas"
OutFile "${OUTPUT_DIR}\Piccolo-Server-Setup.exe"
InstallDir "$PROGRAMFILES64\Piccolo TPV"
RequestExecutionLevel admin
SetCompressor /SOLID lzma
ShowInstDetails show
ShowUninstDetails show

!define MUI_ABORTWARNING
!insertmacro MUI_PAGE_WELCOME
Page custom ModePageCreate ModePageLeave
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "Spanish"

Var InstallMode
Var RadioInstall
Var RadioUpdate
Var RadioRepair
Var RadioRestore
Var ProgramData

Function .onInit
  ${IfNot} ${RunningX64}
    MessageBox MB_ICONSTOP "Piccolo TPV Server requiere Windows 10/11 de 64 bits."
    Abort
  ${EndIf}
  StrCpy $InstallMode "Install"
  ReadEnvStr $ProgramData "ProgramData"
  IfFileExists "$ProgramData\PiccoloTPV\install-state.json" 0 +2
    StrCpy $InstallMode "Update"
FunctionEnd

Function ModePageCreate
  nsDialogs::Create 1018
  Pop $0
  ${NSD_CreateLabel} 0 0 100% 24u "Selecciona una operación. Ninguna opción borra datos sin una confirmación adicional."
  Pop $0
  ${NSD_CreateRadioButton} 0 30u 100% 12u "Instalación nueva"
  Pop $RadioInstall
  ${NSD_CreateRadioButton} 0 50u 100% 12u "Actualizar (backup obligatorio y rollback de archivos)"
  Pop $RadioUpdate
  ${NSD_CreateRadioButton} 0 70u 100% 12u "Reparar (preserva datos y secretos)"
  Pop $RadioRepair
  ${NSD_CreateRadioButton} 0 90u 100% 12u "Restaurar desde backup verificado"
  Pop $RadioRestore
  ${If} $InstallMode == "Update"
    ${NSD_Check} $RadioUpdate
  ${Else}
    ${NSD_Check} $RadioInstall
  ${EndIf}
  nsDialogs::Show
FunctionEnd

Function ModePageLeave
  ${NSD_GetState} $RadioInstall $0
  ${If} $0 == ${BST_CHECKED}
    StrCpy $InstallMode "Install"
  ${EndIf}
  ${NSD_GetState} $RadioUpdate $0
  ${If} $0 == ${BST_CHECKED}
    StrCpy $InstallMode "Update"
  ${EndIf}
  ${NSD_GetState} $RadioRepair $0
  ${If} $0 == ${BST_CHECKED}
    StrCpy $InstallMode "Repair"
  ${EndIf}
  ${NSD_GetState} $RadioRestore $0
  ${If} $0 == ${BST_CHECKED}
    StrCpy $InstallMode "Restore"
  ${EndIf}
FunctionEnd

Section "Servidor Piccolo" SecServer
  ${If} $InstallMode == "Restore"
    IfFileExists "$INSTDIR\installer\Restore-Server.ps1" 0 restore_missing
    ExecWait '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\installer\Restore-Server.ps1" -AppRoot "$INSTDIR"' $0
    ${If} $0 != 0
      Abort "La restauración no finalizó correctamente."
    ${EndIf}
    Goto install_done
    restore_missing:
      MessageBox MB_ICONSTOP "No existe una instalación que restaurar."
      Abort
  ${EndIf}

  SetOutPath "$PLUGINSDIR\payload"
  File /r "${STAGE_DIR}\*"
  ExecWait '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "$PLUGINSDIR\payload\app\installer\Manage-Server.ps1" -Mode $InstallMode -SourceRoot "$PLUGINSDIR\payload\app" -AppRoot "$INSTDIR"' $0
  ${If} $0 != 0
    MessageBox MB_ICONSTOP "La operación falló sin borrar los datos. Consulta $ProgramData\PiccoloTPV\logs\installer.log"
    Abort
  ${EndIf}

  WriteUninstaller "$INSTDIR\Uninstall.exe"
  CreateDirectory "$SMPROGRAMS\Piccolo TPV Server"
  CreateShortCut "$SMPROGRAMS\Piccolo TPV Server\Configurar servidor.lnk" "$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" '-NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\installer\Configure-Server.ps1" -AppRoot "$INSTDIR"'
  CreateShortCut "$SMPROGRAMS\Piccolo TPV Server\Restaurar backup.lnk" "$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" '-NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\installer\Restore-Server.ps1" -AppRoot "$INSTDIR"'
  CreateShortCut "$SMPROGRAMS\Piccolo TPV Server\Desinstalación completa (PELIGRO).lnk" "$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" '-NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\installer\Complete-Uninstall.ps1" -AppRoot "$INSTDIR"'
  CreateShortCut "$SMPROGRAMS\Piccolo TPV Server\Desinstalar conservando datos.lnk" "$INSTDIR\Uninstall.exe"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\PiccoloTPVServer" "DisplayName" "Piccolo TPV Server ${VERSION}"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\PiccoloTPVServer" "DisplayVersion" "${VERSION}"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\PiccoloTPVServer" "Publisher" "Piccolo TPV"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\PiccoloTPVServer" "UninstallString" "$INSTDIR\Uninstall.exe"

  ${If} $InstallMode == "Install"
    IfSilent +2 0
      ExecShell "open" "$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" '-NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\installer\Configure-Server.ps1" -AppRoot "$INSTDIR"'
  ${EndIf}
  install_done:
SectionEnd

Section "Uninstall"
  ExecWait '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\installer\Manage-Server.ps1" -Mode Uninstall -AppRoot "$INSTDIR"' $0
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\PiccoloTPVServer"
  RMDir /r "$SMPROGRAMS\Piccolo TPV Server"
  RMDir /r "$INSTDIR"
SectionEnd
