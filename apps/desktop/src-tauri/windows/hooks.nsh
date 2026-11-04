; The engine runs beside terminus.exe and outlives the window. Before removing it,
; the uninstaller asks it for `service stop`, which it refuses with live turns;
; then the uninstaller stops instead of cutting them. Only a silent engine is killed.
; NSIS is 32-bit: its PowerShell cannot read Process.Path of the 64-bit engine, WMI can.
!macro TERMINUS_KILL_ENGINE
  nsExec::Exec `powershell -NoProfile -NonInteractive -Command "Get-CimInstance Win32_Process | Where-Object { $$_.Name -eq 'seldon-runtime.exe' -and $$_.ExecutablePath -like '$INSTDIR\*' } | ForEach-Object { Stop-Process -Id $$_.ProcessId -Force }"`
  Pop $0
!macroend

; `terminus.exe --stop-engine` exits 0 when it stopped, 3 when the engine is working, 1 when it did not answer.
!macro TERMINUS_STOP_ENGINE STOPPER
  nsExec::Exec `"${STOPPER}" --stop-engine`
  Pop $0
  ${If} $0 == 3
    MessageBox MB_OK|MB_ICONEXCLAMATION "Danil is still working on a task. Let it finish, or stop it, and run this again.$\r$\n$\r$\nDanil sigue trabajando en una tarea. Deja que termine, o detenla, y vuelve a ejecutar esto." /SD IDOK
    Abort
  ${ElseIf} $0 != 0
    !insertmacro TERMINUS_KILL_ENGINE
  ${EndIf}
!macroend

!macro TERMINUS_SWEEP
  Delete "$INSTDIR\old_*seldon-runtime.exe"
  ${IfNot} ${FileExists} "$INSTDIR\old_*seldon-runtime.exe"
    Delete "$INSTDIR\old_*.exe"
  ${EndIf}
!macroend

; Windows renames a running .exe but does not overwrite it: what is open keeps
; running from old_*, and the app removes those files when it starts again.
; Window and engine share one prefix: a set-aside engine still working is reopened
; with its own window, so that window stays while any set-aside engine is left.
!macro TERMINUS_SET_ASIDE WINDOW
  !insertmacro TERMINUS_SWEEP
  StrCpy $R8 "$INSTDIR\old_"
  ${If} ${FileExists} "$INSTDIR\old_${WINDOW}"
  ${OrIf} ${FileExists} "$INSTDIR\old_seldon-runtime.exe"
    System::Call 'kernel32::GetTickCount()i.R9'
    StrCpy $R8 "$INSTDIR\old_$R9_"
  ${EndIf}
  ${If} ${FileExists} "$INSTDIR\${WINDOW}"
    Rename "$INSTDIR\${WINDOW}" "$R8${WINDOW}"
  ${EndIf}
  ${If} ${FileExists} "$INSTDIR\seldon-runtime.exe"
    Rename "$INSTDIR\seldon-runtime.exe" "$R8seldon-runtime.exe"
  ${EndIf}
!macroend

; The template kills the app before installing. Installing sets the files aside
; instead; only a real uninstall closes it. An installer replacing this copy
; runs the uninstaller in place (`_?=$INSTDIR`); Settings runs a temporary copy.
; Since CLI 2.12 the template passes the full path; set-aside and process lookup need the file name.
!macroundef CheckIfAppIsRunning
!macro CheckIfAppIsRunning executablePath productName
  !ifdef __UNINSTALL__
    ${If} $EXEDIR == $INSTDIR
      !insertmacro TERMINUS_SET_ASIDE "${MAINBINARYNAME}.exe"
    ${Else}
      nsis_tauri_utils::FindProcessCurrentUser "${MAINBINARYNAME}.exe"
      Pop $R0
      ${If} $R0 = 0
        nsis_tauri_utils::StrReplace "$(appRunningOkKill)" "{{product_name}}" "${productName}"
        Pop $R2
        MessageBox MB_OKCANCEL $R2 /SD IDOK IDOK +2
        Abort
        nsis_tauri_utils::KillProcessCurrentUser "${MAINBINARYNAME}.exe"
        Pop $R0
        Sleep 500
      ${EndIf}
      ; The window restarts the engine that PREUNINSTALL stopped; that one has no turns yet.
      !insertmacro TERMINUS_KILL_ENGINE
    ${EndIf}
  !endif
!macroend

; Hasta la 0.2.x la app se instalaba como «Terminus»: `…\Uninstall\Terminus`,
; `Software\<fabricante>\Terminus` y `%LOCALAPPDATA%\Terminus`. Desde la 0.3.0 el
; productName es Danil y el template usaría otra clave y otra carpeta: dos apps y
; dos entradas en Agregar o quitar programas. Si esa copia existe, se instala en
; su carpeta (su ventana y su motor pueden seguir corriendo desde ahí, apartados
; como old_*), y al terminar se retira su entrada y sus accesos pasan a llamarse Danil.
; Las actualizaciones siguientes la encuentran por la clave Danil, con la misma carpeta.
; Se queda en TODAS las releases: latest.json lleva una 0.2.x directo a la última.
; `scripts/guards/product-name.mjs` falla si se pierde mientras productName no sea este.
!define TERMINUS_LEGACY_PRODUCTNAME "Terminus"

