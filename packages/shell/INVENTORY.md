# Inventario de `packages/shell`

Fase 1.7 del plan front-move. El shell se queda con el marco, el layout y los providers (quien compone). El riel y sus datos van a `workspaces`; el perfil y el plan, a `account`; el historial de tareas, a `projects`. Nada de este archivo mueve código: es el insumo de 2.4 y de 2.5 (`App.tsx` por debajo de 300 líneas).

Clases: `ui` reutilizable visual, `lib` función o hook reutilizable, `propio` de este paquete, `otra-feature` de otra feature (la ruta lo dice), `viejo` se borra en la fase 3.

| Archivo | Exports | Clase | Destino | Motivo |
|---|---|---|---|---|
| src/app/App.tsx | sleepSession, default | propio | se queda | Compositor de la ventana (7775 líneas). main.tsx lo monta dentro de Lanzador, Setup y SessionGate. En 2.5 se queda el árbol de slots; cada bloque sale a su feature (sección Bloques). Llama engine-client (sleep_session, set_active_workspace, run de turnos) y @terminus/tasks y @terminus/protocol. |
| src/app/main.tsx | disposeWindow | propio | se queda | Arranque: apps/desktop/index.html y vite.config.ts apuntan aquí; apps/desktop/src/web/window.tsx:187 lo importa. invoke window_background; host capabilities; monta Setup (settings) y askGuestChannels (machines). El selector de organización viejo entra por organization-desktop, que se borra. |
| src/shell/AccountHeader.tsx | AccountHeader | otra-feature | packages/features/workspaces/src/components/AccountHeader.tsx | Cabecera de cuenta del riel. Lo usa WorkspaceColumn. Importa cerrarConEscape de settings: pasa a prop (R3). |
| src/shell/AccountReturnFeedback.tsx | AccountReturnFeedback | otra-feature | packages/features/account/src/components/AccountReturnFeedback.tsx | Toast de volver a la cuenta. Lo monta el riel. Sin invoke; lee capabilities. |
| src/shell/AddWorkspaceMenu.tsx | menuArrows, default | otra-feature | packages/features/workspaces/src/components/AddWorkspaceMenu.tsx | Menú «+» del riel (agregar workspace). Lo usa el riel. Sin invoke directo; el alta la hacen las queries. |
| src/shell/AdoptionFeedback.tsx | AdoptionFeedback | otra-feature | packages/features/workspaces/src/components/AdoptionFeedback.tsx | Toast de lo que se ligó. Lo monta el riel tras la adopción. Tipos de account-adoption y session-account-workspaces, que también van a workspaces. |
| src/shell/AgentDock.tsx | DockAgent, dockStatusText, DockGroups, default | otra-feature | packages/features/chat/src/components/AgentDock.tsx | Dock de agentes de la tarea. Lo usa Sidebar. Importa AstroAvatar y displayName de projects: al mudarse a chat, esos dos entran por props (R3). El layout que reexporta de dockLayout se borra con @terminus/tasks. |
| src/shell/AppTools.tsx | default | otra-feature | packages/features/machines/src/components/AppTools.tsx | Menú de herramientas del pie del riel (puertos, almacenamiento, observabilidad). invoke agentsview_status. App.tsx:164 lo monta como slot del riel. |
| src/shell/CloseGuard.tsx | default | propio | se queda | Cierre, bandeja y segundo plano mientras hay turnos. invoke list_live_turns, tray_update, window_to_background, quit_completely. Lo monta App.tsx. |
| src/shell/DanilAddMenu.tsx | DanilMenu, DanilAddEntry, DanilSwitchRows, DanilStep | otra-feature | packages/features/workspaces/src/components/DanilAddMenu.tsx | Pasos para agregar un workspace Danil al riel. Lo usa AddWorkspaceMenu. Importa attention (projects): el estado entra por props. |
| src/shell/DanilFooterEntry.tsx | default | otra-feature | packages/features/account/src/components/DanilFooterEntry.tsx | Botón de preferencias del equipo en el pie. Sin red. Lo usa el riel de cuentas. Es cuenta, no marco. |
| src/shell/DeleteSpace.tsx | default | otra-feature | packages/features/workspaces/src/screens/DeleteSpace.tsx | Borrar un escritorio del workspace. App.tsx lo monta en lazy. invoke delete_space y space_delete_preview; machineOf de machines entra por prop. |
| src/shell/EmptySessionSignOut.tsx | EmptySessionSignOut | otra-feature | packages/features/account/src/components/EmptySessionSignOut.tsx | Salir cuando la sesión no tiene workspaces. Lo usa el aviso vacío del riel. Sin red. |
| src/shell/FolderGroupHeader.tsx | default | otra-feature | packages/features/projects/src/components/FolderGroupHeader.tsx | Cabecera de carpeta en el historial. Lo usa Sidebar. Importa FolderChip, Sessions y TaskStatus de projects, y rolledOutcome de @terminus/design (paquete viejo, 1.9). |
| src/shell/FolderNotice.tsx | default | otra-feature | packages/features/projects/src/components/FolderNotice.tsx | Aviso de conocimiento de la carpeta. App.tsx lo monta (AvisoDeCarpeta). invoke kn_pending y kn_update; machineOf de machines entra por prop. |
| src/shell/GitHubStar.tsx | default | propio | se queda | Estrella del marco (title bar). invoke site_open_external. Lo monta el shell, no una feature. |
| src/shell/GlobalSearch.tsx | SearchFilter, default | otra-feature | packages/features/projects/src/screens/GlobalSearch.tsx | Buscador de tareas y carpetas. App.tsx:7564 lo monta. invoke archived_tasks. matchesTaskQuery y SessionRow vienen de projects. |
| src/shell/GroupAccountMenu.tsx | groupBalanceLabel, GroupAccountMenu | otra-feature | packages/features/account/src/components/GroupAccountMenu.tsx | Filas de cuenta de un grupo (saldo). Lo usa el menú de organización. Sin red. |
| src/shell/GroupAvatar.tsx | GroupAvatar | otra-feature | packages/features/account/src/components/GroupAvatar.tsx | Foto del perfil si el correo coincide (capabilities().accountProfile). Lo usan las filas de cuenta del riel. |
| src/shell/GroupOrganizationWatch.tsx | webOrganizationAttention, setWebOrganizationAttention, webOrganizationName, setWebOrganizationName, GroupOrganizationWatch | otra-feature | packages/features/workspaces/src/components/GroupOrganizationWatch.tsx | Marca de problema de organización en la web. Lo usan los grupos del riel. Lee capabilities y apps/desktop organization-problems. |
| src/shell/HeaderAccountDetails.tsx | HeaderAccountDetails | otra-feature | packages/features/account/src/components/HeaderAccountDetails.tsx | Detalle de la cuenta en el encabezado del riel. Lo usa AccountHeader. Sin red. |
| src/shell/KeepAwake.tsx | Mode, Status, MODES, nameOf, descriptionOf, watchKeepAwake, default | otra-feature | packages/features/machines/src/components/KeepAwake.tsx | No dormir la máquina. invoke keep_awake_status y set_keep_awake. Lo monta WorkspaceColumn: al irse el riel a workspaces, entra por slot de machines. |
| src/shell/Launcher.tsx | default | propio | se queda | Provider de arranque: sin motor no hay app. index.ts lo exporta como Lanzador y main.tsx lo monta. invoke launcher_state, launcher_continue. |
| src/shell/LegacyDanilFooterEntry.tsx | default | viejo | se borra | Pie de cuenta anterior a los grupos. Solo lo carga LegacyProfileMenu. Arma createDanilAccounts de settings, el sistema de cuentas viejo del riel. lo importan packages/shell/src/shell/LegacyProfileMenu.tsx:16 |
| src/shell/LegacyProfileMenu.tsx | default | viejo | se borra | Menú de perfil anterior. ProfileMenu.tsx:15 lo monta solo si usesGroupAccounts() es falso. invoke site_open_external. Lo sustituye ProfileMenu; el fallback se borra en la fase 3 (R14). |
| src/shell/LockScreen.tsx | default | propio | se queda | Sustituye la app si el workspace no se puede abrir (PantallaDeBloqueo). Lo monta App.tsx al final. Sin red. |
| src/shell/MachineCard.tsx | TaskLookup, When, Power, taskTitle, MachineCard, MemoryTab | otra-feature | packages/features/machines/src/components/MachineCard.tsx | Tarjeta de recursos de una máquina. La abre Storage.tsx:37. Tipos @terminus/protocol y Machine de features/machines. No llama invoke: pinta lo que le pasan. |
| src/shell/MaterialNotice.tsx | default | otra-feature | packages/features/workspaces/src/screens/MaterialNotice.tsx | Frescura del material del workspace. App.tsx lo monta. invoke list_sources, source_freshness, update_source. |
| src/shell/MoveWorkspaceDialog.tsx | default | otra-feature | packages/features/workspaces/src/screens/MoveWorkspaceDialog.tsx | Mover un workspace de cuenta. index.ts lo exporta y settings/WorkspaceAccount.tsx:11 lo importa: settings lo recibe por slot, no importa workspaces. |
| src/shell/NewAccountTile.tsx | NewAccountTile | otra-feature | packages/features/account/src/components/NewAccountTile.tsx | Baldosa de agregar cuenta en el riel. Lo usan SessionAddMenu y tests de account-return. Sin red. |
| src/shell/OpenPorts.tsx | default | otra-feature | packages/features/machines/src/screens/OpenPorts.tsx | Puertos abiertos. invoke list_ports, close_port, close_process, open_external. Lo carga AppTools. lo importan packages/shell/src/shell/AppTools.tsx:7 |
| src/shell/OrganizationAccountMenu.tsx | OrganizationAccountMenu | otra-feature | packages/features/account/src/components/OrganizationAccountMenu.tsx | Menú de la cuenta dentro del grupo. Lo usa el riel. Sin red. |
| src/shell/OrganizationMenu.tsx | useOrganizations, OrganizationWatch, OrganizationSection, default | otra-feature | packages/features/workspaces/src/components/OrganizationMenu.tsx | Menú de organizaciones del riel. Tipos OrganizationSelection de @terminus/computers (1.9); la UI se queda en workspaces. lo importan packages/shell/src/shell/LegacyProfileMenu.tsx:17, packages/shell/src/shell/WebOrganizationStep.tsx:3 |
| src/shell/OrganizationPositionMenu.tsx | OrganizationPositionMenu | otra-feature | packages/features/workspaces/src/components/OrganizationPositionMenu.tsx | Orden de las organizaciones en el riel. Lo usa OrganizationRailGroup. Sin red. |
| src/shell/OrganizationRailGroup.tsx | OrganizationRailActions, OrganizationRailGroup | otra-feature | packages/features/workspaces/src/components/OrganizationRailGroup.tsx | Un grupo del riel. Importa contextAttentionStale de machines y cerrarConEscape de settings: ambos entran por props. lo importan packages/shell/src/shell/OrganizationSessionRows.tsx:3 |
| src/shell/OrganizationRailLayout.tsx | OrganizationRailLayout | otra-feature | packages/features/workspaces/src/components/OrganizationRailLayout.tsx | Disposición del riel (apilado o fila). Lo usa WorkspaceColumn. Sin red. |
| src/shell/OrganizationSessionRows.tsx | OrganizationSessionRows | otra-feature | packages/features/workspaces/src/components/OrganizationSessionRows.tsx | Filas de sesión dentro de la organización. Lo usa el stack. Sin red. |
| src/shell/OrganizationStack.tsx | OrganizationStack | otra-feature | packages/features/workspaces/src/components/OrganizationStack.tsx | Stack vertical de organizaciones (DS1). Lo usa el riel. Importa organization-stack.css. |
| src/shell/OrganizationWorkspaceTile.tsx | OrganizationWorkspaceTile | otra-feature | packages/features/workspaces/src/components/OrganizationWorkspaceTile.tsx | Cuadro de un workspace. Lo usa el stack. Sin red. |
| src/shell/OrganizationWorkspaceTooltip.tsx | OrganizationWorkspaceTooltip | otra-feature | packages/features/workspaces/src/components/OrganizationWorkspaceTooltip.tsx | Tooltip del cuadro (plan y saldo). Lo usa el tile. El saldo lo observa account y entra por prop. |
| src/shell/Panels.tsx | default | propio | se queda | Rejilla de paneles del área de trabajo. App.tsx (Conversacion) es quien la monta. Layout, sin cliente. lo importan packages/shell/src/app/App.tsx:170 |
| src/shell/ProfileMenu.tsx | default | otra-feature | packages/features/account/src/components/ProfileMenu.tsx | Menú de perfil (salir, apariencia, bug). invoke site_open_external. Lo abre el pie del riel. La feature account es el perfil; el riel lo recibe por slot. |
| src/shell/PromoRedeem.tsx | default | otra-feature | packages/features/account/src/components/PromoRedeem.tsx | Campo de canje en el menú de cuenta. Lo montan los menús del riel. ui Button e Input. |
| src/shell/SessionAddMenu.tsx | SessionAddEntries, SessionAddStep, usesSessionMenu | otra-feature | packages/features/workspaces/src/components/SessionAddMenu.tsx | Menú de agregar cuenta o workspace en la sesión. Lo usa el riel. Sin invoke. |
| src/shell/SessionEmptyNotice.tsx | SessionEmptyNotice | otra-feature | packages/features/workspaces/src/components/SessionEmptyNotice.tsx | Aviso de sesión sin workspaces. Lo usa el riel. Sin red. |
| src/shell/SessionGate.tsx | SessionGate | propio | se queda | Provider de sesión: main.tsx envuelve App. invoke list_workspaces y adoption_candidates. Importa CabeceraDelAlta (onboarding) y said (settings): esos dos pasan a slots. lo importan packages/shell/src/shell/index.ts:6 |
| src/shell/SessionWorkspaceRows.tsx | SessionWorkspaceRows | otra-feature | packages/features/workspaces/src/components/SessionWorkspaceRows.tsx | Filas de workspaces de la sesión. Lo usa el riel. Misma estructura en web y Desk. |
| src/shell/SideColumn.tsx | Lado, default | propio | se queda | Columna arrastrable del historial (ancho recordado en prefs). App.tsx la monta alrededor de Sidebar. Layout del shell. lo importan packages/shell/src/app/App.tsx:173 |
| src/shell/Sidebar.tsx | createSidebar, default | otra-feature | packages/features/projects/src/components/Sidebar.tsx | Historial de tareas (818 líneas). App.tsx:7632 lo monta. Importa Sessions, profiles, taskGit y handlerPresence de projects, el store de machines y groupCardOptions de @terminus/tasks. Al vivir en projects, machines entra por props. |
| src/shell/SidebarFilter.tsx | SidebarFilterFolder, SidebarFilterAgent, SidebarFilterProps, SidebarFilterSections, CustomizeMenu | otra-feature | packages/features/projects/src/components/SidebarFilter.tsx | Filtro del historial (carpeta y agente). Lo usan Sidebar y TitleBarSection. Importa AstroAvatar y FolderSquare de projects: pasan a ser internos. |
| src/shell/SpaceBar.tsx | default, NewSpaceForm | otra-feature | packages/features/workspaces/src/components/SpaceBar.tsx | Barra de escritorios del workspace. Lo usa el riel. Crear y renombrar se delegan. |
| src/shell/SpaceMenu.tsx | default | otra-feature | packages/features/workspaces/src/components/SpaceMenu.tsx | Menú de escritorios en la franja. App.tsx:7545 lo monta dentro de TitleBarSection. |
| src/shell/Storage.tsx | default | otra-feature | packages/features/machines/src/screens/Storage.tsx | Disco, caché y actualización del motor (1239 líneas). invoke list_storage, reclaim_storage, empty_build_cache, collect_orphans, engine_update, stop_task_processes. Lo carga AppTools. Tipos @terminus/protocol y el store de machines. lo importan packages/shell/src/shell/AppTools.tsx:9 |
| src/shell/TaskNotifier.tsx | NotifyChoice, NOTIFY_PREF, quietFinished, default | propio | se queda | Aviso de bandeja de la ventana. invoke tray_notify. App.tsx lo monta. settings/NotifyBehavior.tsx:4 importa NOTIFY_PREF: esa constante pasa a settings y el shell recibe la elección por prop. Tipos de projects y @terminus/protocol. |
| src/shell/TitleBar.tsx | default | propio | se queda | Marco de la ventana (arrastre, doble clic). Solo lo usa el shell. host/window, sin red. |
| src/shell/TitleBarSection.tsx | TitleBarSection | propio | se queda | Franja de título: hueco para el menú de espacios, la tira y la búsqueda. Lo reexporta index.ts y lo monta App.tsx. Sin cliente. |
| src/shell/UsageTool.tsx | default, UsagePanel | otra-feature | packages/features/settings/src/components/UsageTool.tsx | Medidor del panel de la tarea. App.tsx y code/TaskSide.tsx:7 (UsagePanel) lo importan. Carga AccountCard (settings) y DanilCredits (chat) y immediateWindow de @terminus/computers. Chat entra por slot; el tipo de computers muere en 1.9. |
| src/shell/VersionNotice.tsx | default | propio | se queda | Aviso de actualización en la pila de App.tsx, no en Configuración. invoke update_pending, update_install. lo importan packages/shell/src/app/App.tsx:178 |
| src/shell/WebOrganizationStep.tsx | WebOrganizationStep | otra-feature | packages/features/workspaces/src/screens/WebOrganizationStep.tsx | Paso de organización en la web. Lo usa el picker web. Lee capabilities. |
| src/shell/WebWorkspacePicker.tsx | WebWorkspacePicker | otra-feature | packages/features/workspaces/src/screens/WebWorkspacePicker.tsx | Elegir workspace en la web (refetch y admit del picker que le pasan). Lo usa el riel web. |
| src/shell/WindowControls.tsx | default | propio | se queda | Semáforo nativo. invoke request_close; host isWindows. onboarding/Phases.tsx:13 lo importa: pasa a ser slot del shell, no un import de la feature. |
| src/shell/WorkspaceColumn.tsx | AttentionBadge, MarcaDeWorkspace, monogram, default | otra-feature | packages/features/workspaces/src/components/WorkspaceColumn.tsx | El riel. App.tsx:7577 lo monta. settings/Workspaces.tsx:19 importa MarcaDeWorkspace: esa marca sube con el archivo y settings la recibe por slot. Importa machines, projects y settings: todo entra por props. |
| src/shell/WorkspaceMarks.tsx | monogram, MarcaDeWorkspace, AttentionBadge | otra-feature | packages/features/workspaces/src/components/WorkspaceMarks.tsx | Monograma y badge de atención del cuadro. Lo reexporta WorkspaceColumn y lo usan OrganizationWorkspaceTile.tsx:12 y OrganizationRailGroup.tsx:22. Sin red. |
| src/shell/WorkspaceSearch.tsx | SEARCH_FROM, default | otra-feature | packages/features/workspaces/src/components/WorkspaceSearch.tsx | Buscador de la lista de workspaces (a partir de 7). Lo usa el riel. Sin red. El input crudo se cambia a ui en 2.1, el archivo igual se muda. |
| src/shell/WorkspaceSourceStatus.tsx | WorkspaceSourceStatus | otra-feature | packages/features/workspaces/src/components/WorkspaceSourceStatus.tsx | Estado de la fuente del workspace en el menú. Lo usa WorkspaceColumn. Sin red. |
| src/shell/account-adoption.ts | AdoptionCandidate, AdoptionMemory, AdoptionClaimed, AdoptionFailure, AdoptionResult, adoptLocals, adoptionTarget, adoptionTargetOf, prefsAdoptionMemory | otra-feature | packages/features/workspaces/src/queries/account-adoption.ts | Adopta workspaces locales. platform-client /v1/workspaces/adopt y /adopt/challenge; invoke adopt_account_workspace y adoption_proof. Lo usan el alta y AdoptionFeedback. |
| src/shell/account-move.ts | MoveGroup, MoveDestination, MoveAccount, Send, MoveResult, moveCause, catalog, accountOfEngine, moveDestinations, moveWorkspace | otra-feature | packages/features/workspaces/src/queries/account-move.ts | Traslado de workspace entre cuentas. platform-client workspaceTransfersPath y sendIdentityMe (/v1/identity/me). Lo usa MoveWorkspaceDialog. |
| src/shell/account-requests.ts | AccountRequest, AccountError, AccountOutcome, CreatedNotice, AccountRequestDeps, listOrgs, pickGroup, runAccountRequest, createAccountRequests | otra-feature | packages/features/account/src/queries/account-requests.ts | Toma y cierra pedidos de cuenta: invoke account_request_take y account_request_settle; platform-client WORKSPACES_PATH. Lo usa session-groups. |
| src/shell/account-return-state.ts | accountReturnRevision, setAccountReturnRevision, accountReturn, newAccountTiles, setNewAccountTiles | otra-feature | packages/features/account/src/model/account-return-state.ts | Señal accountReturn. index.ts la reexporta y settings/SessionAccounts.tsx:8 la importa. Envuelve apps/desktop lib/account-add-return. La señal se queda en account y settings la recibe por props. lo importan packages/shell/src/shell/index.ts:1, packages/shell/src/shell/add-session-account.ts:1, packages/shell/src/shell/NewAccountTile.tsx:2 (+1 archivos) |
| src/shell/account-return-target.ts | accountReturnTarget | otra-feature | packages/features/account/src/model/account-return-target.ts | A qué cuenta se vuelve. Puro. Lo usa el toast de retorno. |
| src/shell/account-return.css | — | otra-feature | packages/features/account/src/components/account-return.css | Estilos del alta de cuenta. Lo importa NewAccountTile.tsx. Viaja con ese componente. |
| src/shell/account-transfers.ts | AccountMove, PendingUnion, PendingUnions, accountId, movesFor, applyMoves, retryUnions, prefsPendingUnions | otra-feature | packages/features/workspaces/src/queries/account-transfers.ts | Sella el traslado en el motor. invoke reseal_account_workspace y set_free_router_union. Lo usan la adopción y el alta. |
| src/shell/add-session-account.ts | addSessionAccount | lib | packages/session/src/add-session-account.ts | Añade una cuenta: invoke danil_sign_in mode add. Lo usa el menú de sesión del riel. |
| src/shell/add-workspace-menu-state.ts | createAddWorkspaceMenuState | otra-feature | packages/features/workspaces/src/model/add-workspace-menu-state.ts | Estado abierto del menú «+». Lo usa AddWorkspaceMenu. Puro. |
| src/shell/attention.ts | ATTENTION_STATES, AttentionState, TaskAttention, WorkspaceAttention, topState, createAttention | otra-feature | packages/features/projects/src/queries/attention.ts | Atención de tareas del workspace. App.tsx:147 crea el store; el riel importa el tipo. invoke list_workspace_attention y mark_task_seen; machineOf de machines. El riel, ya en workspaces, lo recibe por props. lo importan packages/shell/src/app/App.tsx:147, packages/shell/src/shell/OrganizationSessionRows.tsx:2, packages/shell/src/shell/WorkspaceColumn.tsx:14 (+10 archivos) |
| src/shell/context-attention.ts | mergeContextAttention, contextAttentionOf | otra-feature | packages/features/projects/src/model/context-attention.ts | Parte la atención por contexto con mergeAttention de @terminus/protocol. Solo lo usa attention.ts. Viaja con esa query; el merge del paquete protocol lo resuelve 1.9. |
| src/shell/danil-rail.ts | DanilView, railWithDanil, danilToAdd, danilMenuOf, openOnStart, columnDanil, tileLabel | otra-feature | packages/features/workspaces/src/model/danil-rail.ts | Qué workspaces Danil se ven y cuál abre al empezar. Lo usan el riel y hidden-workspaces. Puro. |
| src/shell/dockLayout.ts | DockAgent, DOCK_DEFAULT_CAPACITY, agentFolder, dockCapacity, dockSources, orderDockAgents, planDock | viejo | se borra | Solo reexporta el reparto del dock de @terminus/tasks (líneas 1-10). Lo importan AgentDock.tsx y Sidebar.tsx. Mismo paquete viejo que sidebarTasks; se borra. |
| src/shell/empty-session-emails.ts | emptySessionEmails | lib | packages/session/src/empty-session-emails.ts | Correos de un contexto vacío. Puro. Lo usa el aviso de sesión vacía del riel. |
| src/shell/engine-adoption.ts | ENGINE_ADOPTION_FEATURE, engineOwnsAdoption, EngineAdoption, engineAdoptionOf, engineAdoptionFinished, engineAdoptionProgress, engineAdoptionDone, engineAdoptionReport, readEngineAdoption, retryEngineAdoption, onEngineAdoption | otra-feature | packages/features/onboarding/src/queries/engine-adoption.ts | Estado de la adopción que hace el motor (engine_adoption_v1). invoke engine_adoption_status y engine_adoption_retry. Lo usan SessionGate y el alta. |
| src/shell/engine-features.ts | engineFeatures | lib | packages/engine-client/src/engine-features.ts | Lee service_features con invoke crudo de @tauri-apps/api/core (`machine_list`), fuera de engine-client (R1). Lo usan SessionGate, session-groups y session-account-workspaces. |
| src/shell/first-free-workspace.ts | FirstFreeOptions, FirstFreeRefusal, FIRST_FREE_DELAYS, sealFirstFreeWorkspace | otra-feature | packages/features/onboarding/src/queries/first-free-workspace.ts | Sella el primer workspace Free. index.ts lo reexporta y onboarding/onboarding-store.ts:3 lo importa. platform-client sendIdentityMe. Se muda a onboarding y el barril lo suelta. |
| src/shell/first-login-link.ts | createLinker, LinkRow | otra-feature | packages/features/onboarding/src/queries/first-login-link.ts | Liga locales antes de montar la app. Lo usa SessionGate. Orquesta personal-open y account workspaces, que entran por parámetros (ya recibe invoke). |
| src/shell/first-login.ts | FIRST_LOGIN_KEY, AdoptionStep, AdoptionProgress, FirstLoginPhase, noteFirstLoginSignedIn, firstLoginSignedIn, firstLoginPhase, shouldMarkFirstLoginDone, linkingOutcome, localCandidateCount | otra-feature | packages/features/onboarding/src/queries/first-login.ts | Fase del primer ingreso. index.ts reexporta noteFirstLoginSignedIn y onboarding/ConnectAccount.tsx:13 lo importa. invoke adoption_candidates y machine_list. Pasa a onboarding; el shell deja de reexportarlo. |
| src/shell/hidden-workspaces.ts | HIDDEN_KEY, matchesName, railVisible, railHidden, keepSlots, createHiddenWorkspaces | otra-feature | packages/features/workspaces/src/model/hidden-workspaces.ts | Workspaces ocultos del riel (HIDDEN_KEY). Lo usan DanilAddMenu y el riel. Puro. |
| src/shell/index.ts | accountReturn, sealFirstFreeWorkspace, noteFirstLoginSignedIn, Lanzador, MoveWorkspaceDialog, SessionGate, sessionRailState, noteWebAccountMode, usesGroupAccounts, TitleBarSection | propio | se queda | Barril público. Lo importan session/window-session.tsx, settings (DeskPlan, SessionAccounts, WorkspaceAccount, DanilAccountsEntry), onboarding (onboarding-store, ConnectAccount) y apps/desktop/src/web/window.tsx. Al mudarse los módulos, el barril se queda con Lanzador, SessionGate y TitleBarSection. |
| src/shell/liveTurns.ts | LiveTurn, ShownTurn, scope, stopTurns, setTurnTitles, titled, AfterWait, waitingThen, setWaitingThen, waitRows, setWaitRows | propio | se queda | Turnos vivos para cerrar, reiniciar y actualizar. Lo usan CloseGuard, VersionNotice y restartWait. engine-client y además invoke crudo de @tauri-apps/api/core (R1: ese invoke pasa a engine-client). |
| src/shell/logo-src.ts | generacionDeLogo, urlDeLogo | otra-feature | packages/features/workspaces/src/queries/logo-src.ts | URL del logo del workspace. invoke preview_file; machineOf de machines entra por prop. Lo usan los cuadros. |
| src/shell/machineUsage.ts | USAGE_FEATURE, UPDATE_FEATURE, Level, hasUsage, level, worst, MemorySplit, split, active, leftovers, heaviest, topProcesses, remember, history, forgetSamples, EngineVersion, engineVersion, updateState | otra-feature | packages/features/machines/src/model/machineUsage.ts | Niveles de CPU, memoria y procesos. Lo usan MachineCard y Storage. Tipos @terminus/protocol (EngineUpdate, MachineResources); sin invoke. |
| src/shell/menu-focus.ts | menuArrows, showKeepingFocus | lib | packages/ui/src/lib/menu-focus.ts | Flechas del menú, sin dominio. Lo usan AccountHeader y AddWorkspaceMenu. Sube a ui/lib (R9). |
| src/shell/organization-credits-watch.ts | watchOrganizationCredits | otra-feature | packages/features/account/src/queries/organization-credits-watch.ts | Observa el saldo y lo publica al tooltip. Lo usan OrganizationWorkspaceTooltip y OrganizationRailGroup. |
| src/shell/organization-credits.ts | organizationCredits | otra-feature | packages/features/account/src/queries/organization-credits.ts | Saldo del plan en el tooltip del riel. Lo usan organization-credits-watch y el tooltip. Lee el saldo con readGroupBalance de apps/desktop/src/lib/group-account.ts, sin invoke propio. Es el resumen de plan de account. |
| src/shell/organization-desktop.ts | desktopOrganizations | viejo | se borra | Adaptador de @terminus/computers createOrganizationSelection. main.tsx:33 lo instala en capabilities.organizations. El borde ya está en platform-client (edgeFetch). Lo sustituye esa llamada, sin el paquete computers (1.9). lo importan packages/shell/src/app/main.tsx:33 |
| src/shell/organization-edge.ts | EdgeFetch, edgeOrganizationSource | viejo | se borra | Implementa OrganizationSource de @terminus/computers encima de platform-client fetchEdgeOrganizations y selectEdgeOrganization. Lo usa organization-desktop. Se borra con el adaptador; queda el cliente. |
| src/shell/organization-logo.ts | organizationLogo | otra-feature | packages/features/workspaces/src/queries/organization-logo.ts | Logo de la organización. invoke preview_file y capabilities. Lo usa el tile. |
| src/shell/organization-menu-state.ts | organizationMenuReady | viejo | se borra | Cinco líneas: organizationMenuReady solo entiende OrganizationState de @terminus/computers. Nadie lo necesita cuando ese tipo se va. Lo importa el menú viejo del riel. |
| src/shell/organization-rail-model.ts | OrgPreference, OrgTile, RailOrganization, parseOrgPreference, orderedOrganizations, changeOrgPreference, stackedOrganizations | otra-feature | packages/features/workspaces/src/model/organization-rail-model.ts | Orden y apilado de organizaciones. Lo usan el layout y las preferencias. Puro. |
| src/shell/organization-rail-preferences.ts | organizationRailPreferences | otra-feature | packages/features/workspaces/src/model/organization-rail-preferences.ts | Preferencia de orden del riel. Lo usa el modelo. Lee capabilities, sin invoke. |
| src/shell/organization-session-gate.ts | legacyOrganizationGate | viejo | se borra | legacyOrganizationGate: el selector anterior cuando no hay grupos. Tipo de @terminus/computers y invoke danil_session_status. Lo llama organization-desktop.ts:27. El camino vigente es el riel de grupos. lo importan packages/shell/src/shell/organization-desktop.ts:11 |
| src/shell/organization-stack.css | — | otra-feature | packages/features/workspaces/src/components/organization-stack.css | Estilos del stack. Lo importa OrganizationStack.tsx. Viaja con él. |
| src/shell/organization-start-target.ts | organizationStartTarget, requestedStartTarget | otra-feature | packages/features/workspaces/src/model/organization-start-target.ts | Workspace que debe abrir al entrar. Lo usan el riel y la web. Puro. |
| src/shell/personal-open.ts | PersonalOutcome, personalOrgOf, openPersonal, PersonalOpener, createPersonalOpener | otra-feature | packages/features/account/src/queries/personal-open.ts | Abre la organización personal: platform-client selectOrganizationWithContext y sendIdentityMe (POST /v1/identity/organizations/select). Lo usa el alta y el riel. |
| src/shell/promo-state.ts | createPromoState | otra-feature | packages/features/account/src/model/promo-state.ts | Estado del canje de promo. Lo usa PromoRedeem. Sin red propia (el canje lo hace el host). |
| src/shell/restartWait.tsx | namesOf, WAIT_POLL, waitThen, cancelWait, Aplicar, EsperaDeTareas | propio | se queda | Espera turnos vivos y luego restart_app o quit_completely. Lo usan VersionNotice y el cierre. engine-client. |
| src/shell/select-busy.ts | BUSY, isBusy, BusyOptions, retryBusy | lib | packages/platform-client/src/select-busy.ts | Reintento de un `busy` del borde (R10 vive una vez en el cliente). Lo usan organization-edge y personal-open. |
| src/shell/session-account-workspaces.ts | AccountWorkspace, FreeWorkspace, AdoptionReport, accountWorkspaces, createAccountWorkspaces | otra-feature | packages/features/workspaces/src/queries/session-account-workspaces.ts | Lista y crea workspaces de la cuenta. invoke list_workspaces, create_account_workspace, adoption_candidates, machine_list. Lo usan el riel y el primer ingreso. |
| src/shell/session-close-confirm.ts | emailContextCount, confirmEmailClose | lib | packages/session/src/session-close-confirm.ts | Confirma cerrar un correo que tiene varias organizaciones. Puro. Lo usa el menú de cuenta. |
| src/shell/session-context-types.ts | SessionContext, SessionFamily, ContextGroup, SessionStatus, ContextReply, ContextInvoke | lib | packages/session/src/session-context-types.ts | Tipos de contexto (SessionContext, ContextInvoke). Los comparten session-contexts, el alta y las queries de workspace. Van con session. lo importan packages/shell/src/shell/session-contexts.ts:5, packages/shell/src/shell/first-free-workspace.ts:12, packages/shell/src/shell/add-session-account.ts:2 (+2 archivos) |
| src/shell/session-contexts.ts | ContextGroup, ContextInvoke, ContextReply, SessionContext, SessionFamily, SessionStatus, contextGroups, createSessionContexts | lib | packages/session/src/session-contexts.ts | Contextos de la persona: platform-client probeIdentityMe e invoke danil_sign_out, danil_session_status, danil_edge_fetch. Lo usa el provider del riel. |
| src/shell/session-empty.ts | EmptyReason, RemovedContext, EmptyReply, normalizeEmptyReason, emptyReasonKey, replyEmptyReason, refusalEmptyReason, createSessionEmptyState | lib | packages/session/src/session-empty.ts | Normaliza empty_reason del borde (no_organization, session_expired…). Puro. Lo usa el riel al pintar el vacío. |
| src/shell/session-gate.ts | GateView, gateView, handedReport, handAdoptionReport | propio | se queda | Decide qué pinta SessionGate (loading, sign_in, open, alta). Lo usa SessionGate.tsx. Depende de first-login, que se muda a onboarding y entra como dato. |
| src/shell/session-groups.ts | SessionRailGroup, sessionRailState, setSessionRailState, hasSessionGroups, sessionRail | propio | se queda | Provider del riel (sessionRail, sessionRailState). Lo leen session, settings, la web y el propio riel. Llama engine-client, platform-client (/v1/identity/me) y features/machines (danilAvailable). En 2.4 las features lo reciben por props; el singleton se queda en el shell. |
| src/shell/session-menu-mode.ts | noteWebAccountMode, usesGroupAccounts | lib | packages/session/src/session-menu-mode.ts | noteWebAccountMode y usesGroupAccounts. index.ts los reexporta; settings/DanilAccountsEntry.tsx y SessionAccounts.tsx los importan. Es modo de sesión, no UI. lo importan packages/shell/src/shell/HeaderAccountDetails.tsx:8, packages/shell/src/shell/index.ts:8, packages/shell/src/shell/ProfileMenu.tsx:13 |
| src/shell/session-menu-open.ts | openRequestedSessionMenu | otra-feature | packages/features/workspaces/src/model/session-menu-open.ts | Abre el menú que el riel dejó pendiente. Lo usa el riel al pintar. Puro sobre sessionRail. |
| src/shell/session-rail-view.ts | railTileWorkspaces, sessionVisible, freeSessionRow, sessionStartTarget | otra-feature | packages/features/workspaces/src/model/session-rail-view.ts | Qué cuadros se ven (agregados y el abierto). Lo usa el riel. Puro. |
| src/shell/session-return.ts | coalesceSessionReturn | lib | packages/session/src/session-return.ts | Une foco y visibilidad del regreso a la ventana. Puro. Lo usa el estado de retorno de cuenta. |
| src/shell/session-seeding.ts | sessionSeedInputs, SessionSyncInput, sessionSyncKey | otra-feature | packages/features/workspaces/src/model/session-seeding.ts | Qué workspaces sembrar como agregados. Lo usa el sync. Puro. |
| src/shell/session-source.ts | PersonSession, SessionSource, ENGINE_SESSION_FEATURE, deskSessionSource, registerEngineSessionSource, personSessionSource | lib | packages/session/src/session-source.ts | Quién soy en Desk: invoke danil_session_status y danil_sign_in. Lo arma SessionGate. Es session, no el riel. lo importan packages/shell/src/shell/SessionGate.tsx:18, packages/shell/src/shell/engine-adoption.ts:7 |
| src/shell/session-workspace-source.ts | sessionWorkspaceSource | otra-feature | packages/features/workspaces/src/model/session-workspace-source.ts | El plan elige si la fuente es esta computadora o la de la organización. Lo usa el riel. Puro. |
| src/shell/sidebarTasks.ts | flattenTasks, folderCounts | viejo | se borra | Solo reexporta flattenTasks y folderCounts de @terminus/tasks (línea 2). Lo importan Sidebar.tsx:47 y App.tsx:175. El paquete lo decide 1.9; este archivo no aporta nada. |
| src/shell/usage.ts | AgentOpt, AccountsByAgent, ActiveCard, usageKey, createUsage, Usage | otra-feature | packages/features/settings/src/queries/usage.ts | Consumo de cuentas de IA: invoke list_accounts, account_status, account_limits. App.tsx:177 crea el store; code/TaskSide.tsx:8 importa el tipo Usage. La feature settings es la dueña; code lo recibe por props (R3). lo importan packages/shell/src/app/App.tsx:177, packages/shell/src/shell/UsageTool.tsx:14, packages/features/code/src/screens/TaskSide.tsx:8 |
| src/shell/workspace-added-sync.ts | PreferencesReply, AddedTransport, AddedScope, PendingOp, AddedRecord, AddedStore, RETRY_MS, outcomeOf, parsePreferences, enqueue, seedOf, createAddedSync | otra-feature | packages/features/workspaces/src/queries/workspace-added-sync.ts | Agregados del riel por persona y organización. GET/PUT/DELETE /v1/workspaces/preferences. Lo usa el cableado del riel. |
| src/shell/workspace-added-transport.ts | EdgeSend, edgeAddedTransport, WebSend, webAddedTransport, ADDED_KEY, prefsAddedStore | otra-feature | packages/features/workspaces/src/queries/workspace-added-transport.ts | Transporte Desk y web de esos agregados. platform-client edgePath; EdgeError de @terminus/computers (1.9). Lo usa workspace-added-sync. |
| src/shell/workspace-added-wiring.ts | setRailShown, setAddedSyncWeb, DanilRail, danilRail | otra-feature | packages/features/workspaces/src/queries/workspace-added-wiring.ts | Conecta el riel Danil con el sync. platform-client, tipos de @terminus/computers y @terminus/fleet, y danilAvailable de machines (entra por prop). Lo usa el riel. |
| src/shell/workspace-source-wait.ts | createWorkspaceSourceWait | otra-feature | packages/features/workspaces/src/model/workspace-source-wait.ts | Espera a que la fuente del workspace conteste. Lo usa el cambio de workspace. Puro. |

