Unicode true
RequestExecutionLevel admin
SetCompressor /SOLID lzma
SetCompressorDictSize 32
ManifestDPIAware true
!include "LogicLib.nsh"

!ifndef VERSION
  !define VERSION "0.1.0"
!endif
!ifndef BINARY
  !error "BINARY is required"
!endif
!ifndef OUTPUT
  !define OUTPUT "Piccolo-Print-Agent-Windows-${VERSION}.exe"
!endif

!define PRODUCT "Piccolo Print Agent"
!define SERVICE "PiccoloPrintAgent"
!define UNINSTALL_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\PiccoloPrintAgent"

Name "${PRODUCT} ${VERSION}"
OutFile "${OUTPUT}"
InstallDir "$PROGRAMFILES64\Piccolo\PrintAgent"
InstallDirRegKey HKLM "${UNINSTALL_KEY}" "InstallLocation"
ShowInstDetails show
ShowUninstDetails show

VIProductVersion "${VERSION}.0"
VIAddVersionKey /LANG=1034 "ProductName" "${PRODUCT}"
VIAddVersionKey /LANG=1034 "FileDescription" "Agente Windows de impresión ESC/POS para Piccolo"
VIAddVersionKey /LANG=1034 "FileVersion" "${VERSION}"
VIAddVersionKey /LANG=1034 "ProductVersion" "${VERSION}"
VIAddVersionKey /LANG=1034 "CompanyName" "Piccolo"
VIAddVersionKey /LANG=1034 "LegalCopyright" "Copyright Piccolo"

Page directory
Page instfiles
UninstPage uninstConfirm
UninstPage instfiles

Section "Piccolo Print Agent" SEC_MAIN
  SetShellVarContext all
  nsExec::ExecToLog '"$SYSDIR\net.exe" stop "${SERVICE}" /y'

  SetOutPath "$INSTDIR"
  File /oname=piccolo-print-agent.exe "${BINARY}"
  WriteUninstaller "$INSTDIR\uninstall.exe"

  CreateDirectory "$APPDATA\Piccolo\PrintAgent"
  nsExec::ExecToLog '"$SYSDIR\icacls.exe" "$APPDATA\Piccolo\PrintAgent" /inheritance:r /grant:r "*S-1-5-18:(OI)(CI)F" "*S-1-5-32-544:(OI)(CI)F"'

  nsExec::ExecToLog '"$SYSDIR\sc.exe" query "${SERVICE}"'
  Pop $0
  ${If} $0 != 0
    nsExec::ExecToStack '"$SYSDIR\sc.exe" create "${SERVICE}" binPath= "\"$INSTDIR\piccolo-print-agent.exe\" run" DisplayName= "${PRODUCT}" start= auto'
    Pop $0
    Pop $1
    ${If} $0 != 0
      MessageBox MB_ICONSTOP|MB_OK "No se pudo registrar el servicio (${SERVICE}).$\r$\n$1"
      Abort
    ${EndIf}
  ${Else}
    nsExec::ExecToStack '"$SYSDIR\sc.exe" config "${SERVICE}" binPath= "\"$INSTDIR\piccolo-print-agent.exe\" run" DisplayName= "${PRODUCT}" start= auto'
    Pop $0
    Pop $1
    ${If} $0 != 0
      MessageBox MB_ICONSTOP|MB_OK "No se pudo actualizar el servicio (${SERVICE}).$\r$\n$1"
      Abort
    ${EndIf}
  ${EndIf}
  WriteRegDWORD HKLM "SYSTEM\CurrentControlSet\Services\${SERVICE}" "DelayedAutostart" 1
  nsExec::ExecToLog '"$SYSDIR\sc.exe" description "${SERVICE}" "Entrega trabajos ESC/POS de Piccolo a impresoras configuradas localmente."'
  nsExec::ExecToLog '"$SYSDIR\sc.exe" failure "${SERVICE}" reset= 86400 actions= restart/5000/restart/15000/restart/60000'
  nsExec::ExecToLog '"$SYSDIR\sc.exe" failureflag "${SERVICE}" 1'

  CreateDirectory "$SMPROGRAMS\Piccolo Print Agent"
  CreateShortcut "$SMPROGRAMS\Piccolo Print Agent\Configurar.lnk" "$INSTDIR\piccolo-print-agent.exe" "configure"
  CreateShortcut "$SMPROGRAMS\Piccolo Print Agent\Diagnóstico.lnk" "$INSTDIR\piccolo-print-agent.exe" "diagnostics"
  CreateShortcut "$SMPROGRAMS\Piccolo Print Agent\Desinstalar.lnk" "$INSTDIR\uninstall.exe"

  WriteRegStr HKLM "${UNINSTALL_KEY}" "DisplayName" "${PRODUCT}"
  WriteRegStr HKLM "${UNINSTALL_KEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKLM "${UNINSTALL_KEY}" "Publisher" "Piccolo"
  WriteRegStr HKLM "${UNINSTALL_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKLM "${UNINSTALL_KEY}" "UninstallString" '"$INSTDIR\uninstall.exe"'
  WriteRegDWORD HKLM "${UNINSTALL_KEY}" "NoModify" 1
  WriteRegDWORD HKLM "${UNINSTALL_KEY}" "NoRepair" 1

  IfFileExists "$APPDATA\Piccolo\PrintAgent\config.json" configured not_configured
  not_configured:
    MessageBox MB_ICONINFORMATION|MB_OK "Ejecute «Configurar» como administrador antes de iniciar el servicio."
    Goto done
  configured:
    nsExec::ExecToLog '"$SYSDIR\sc.exe" start "${SERVICE}"'
  done:
SectionEnd

Section "Uninstall"
  SetShellVarContext all
  nsExec::ExecToLog '"$SYSDIR\net.exe" stop "${SERVICE}" /y'
  nsExec::ExecToLog '"$SYSDIR\sc.exe" delete "${SERVICE}"'

  Delete "$SMPROGRAMS\Piccolo Print Agent\Configurar.lnk"
  Delete "$SMPROGRAMS\Piccolo Print Agent\Diagnóstico.lnk"
  Delete "$SMPROGRAMS\Piccolo Print Agent\Desinstalar.lnk"
  RMDir "$SMPROGRAMS\Piccolo Print Agent"
  DeleteRegKey HKLM "${UNINSTALL_KEY}"

  Delete "$INSTDIR\piccolo-print-agent.exe"
  Delete "$INSTDIR\uninstall.exe"
  RMDir "$INSTDIR"

  MessageBox MB_ICONQUESTION|MB_YESNO|MB_DEFBUTTON2 \
    "¿Eliminar también configuración, token cifrado, logs y recibos de $APPDATA\Piccolo\PrintAgent?" \
    IDNO keep_data
  RMDir /r "$APPDATA\Piccolo\PrintAgent"
  RMDir "$APPDATA\Piccolo"
  keep_data:
SectionEnd