; La carpeta se decide en .onInit, antes de la página de carpeta y de que
; `Section Install` haga SetOutPath: el template llama a SetContext justo antes de
; poner la carpeta por omisión, y solo la pone si $INSTDIR sigue en el marcador.
; MANUKEY y PLACEHOLDER_INSTALL_DIR se definen después de incluir este archivo;
; se expanden al insertar la macro.
!macroundef SetContext
!macro SetContext
  !if "${INSTALLMODE}" == "currentUser"
    SetShellVarContext current
  !else if "${INSTALLMODE}" == "perMachine"
    SetShellVarContext all
  !endif

  ${If} ${RunningX64}
    !if "${ARCH}" == "x64"
      SetRegView 64
    !else if "${ARCH}" == "arm64"
      SetRegView 64
    !else
      SetRegView 32
    !endif
  ${EndIf}

  !ifndef __UNINSTALL__
    !insertmacro TERMINUS_ADOPT_LEGACY
  !endif
!macroend

; Sin `/D=` (el marcador sigue), sin copia Danil y con la vieja en disco.
; Se lee la clave del fabricante: guarda la carpeta sin comillas, al contrario
; que `InstallLocation`.
!macro TERMINUS_ADOPT_LEGACY
  ${If} $INSTDIR == "${PLACEHOLDER_INSTALL_DIR}"
    ReadRegStr $R7 SHCTX "${MANUPRODUCTKEY}" ""
    ${If} $R7 == ""
      ReadRegStr $R7 SHCTX "${MANUKEY}\${TERMINUS_LEGACY_PRODUCTNAME}" ""
      ${If} $R7 != ""
      ${AndIf} ${FileExists} "$R7\${MAINBINARYNAME}.exe"
        StrCpy $INSTDIR $R7
      ${EndIf}
    ${EndIf}
  ${EndIf}
!macroend

; Un acceso viejo que abre este terminus.exe pasa a llamarse Danil. En una
; actualización (`/UPDATE`) el template no crea accesos: renombrar es lo que deja
; uno. Si Danil.lnk ya existe (instalación interactiva), el viejo se borra:
; Rename falla con el destino ocupado. El anclaje de la barra de tareas es una
; copia aparte que sigue abriendo la app, y el AppUserModelId (BUNDLEID) no cambia.
!macro TERMINUS_RENAME_LEGACY_SHORTCUT DIR
  ${If} ${FileExists} "${DIR}\${TERMINUS_LEGACY_PRODUCTNAME}.lnk"
    !insertmacro IsShortcutTarget "${DIR}\${TERMINUS_LEGACY_PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
    Pop $0
    ${If} $0 = 1
      ${If} ${FileExists} "${DIR}\${PRODUCTNAME}.lnk"
        Delete "${DIR}\${TERMINUS_LEGACY_PRODUCTNAME}.lnk"
      ${Else}
        Rename "${DIR}\${TERMINUS_LEGACY_PRODUCTNAME}.lnk" "${DIR}\${PRODUCTNAME}.lnk"
      ${EndIf}
    ${EndIf}
  ${EndIf}
!macroend

; Después de escribir la clave Danil, y antes del aviso que termina en Quit: la
; entrada «Terminus» se retira solo si es esta carpeta. El uninstall.exe nuevo
; solo conoce las claves Danil.
!macro TERMINUS_RETIRE_LEGACY
  ReadRegStr $R7 SHCTX "${MANUKEY}\${TERMINUS_LEGACY_PRODUCTNAME}" ""
  ${If} $R7 != ""
  ${AndIf} $R7 == $INSTDIR
    DeleteRegKey SHCTX "Software\Microsoft\Windows\CurrentVersion\Uninstall\${TERMINUS_LEGACY_PRODUCTNAME}"
    DeleteRegKey SHCTX "${MANUKEY}\${TERMINUS_LEGACY_PRODUCTNAME}"
    !insertmacro TERMINUS_RENAME_LEGACY_SHORTCUT "$SMPROGRAMS"
    !insertmacro TERMINUS_RENAME_LEGACY_SHORTCUT "$DESKTOP"
  ${EndIf}
!macroend

!macro NSIS_HOOK_PREINSTALL
  !insertmacro TERMINUS_SET_ASIDE "${MAINBINARYNAME}.exe"
!macroend

; The app shows its own notice; silent and passive runs come from it.
!macro NSIS_HOOK_POSTINSTALL
  !insertmacro TERMINUS_RETIRE_LEGACY
  !insertmacro TERMINUS_SWEEP
  ${If} ${FileExists} "$INSTDIR\old_*.exe"
  ${AndIfNot} ${Silent}
  ${AndIf} $PassiveMode <> 1
    MessageBox MB_OK|MB_ICONINFORMATION "Danil ${VERSION} is installed. Restart Danil to use it. If tasks are working, Danil will offer to restart when they finish.$\r$\n$\r$\nDanil ${VERSION} quedó instalado. Reinicia Danil para usarlo. Si hay tareas trabajando, Danil te avisará para reiniciar cuando terminen."
    ; The finish page would run a second window next to the open one; its shortcut box is checked by default.
    Call CreateOrUpdateDesktopShortcut
    ; Without it, Quit exits with 2, as if the script had aborted.
    SetErrorLevel 0
    Quit
  ${EndIf}
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  ${If} $EXEDIR != $INSTDIR
    !insertmacro TERMINUS_STOP_ENGINE "$INSTDIR\${MAINBINARYNAME}.exe"
  ${EndIf}
!macroend

; The engine keeps older tool trees while turns use them, so the template's per-file
; delete leaves them behind. Only a real uninstall (a temporary copy) removes them all.
!macro NSIS_HOOK_POSTUNINSTALL
  !insertmacro TERMINUS_SWEEP
  ${If} $EXEDIR != $INSTDIR
    RMDir /r "$INSTDIR\work-tools"
  ${EndIf}
!macroend