## Bloques de App.tsx

`src/app/App.tsx` (7775 líneas) se queda como compositor. Cada bloque de abajo se muda tal cual a la feature dueña en la tarea 2.5, y el shell lo monta por el `index.ts` de esa feature o por un slot. Los rangos cubren el archivo de la línea 1 a la 7775.

| Líneas | Qué hace | Feature dueña | Destino |
|---|---|---|---|
| 1–301 | Imports y pantallas en lazy (Chat, proyectos, código, máquinas, ajustes, onboarding, sitios, pestañas, colas, hilos). | shell | se queda solo el montaje de cada pantalla pública; los imports profundos (`src/screens`, `src/model`, `src/queries`) suben al index de la feature (R11). |
| 302–345 | Tipos del turno vivo y `sleepSession` (`invoke sleep_session`). | chat | packages/features/chat/src/queries/sleepSession.ts |
| 347–544 | Pestillo del alta, proyectos, sesiones, tareas que nacen, pestañas (`createTabs`) y material pedido. | projects | packages/features/projects/src/screens/workspace-session.ts; el pestillo `alta` se queda en el shell. |
| 545–659 | Escritorios (`spaces`), caché del sidebar, paneles (`createPanels`) y viewport compacto. | shell | la geometría de paneles se queda en packages/shell; `spaces` va a packages/features/workspaces/src/queries/spaces.ts |
| 660–832 | Celdas de la rejilla, qué ventana se pinta y qué pestaña queda delante. | shell | se queda, junto a Panels.tsx |
| 833–1168 | Tiras por escritorio, atención del escritorio y el aviso de un gesto sobre espacios. | projects | packages/features/projects/src/queries/desk-strip.ts; el aviso de espacios lo pinta workspaces |
| 1169–1559 | Carga del hilo, streaming, turnos que contestan y eventos del servicio (`createServiceStream`). | chat | packages/features/chat/src/queries/thread-stream.ts; el stream ya vive en features/service-stream y el shell solo lo conecta |
| 1560–1760 | Clon de carpeta en vuelo y opciones de la conversación (documentos, pegar). | projects | packages/features/projects/src/queries/clone-folder.ts; el pegado de la caja es de chat |
| 1761–2237 | Adjuntos e imágenes al motor (`guardar_adjunto`, `guardar_imagen_pegada`, `attachment_preview`). | chat | packages/features/chat/src/queries/attachments.ts |
| 2238–3002 | `session_resync` y la reconciliación de eventos (como mucho cada 2 s). | chat | packages/features/chat/src/queries/resync.ts; el transporte sigue en service-stream |
| 3003–3303 | Comandos `!`: `run_shell_command`, teclear a la terminal y la cola que el motor retiene. | chat | packages/features/chat/src/queries/shell-command.ts (la feature terminal aún no existe; no se inventa otra carpeta) |
| 3304–3629 | Fuente de contexto del workspace (`set_workspace_source`) y material de toda tarea del proyecto. | workspaces | packages/features/workspaces/src/queries/context-source.ts |
| 3630–3780 | Tarea nueva con carpeta y agente, y el objeto que Ajustes → Proyectos le pide al riel. | projects | packages/features/projects/src/queries/new-task.ts |
| 3781–3912 | Borrador sin guardar, cambio de CLI del próximo turno y modo de permiso (`set_permission_mode`). | chat | packages/features/chat/src/queries/draft-send.ts |
| 3913–4102 | Pantalla de una computadora al lado del chat y atajos de juntar o separar paneles. | shell | el atajo de paneles se queda; el contenido de la pantalla ya es features/screen y el shell solo la monta |
| 4103–4627 | Arrastre de pestañas y mutaciones de la fila (`move_session`, `set_session_stage`, `set_session_pinned`, `rename_session`, `detach_session_source`). | projects | packages/features/projects/src/queries/session-mutations.ts; el gesto de arrastre ya es features/tabs |
| 4628–4927 | Modelo, esfuerzo, traspaso de proveedor (`canHandOverTask`) y la fila provisional de una tarea que aún no existe. | chat | packages/features/chat/src/queries/handover.ts; la fila provisional la confirma projects |
| 4928–5766 | Enviar, encolar, «mandar ahora», «detener y enviar» y traer o llevar el trabajo a otra máquina (carry). | chat | packages/features/chat/src/queries/send.ts; carry ya es features/machines y el shell solo abre CarrySheet |
| 5768–6680 | Qué conversación está montada, `SelectorDeProyecto` y `PanelDeChat` (una celda por tarea). | chat | packages/features/chat/src/screens/PanelDeChat.tsx; el selector de proyecto queda en projects y entra por prop, como ya dice el comentario de la línea 5841 |
| 6681–7350 | JSX de `Conversacion`: tiras, `Paneles`, visor de archivo, sitio, artefacto, observabilidad y pantalla. | shell | se queda el JSX que reparte celdas; cada visor ya es de su feature (code, sites, artifacts, observability, screen, tabs) y se monta por slot |
| 7351–7372 | Memos del riel del escritorio activo y de las familias delegadas. | projects | packages/features/projects/src/model/rail-sessions.ts |
| 7373–7765 | JSX de `Principal`: toasts, diálogos, onboarding, barra de título, riel, sidebar, ajustes y hoja de carry. | shell | se queda el árbol. Cada hijo ya tiene dueño: CloseGuard y VersionNotice en el shell; MaterialNotice y el riel en workspaces; Sidebar y GlobalSearch en projects; Onboarding, Settings, CarrySheet y los diálogos en su feature. |
| 7766–7775 | `return`: si hay bloqueo, `PantallaDeBloqueo`; si no, `Principal`. | shell | se queda |

Lo que el shell conserva de `App` después de 2.5 cabe en el marco: alta o bloqueo, columnas, paneles, toasts de la ventana y los slots. El objetivo de menos de 300 líneas sale de quitar los bloques de chat, projects, workspaces y machines, no de reescribirlos.

## Imports cruzados

Cada import de `packages/shell` hacia otra feature o hacia un paquete viejo (`@terminus/*`). R3: una feature no importa a otra; solo el shell compone. Donde el archivo se muda a una feature, el import de la otra no viaja con él: entra por props o por un slot que el shell pasa. Donde el archivo se queda (App, main, providers), el shell sigue montando la pantalla, pero solo desde el `index.ts` público.

### `src/app/App.tsx`

- `src/app/App.tsx:23` → artifacts. En su lugar: el shell sigue componiendo `artifacts`; el import profundo sube al index público y el estado de ese bloque sale de App.tsx.
- `src/app/App.tsx:24` → artifacts. En su lugar: el shell sigue componiendo `artifacts`; el import profundo sube al index público y el estado de ese bloque sale de App.tsx.
- `src/app/App.tsx:31` → chat. En su lugar: el shell sigue componiendo `chat`; el import profundo sube al index público y el estado de ese bloque sale de App.tsx.
- `src/app/App.tsx:32` → chat. En su lugar: el shell sigue componiendo `chat`; el import profundo sube al index público y el estado de ese bloque sale de App.tsx.
- `src/app/App.tsx:33` → chat. En su lugar: el shell sigue componiendo `chat`; el import profundo sube al index público y el estado de ese bloque sale de App.tsx.
- `src/app/App.tsx:34` → chat. En su lugar: el shell sigue componiendo `chat`; el import profundo sube al index público y el estado de ese bloque sale de App.tsx.
- `src/app/App.tsx:35` → chat. En su lugar: el shell sigue componiendo `chat`; el import profundo sube al index público y el estado de ese bloque sale de App.tsx.
- `src/app/App.tsx:38` → chat. En su lugar: el shell sigue componiendo `chat`; el import profundo sube al index público y el estado de ese bloque sale de App.tsx.
- `src/app/App.tsx:39` → chat. En su lugar: el shell sigue componiendo `chat`; el import profundo sube al index público y el estado de ese bloque sale de App.tsx.
- `src/app/App.tsx:40` → chat. En su lugar: el shell sigue componiendo `chat`; el import profundo sube al index público y el estado de ese bloque sale de App.tsx.
- `src/app/App.tsx:41` → chat. En su lugar: el shell sigue componiendo `chat`; el import profundo sube al index público y el estado de ese bloque sale de App.tsx.
- `src/app/App.tsx:42` → chat. En su lugar: el shell sigue componiendo `chat`; el import profundo sube al index público y el estado de ese bloque sale de App.tsx.
- `src/app/App.tsx:43` → chat. En su lugar: el shell sigue componiendo `chat`; el import profundo sube al index público y el estado de ese bloque sale de App.tsx.
- `src/app/App.tsx:44` → chat. En su lugar: el shell sigue componiendo `chat`; el import profundo sube al index público y el estado de ese bloque sale de App.tsx.
- `src/app/App.tsx:45` → chat. En su lugar: el shell sigue componiendo `chat`; el import profundo sube al index público y el estado de ese bloque sale de App.tsx.
- `src/app/App.tsx:46` → chat. En su lugar: el shell sigue componiendo `chat`; el import profundo sube al index público y el estado de ese bloque sale de App.tsx.
- `src/app/App.tsx:47` → chat. En su lugar: el shell sigue componiendo `chat`; el import profundo sube al index público y el estado de ese bloque sale de App.tsx.
- `src/app/App.tsx:48` → chat. En su lugar: el shell sigue componiendo `chat`; el import profundo sube al index público y el estado de ese bloque sale de App.tsx.
- `src/app/App.tsx:60` → chat. En su lugar: el shell sigue componiendo `chat`; el import profundo sube al index público y el estado de ese bloque sale de App.tsx.
- `src/app/App.tsx:61` → composer. En su lugar: el shell sigue componiendo `composer`; el import profundo sube al index público y el estado de ese bloque sale de App.tsx.
- `src/app/App.tsx:62` → projects. En su lugar: el shell sigue componiendo `projects`; el import profundo sube al index público y el estado de ese bloque sale de App.tsx.
- `src/app/App.tsx:63` → projects. En su lugar: el shell sigue componiendo `projects`; el import profundo sube al index público y el estado de ese bloque sale de App.tsx.
- `src/app/App.tsx:64` → settings. En su lugar: el shell sigue componiendo `settings`; el import profundo sube al index público y el estado de ese bloque sale de App.tsx.
- `src/app/App.tsx:65` → threads. En su lugar: el shell sigue componiendo `threads`; el import profundo sube al index público y el estado de ese bloque sale de App.tsx.
- `src/app/App.tsx:66` → workspace. En su lugar: el shell sigue componiendo `workspace`; el import profundo sube al index público y el estado de ese bloque sale de App.tsx.
- `src/app/App.tsx:69` → code. En su lugar: el shell sigue componiendo `code`; el import profundo sube al index público y el estado de ese bloque sale de App.tsx.
- `src/app/App.tsx:71` → code. En su lugar: el shell sigue componiendo `code`; el import profundo sube al index público y el estado de ese bloque sale de App.tsx.
- `src/app/App.tsx:72` → code. En su lugar: el shell sigue componiendo `code`; el import profundo sube al index público y el estado de ese bloque sale de App.tsx.
- `src/app/App.tsx:73` → code. En su lugar: el shell sigue componiendo `code`; el import profundo sube al index público y el estado de ese bloque sale de App.tsx.
- `src/app/App.tsx:74` → code. En su lugar: el shell sigue componiendo `code`; el import profundo sube al index público y el estado de ese bloque sale de App.tsx.
- `src/app/App.tsx:77` → projects. En su lugar: el shell sigue componiendo `projects`; el import profundo sube al index público y el estado de ese bloque sale de App.tsx.
- `src/app/App.tsx:78` → chat. En su lugar: el shell sigue componiendo `chat`; el import profundo sube al index público y el estado de ese bloque sale de App.tsx.
- `src/app/App.tsx:79` → code. En su lugar: el shell sigue componiendo `code`; el import profundo sube al index público y el estado de ese bloque sale de App.tsx.
- `src/app/App.tsx:81` → code. En su lugar: el shell sigue componiendo `code`; el import profundo sube al index público y el estado de ese bloque sale de App.tsx.
- `src/app/App.tsx:82` → observability. En su lugar: el shell sigue componiendo `observability`; el import profundo sube al index público y el estado de ese bloque sale de App.tsx.
- `src/app/App.tsx:83` → projects. En su lugar: el shell sigue componiendo `projects`; el import profundo sube al index público y el estado de ese bloque sale de App.tsx.
- `src/app/App.tsx:84` → projects. En su lugar: el shell sigue componiendo `projects`; el import profundo sube al index público y el estado de ese bloque sale de App.tsx.
- `src/app/App.tsx:88` → projects. En su lugar: el shell sigue componiendo `projects`; el import profundo sube al index público y el estado de ese bloque sale de App.tsx.
- `src/app/App.tsx:90` → onboarding. En su lugar: el shell sigue componiendo `onboarding`; el import profundo sube al index público y el estado de ese bloque sale de App.tsx.
- `src/app/App.tsx:91` → chat. En su lugar: el shell sigue componiendo `chat`; el import profundo sube al index público y el estado de ese bloque sale de App.tsx.
- `src/app/App.tsx:92` → screen. En su lugar: el shell sigue componiendo `screen`; el import profundo sube al index público y el estado de ese bloque sale de App.tsx.
- `src/app/App.tsx:95` → settings. En su lugar: el shell sigue componiendo `settings`; el import profundo sube al index público y el estado de ese bloque sale de App.tsx.
- `src/app/App.tsx:103` → @terminus/tasks. En su lugar: paquete viejo @terminus/tasks (tarea 1.9): no se copia el adaptador; el tipo sale del cliente generado o el archivo se borra si solo reexporta.
- `src/app/App.tsx:104` → machines. En su lugar: el shell sigue componiendo `machines`; el import profundo sube al index público y el estado de ese bloque sale de App.tsx.
- `src/app/App.tsx:105` → machines. En su lugar: el shell sigue componiendo `machines`; el import profundo sube al index público y el estado de ese bloque sale de App.tsx.
- `src/app/App.tsx:106` → projects. En su lugar: el shell sigue componiendo `projects`; el import profundo sube al index público y el estado de ese bloque sale de App.tsx.
- `src/app/App.tsx:107` → projects. En su lugar: el shell sigue componiendo `projects`; el import profundo sube al index público y el estado de ese bloque sale de App.tsx.
- `src/app/App.tsx:108` → projects. En su lugar: el shell sigue componiendo `projects`; el import profundo sube al index público y el estado de ese bloque sale de App.tsx.
- `src/app/App.tsx:109` → projects. En su lugar: el shell sigue componiendo `projects`; el import profundo sube al index público y el estado de ese bloque sale de App.tsx.
- `src/app/App.tsx:110` → projects. En su lugar: el shell sigue componiendo `projects`; el import profundo sube al index público y el estado de ese bloque sale de App.tsx.
- `src/app/App.tsx:114` → machines. En su lugar: el shell sigue componiendo `machines`; el import profundo sube al index público y el estado de ese bloque sale de App.tsx.
- `src/app/App.tsx:117` → machines. En su lugar: el shell sigue componiendo `machines`; el import profundo sube al index público y el estado de ese bloque sale de App.tsx.
- `src/app/App.tsx:118` → machines. En su lugar: el shell sigue componiendo `machines`; el import profundo sube al index público y el estado de ese bloque sale de App.tsx.
- `src/app/App.tsx:120` → machines. En su lugar: el shell sigue componiendo `machines`; el import profundo sube al index público y el estado de ese bloque sale de App.tsx.
- `src/app/App.tsx:122` → machines. En su lugar: el shell sigue componiendo `machines`; el import profundo sube al index público y el estado de ese bloque sale de App.tsx.
- `src/app/App.tsx:125` → projects. En su lugar: el shell sigue componiendo `projects`; el import profundo sube al index público y el estado de ese bloque sale de App.tsx.
- `src/app/App.tsx:127` → chat. En su lugar: el shell sigue componiendo `chat`; el import profundo sube al index público y el estado de ese bloque sale de App.tsx.
- `src/app/App.tsx:128` → projects. En su lugar: el shell sigue componiendo `projects`; el import profundo sube al index público y el estado de ese bloque sale de App.tsx.
- `src/app/App.tsx:129` → projects. En su lugar: el shell sigue componiendo `projects`; el import profundo sube al index público y el estado de ese bloque sale de App.tsx.
- `src/app/App.tsx:130` → projects. En su lugar: el shell sigue componiendo `projects`; el import profundo sube al index público y el estado de ese bloque sale de App.tsx.
- `src/app/App.tsx:131` → projects. En su lugar: el shell sigue componiendo `projects`; el import profundo sube al index público y el estado de ese bloque sale de App.tsx.
- `src/app/App.tsx:132` → projects. En su lugar: el shell sigue componiendo `projects`; el import profundo sube al index público y el estado de ese bloque sale de App.tsx.
- `src/app/App.tsx:133` → projects. En su lugar: el shell sigue componiendo `projects`; el import profundo sube al index público y el estado de ese bloque sale de App.tsx.
- `src/app/App.tsx:134` → projects. En su lugar: el shell sigue componiendo `projects`; el import profundo sube al index público y el estado de ese bloque sale de App.tsx.
- `src/app/App.tsx:135` → projects. En su lugar: el shell sigue componiendo `projects`; el import profundo sube al index público y el estado de ese bloque sale de App.tsx.
- `src/app/App.tsx:139` → settings. En su lugar: el shell sigue componiendo `settings`; el import profundo sube al index público y el estado de ese bloque sale de App.tsx.
- `src/app/App.tsx:140` → settings. En su lugar: el shell sigue componiendo `settings`; el import profundo sube al index público y el estado de ese bloque sale de App.tsx.
- `src/app/App.tsx:143` → settings. En su lugar: el shell sigue componiendo `settings`; el import profundo sube al index público y el estado de ese bloque sale de App.tsx.
- `src/app/App.tsx:145` → settings. En su lugar: el shell sigue componiendo `settings`; el import profundo sube al index público y el estado de ese bloque sale de App.tsx.
- `src/app/App.tsx:146` → settings. En su lugar: el shell sigue componiendo `settings`; el import profundo sube al index público y el estado de ese bloque sale de App.tsx.
- `src/app/App.tsx:152` → @terminus/protocol. En su lugar: paquete viejo @terminus/protocol (tarea 1.9): no se copia el adaptador; el tipo sale del cliente generado o el archivo se borra si solo reexporta.
- `src/app/App.tsx:153` → @terminus/protocol. En su lugar: paquete viejo @terminus/protocol (tarea 1.9): no se copia el adaptador; el tipo sale del cliente generado o el archivo se borra si solo reexporta.
- `src/app/App.tsx:154` → chat. En su lugar: el shell sigue componiendo `chat`; el import profundo sube al index público y el estado de ese bloque sale de App.tsx.
- `src/app/App.tsx:155` → chat. En su lugar: el shell sigue componiendo `chat`; el import profundo sube al index público y el estado de ese bloque sale de App.tsx.
- `src/app/App.tsx:156` → code. En su lugar: el shell sigue componiendo `code`; el import profundo sube al index público y el estado de ese bloque sale de App.tsx.
- `src/app/App.tsx:157` → conversation-handoff. En su lugar: el shell sigue componiendo `conversation-handoff`; el import profundo sube al index público y el estado de ese bloque sale de App.tsx.
- `src/app/App.tsx:158` → drafts. En su lugar: el shell sigue componiendo `drafts`; el import profundo sube al index público y el estado de ese bloque sale de App.tsx.
- `src/app/App.tsx:159` → machines. En su lugar: el shell sigue componiendo `machines`; el import profundo sube al index público y el estado de ese bloque sale de App.tsx.
- `src/app/App.tsx:160` → machines. En su lugar: el shell sigue componiendo `machines`; el import profundo sube al index público y el estado de ese bloque sale de App.tsx.
- `src/app/App.tsx:161` → service-stream. En su lugar: el shell sigue componiendo `service-stream`; el import profundo sube al index público y el estado de ese bloque sale de App.tsx.
- `src/app/App.tsx:162` → settings. En su lugar: el shell sigue componiendo `settings`; el import profundo sube al index público y el estado de ese bloque sale de App.tsx.
- `src/app/App.tsx:180` → sites. En su lugar: el shell sigue componiendo `sites`; el import profundo sube al index público y el estado de ese bloque sale de App.tsx.
- `src/app/App.tsx:181` → tabs. En su lugar: el shell sigue componiendo `tabs`; el import profundo sube al index público y el estado de ese bloque sale de App.tsx.
- `src/app/App.tsx:182` → task-queues. En su lugar: el shell sigue componiendo `task-queues`; el import profundo sube al index público y el estado de ese bloque sale de App.tsx.
- `src/app/App.tsx:2884` → chat. En su lugar: el shell sigue componiendo `chat`; el import profundo sube al index público y el estado de ese bloque sale de App.tsx.
- `src/app/App.tsx:4709` → chat. En su lugar: el shell sigue componiendo `chat`; el import profundo sube al index público y el estado de ese bloque sale de App.tsx.
- `src/app/App.tsx:5102` → chat. En su lugar: el shell sigue componiendo `chat`; el import profundo sube al index público y el estado de ese bloque sale de App.tsx.
- `src/app/App.tsx:5401` → machines. En su lugar: el shell sigue componiendo `machines`; el import profundo sube al index público y el estado de ese bloque sale de App.tsx.

### `src/app/main.tsx`

- `src/app/main.tsx:6` → settings. En su lugar: el shell sigue componiendo `settings`; el import profundo sube al index público y el estado de ese bloque sale de App.tsx.
- `src/app/main.tsx:19` → machines. En su lugar: el shell sigue componiendo `machines`; el import profundo sube al index público y el estado de ese bloque sale de App.tsx.
- `src/app/main.tsx:37` → settings. En su lugar: el shell sigue componiendo `settings`; el import profundo sube al index público y el estado de ese bloque sale de App.tsx.
- `src/app/main.tsx:116` → machines. En su lugar: el shell sigue componiendo `machines`; el import profundo sube al index público y el estado de ese bloque sale de App.tsx.

### `src/shell/AccountHeader.tsx`

- `src/shell/AccountHeader.tsx:10` → settings. En su lugar: al mudarse a `workspaces` no puede importar `settings` (R3): entra por props o por un slot que arma el shell.

### `src/shell/AgentDock.tsx`

- `src/shell/AgentDock.tsx:11` → projects. En su lugar: al mudarse a `chat` no puede importar `projects` (R3): entra por props o por un slot que arma el shell.
- `src/shell/AgentDock.tsx:12` → projects. En su lugar: al mudarse a `chat` no puede importar `projects` (R3): entra por props o por un slot que arma el shell.

### `src/shell/DeleteSpace.tsx`

- `src/shell/DeleteSpace.tsx:16` → machines. En su lugar: al mudarse a `workspaces` no puede importar `machines` (R3): entra por props o por un slot que arma el shell.

### `src/shell/FolderGroupHeader.tsx`

- `src/shell/FolderGroupHeader.tsx:11` → @terminus/design. En su lugar: paquete viejo @terminus/design (tarea 1.9): no se copia el adaptador; el tipo sale del cliente generado o el archivo se borra si solo reexporta.
- `src/shell/FolderGroupHeader.tsx:16` → projects. En su lugar: pasa a ser import interno de `projects`.
- `src/shell/FolderGroupHeader.tsx:17` → projects. En su lugar: pasa a ser import interno de `projects`.
- `src/shell/FolderGroupHeader.tsx:18` → projects. En su lugar: pasa a ser import interno de `projects`.

### `src/shell/FolderNotice.tsx`

- `src/shell/FolderNotice.tsx:3` → machines. En su lugar: al mudarse a `projects` no puede importar `machines` (R3): entra por props o por un slot que arma el shell.

### `src/shell/GlobalSearch.tsx`

- `src/shell/GlobalSearch.tsx:15` → projects. En su lugar: pasa a ser import interno de `projects`.
- `src/shell/GlobalSearch.tsx:16` → projects. En su lugar: pasa a ser import interno de `projects`.

### `src/shell/LegacyDanilFooterEntry.tsx`

- `src/shell/LegacyDanilFooterEntry.tsx:7` → settings. En su lugar: el archivo se borra; no hace falta reemplazar el import.

### `src/shell/MachineCard.tsx`

- `src/shell/MachineCard.tsx:1` → @terminus/protocol. En su lugar: paquete viejo @terminus/protocol (tarea 1.9): no se copia el adaptador; el tipo sale del cliente generado o el archivo se borra si solo reexporta.
- `src/shell/MachineCard.tsx:8` → machines. En su lugar: pasa a ser import interno de `machines`.

### `src/shell/OrganizationMenu.tsx`

- `src/shell/OrganizationMenu.tsx:1` → @terminus/computers. En su lugar: paquete viejo @terminus/computers (tarea 1.9): no se copia el adaptador; el tipo sale del cliente generado o el archivo se borra si solo reexporta.

### `src/shell/OrganizationRailGroup.tsx`

- `src/shell/OrganizationRailGroup.tsx:5` → machines. En su lugar: al mudarse a `workspaces` no puede importar `machines` (R3): entra por props o por un slot que arma el shell.
- `src/shell/OrganizationRailGroup.tsx:6` → settings. En su lugar: al mudarse a `workspaces` no puede importar `settings` (R3): entra por props o por un slot que arma el shell.

### `src/shell/SessionGate.tsx`

- `src/shell/SessionGate.tsx:10` → onboarding. En su lugar: el shell sigue componiendo `onboarding`; el import profundo sube al index público y el estado de ese bloque sale de App.tsx.
- `src/shell/SessionGate.tsx:11` → settings. En su lugar: el shell sigue componiendo `settings`; el import profundo sube al index público y el estado de ese bloque sale de App.tsx.

### `src/shell/Sidebar.tsx`

- `src/shell/Sidebar.tsx:1` → @terminus/tasks. En su lugar: paquete viejo @terminus/tasks (tarea 1.9): no se copia el adaptador; el tipo sale del cliente generado o el archivo se borra si solo reexporta.
- `src/shell/Sidebar.tsx:27` → projects. En su lugar: pasa a ser import interno de `projects`.
- `src/shell/Sidebar.tsx:28` → projects. En su lugar: pasa a ser import interno de `projects`.
- `src/shell/Sidebar.tsx:29` → projects. En su lugar: pasa a ser import interno de `projects`.
- `src/shell/Sidebar.tsx:30` → projects. En su lugar: pasa a ser import interno de `projects`.
- `src/shell/Sidebar.tsx:31` → projects. En su lugar: pasa a ser import interno de `projects`.
- `src/shell/Sidebar.tsx:32` → projects. En su lugar: pasa a ser import interno de `projects`.
- `src/shell/Sidebar.tsx:33` → projects. En su lugar: pasa a ser import interno de `projects`.
- `src/shell/Sidebar.tsx:34` → projects. En su lugar: pasa a ser import interno de `projects`.
- `src/shell/Sidebar.tsx:48` → machines. En su lugar: al mudarse a `projects` no puede importar `machines` (R3): entra por props o por un slot que arma el shell.
- `src/shell/Sidebar.tsx:52` → projects. En su lugar: pasa a ser import interno de `projects`.

### `src/shell/SidebarFilter.tsx`

- `src/shell/SidebarFilter.tsx:17` → projects. En su lugar: pasa a ser import interno de `projects`.
- `src/shell/SidebarFilter.tsx:18` → projects. En su lugar: pasa a ser import interno de `projects`.

### `src/shell/Storage.tsx`

- `src/shell/Storage.tsx:1` → @terminus/protocol. En su lugar: paquete viejo @terminus/protocol (tarea 1.9): no se copia el adaptador; el tipo sale del cliente generado o el archivo se borra si solo reexporta.
- `src/shell/Storage.tsx:36` → machines. En su lugar: pasa a ser import interno de `machines`.

### `src/shell/TaskNotifier.tsx`

- `src/shell/TaskNotifier.tsx:8` → settings. En su lugar: el shell sigue componiendo `settings`; el import profundo sube al index público y el estado de ese bloque sale de App.tsx.
- `src/shell/TaskNotifier.tsx:12` → projects. En su lugar: el shell sigue componiendo `projects`; el import profundo sube al index público y el estado de ese bloque sale de App.tsx.
- `src/shell/TaskNotifier.tsx:13` → @terminus/protocol. En su lugar: paquete viejo @terminus/protocol (tarea 1.9): no se copia el adaptador; el tipo sale del cliente generado o el archivo se borra si solo reexporta.

### `src/shell/UsageTool.tsx`

- `src/shell/UsageTool.tsx:4` → @terminus/computers. En su lugar: paquete viejo @terminus/computers (tarea 1.9): no se copia el adaptador; el tipo sale del cliente generado o el archivo se borra si solo reexporta.
- `src/shell/UsageTool.tsx:16` → settings. En su lugar: pasa a ser import interno de `settings`.
- `src/shell/UsageTool.tsx:17` → chat. En su lugar: al mudarse a `settings` no puede importar `chat` (R3): entra por props o por un slot que arma el shell.

### `src/shell/WorkspaceColumn.tsx`

- `src/shell/WorkspaceColumn.tsx:9` → machines. En su lugar: al mudarse a `workspaces` no puede importar `machines` (R3): entra por props o por un slot que arma el shell.
- `src/shell/WorkspaceColumn.tsx:10` → projects. En su lugar: al mudarse a `workspaces` no puede importar `projects` (R3): entra por props o por un slot que arma el shell.
- `src/shell/WorkspaceColumn.tsx:11` → settings. En su lugar: al mudarse a `workspaces` no puede importar `settings` (R3): entra por props o por un slot que arma el shell.

### `src/shell/attention.ts`

- `src/shell/attention.ts:4` → machines. En su lugar: al mudarse a `projects` no puede importar `machines` (R3): entra por props o por un slot que arma el shell.

### `src/shell/context-attention.ts`

- `src/shell/context-attention.ts:1` → @terminus/protocol. En su lugar: paquete viejo @terminus/protocol (tarea 1.9): no se copia el adaptador; el tipo sale del cliente generado o el archivo se borra si solo reexporta.

### `src/shell/dockLayout.ts`

- `src/shell/dockLayout.ts:10` → @terminus/tasks. En su lugar: paquete viejo @terminus/tasks (tarea 1.9): no se copia el adaptador; el tipo sale del cliente generado o el archivo se borra si solo reexporta.

### `src/shell/logo-src.ts`

- `src/shell/logo-src.ts:5` → machines. En su lugar: al mudarse a `workspaces` no puede importar `machines` (R3): entra por props o por un slot que arma el shell.

### `src/shell/machineUsage.ts`

- `src/shell/machineUsage.ts:1` → @terminus/protocol. En su lugar: paquete viejo @terminus/protocol (tarea 1.9): no se copia el adaptador; el tipo sale del cliente generado o el archivo se borra si solo reexporta.

### `src/shell/organization-desktop.ts`

- `src/shell/organization-desktop.ts:8` → @terminus/computers. En su lugar: paquete viejo @terminus/computers (tarea 1.9): no se copia el adaptador; el tipo sale del cliente generado o el archivo se borra si solo reexporta.
- `src/shell/organization-desktop.ts:21` → machines. En su lugar: el archivo se borra; no hace falta reemplazar el import.

### `src/shell/organization-edge.ts`

- `src/shell/organization-edge.ts:6` → @terminus/computers. En su lugar: paquete viejo @terminus/computers (tarea 1.9): no se copia el adaptador; el tipo sale del cliente generado o el archivo se borra si solo reexporta.

### `src/shell/organization-menu-state.ts`

- `src/shell/organization-menu-state.ts:1` → @terminus/computers. En su lugar: paquete viejo @terminus/computers (tarea 1.9): no se copia el adaptador; el tipo sale del cliente generado o el archivo se borra si solo reexporta.

### `src/shell/organization-session-gate.ts`

- `src/shell/organization-session-gate.ts:1` → @terminus/computers. En su lugar: paquete viejo @terminus/computers (tarea 1.9): no se copia el adaptador; el tipo sale del cliente generado o el archivo se borra si solo reexporta.

### `src/shell/session-groups.ts`

- `src/shell/session-groups.ts:7` → machines. En su lugar: el shell sigue componiendo `machines`; el import profundo sube al index público y el estado de ese bloque sale de App.tsx.

### `src/shell/sidebarTasks.ts`

- `src/shell/sidebarTasks.ts:2` → @terminus/tasks. En su lugar: paquete viejo @terminus/tasks (tarea 1.9): no se copia el adaptador; el tipo sale del cliente generado o el archivo se borra si solo reexporta.

### `src/shell/usage.ts`

- `src/shell/usage.ts:6` → machines. En su lugar: al mudarse a `settings` no puede importar `machines` (R3): entra por props o por un slot que arma el shell.
- `src/shell/usage.ts:7` → settings. En su lugar: pasa a ser import interno de `settings`.

### `src/shell/workspace-added-transport.ts`

- `src/shell/workspace-added-transport.ts:5` → @terminus/computers. En su lugar: paquete viejo @terminus/computers (tarea 1.9): no se copia el adaptador; el tipo sale del cliente generado o el archivo se borra si solo reexporta.

### `src/shell/workspace-added-wiring.ts`

- `src/shell/workspace-added-wiring.ts:9` → @terminus/computers. En su lugar: paquete viejo @terminus/computers (tarea 1.9): no se copia el adaptador; el tipo sale del cliente generado o el archivo se borra si solo reexporta.
- `src/shell/workspace-added-wiring.ts:10` → @terminus/fleet. En su lugar: paquete viejo @terminus/fleet (tarea 1.9): no se copia el adaptador; el tipo sale del cliente generado o el archivo se borra si solo reexporta.
- `src/shell/workspace-added-wiring.ts:17` → machines. En su lugar: al mudarse a `workspaces` no puede importar `machines` (R3): entra por props o por un slot que arma el shell.

### Al revés: otros paquetes importan el shell

R3 también se rompe cuando una feature importa el shell. El shell les pasa el dato por props, o el símbolo se muda a `session` / a la feature dueña y el barril deja de reexportarlo.

- `packages/features/code/src/screens/TaskSide.tsx:7` → UsagePanel de UsageTool. En su lugar: settings lo exporta; code lo recibe por slot desde el shell.
- `packages/features/code/src/screens/TaskSide.tsx:8` → tipo Usage de usage.ts. En su lugar: el tipo vive en settings/queries/usage.ts; code no lo importa.
- `packages/features/onboarding/src/queries/onboarding-store.ts:3` → sealFirstFreeWorkspace. En su lugar: se muda a onboarding/queries/first-free-workspace.ts; el barril lo suelta.
- `packages/features/onboarding/src/screens/ConnectAccount.tsx:13` → noteFirstLoginSignedIn. En su lugar: se muda a onboarding/queries/first-login.ts.
- `packages/features/onboarding/src/components/Phases.tsx:13` → WindowControls. En su lugar: se queda en el shell; onboarding lo recibe como slot.
- `packages/features/settings/src/components/DeskPlan.tsx:6` → sessionRailState. En su lugar: el provider se queda en el shell; settings lo recibe por props.
- `packages/features/settings/src/components/SessionAccounts.tsx:8` → accountReturn, noteWebAccountMode, sessionRailState. En su lugar: accountReturn va a account; noteWebAccountMode va a session; sessionRailState entra por props.
- `packages/features/settings/src/components/WorkspaceAccount.tsx:11` → MoveWorkspaceDialog, sessionRailState. En su lugar: el diálogo va a workspaces y el shell lo monta como slot; el estado del riel entra por props.
- `packages/features/settings/src/components/NotifyBehavior.tsx:4` → NOTIFY_PREF y NotifyChoice. En su lugar: la preferencia pasa a settings; TaskNotifier la recibe por prop.
- `packages/features/settings/src/components/DanilAccountsEntry.tsx:2` → usesGroupAccounts. En su lugar: va a session (session-menu-mode.ts).
- `packages/features/settings/src/components/Workspaces.tsx:19` → MarcaDeWorkspace. En su lugar: va con WorkspaceColumn a workspaces; settings la recibe por slot.
- `packages/session/src/window-session.tsx:28` → sessionRailState. En su lugar: el provider se queda en el shell; session no importa el riel, recibe el contexto activo por el contrato que ya tiene.
- `apps/desktop/src/web/window.tsx:5` → sessionRailState. En su lugar: la web es un app, puede componer el shell; deja de leer el singleton y usa el provider.
- `apps/desktop/src/web/window.tsx:187` → main.tsx. En su lugar: se queda: es el arranque.

