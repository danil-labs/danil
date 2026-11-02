# Danil móvil

Una app de iOS y Android para ver y dirigir Danil desde el teléfono: qué
tareas te necesitan, aprobar o rechazar permisos, contestar preguntas, escribirle
a una tarea o a un agente y crear tareas nuevas. No es un editor ni una terminal.

Trabaja sobre las máquinas de la persona a través de **Danil Computers**: por
omisión su VM administrada por Danil, y además cualquier otra máquina donde
Danil o su Seldon Host esté conectado a su cuenta (una Mac, otro VPS). Cada
máquina sigue siendo la dueña de sus tareas; el teléfono es otro cliente más,
como la web.

## Decisiones

- **Expo (React Native, TypeScript)**, con módulos nativos de Swift o Kotlin
  solo cuando Expo no alcance. Es el mismo camino que tomó Orca
  (`stablyai/orca`, MIT): una base de código para las dos plataformas,
  notificaciones push reales y actualizaciones OTA.
- **Cuenta de Danil.** Se entra como en app.danil.ai: correo y contraseña, o
  Google y Microsoft por el navegador del sistema con PKCE
  (`expo-web-browser`). Lo único que se guarda es la sesión de Supabase, en el
  llavero (`expo-secure-store`, en trozos porque pasa de 2 KB). Hermes no trae
  WebCrypto: `apps/mobile/src/lib/supabase.ts` lo completa con `expo-crypto` para que PKCE
  use S256 y no `plain`.
- **Las reglas de la web valen igual** (`@terminus/computers`): abrir la app
  nunca enciende una máquina; cada máquina se ve solo encendida, apagada o
  encendiéndose, nunca como error; escribir, crear una tarea, aprobar o
  contestar despiertan una VM administrada por el relay; una máquina propia
  apagada no se puede despertar y se dice en tono neutro. Qué se puede
  encender lo decide `wakes()`, la misma regla que la web (#154): manda
  `wakeable` si el plano de control lo da, luego `kind` (`physical`, `vps`…),
  luego el proveedor (`aws-ec2`, o ninguno en filas viejas). Un motor que no
  habla el contrato (`outdated`) no recibe acciones. Con la VM apagada las
  lecturas vienen de la copia del relay (`cached: {updated_at}`) y la app dice
  de qué hora es; sin copia, `machine_off` es una lista vacía. Una VM que se
  apaga mientras la app la ve se vuelve a leer una vez de esa copia, que trae
  lo último que guardó al apagarse. El chat abierto se relee al volver a la
  app o a la pantalla, cuando su máquina cambia (encendida, apagada, el enlace
  que se reabre) y tras `segment_saved`; las lecturas se juntan y no borran lo
  que se escribe en vivo.
- **Lista cerrada de comandos en los dos caminos** (`APP_COMMANDS` en
  `packages/protocol`): son funciones de ventana con el contrato renombrado.
  El relay de Danil Computers solo bloquea las funciones de escritorio, así que
  la lista la hace cumplir el cliente (`apps/mobile/src/lib/hosts.ts`, `command_not_allowed`);
  el bridge de desarrollo contesta 403 con la misma lista. Ver «Lista cerrada» abajo.
- **La lista de tareas es la del sidebar del escritorio (#151)**, adaptada al
  teléfono y derivada del mismo código (`@terminus/tasks`): lista plana de todas
  las carpetas y todas las máquinas, un solo filtro, tarjeta de dos líneas y
  dock de agentes (ver «Patrones del teléfono»). Las palabras salen de las
  mismas claves que los catálogos del escritorio (`WORDS` en
  `@terminus/design`, vigiladas por el guard `shared-design`).
- **Listas nativas, sin barra de pestañas** (diseño «listas nativas v2»,
  aprobado el 2026-10-30; ver «Listas nativas» abajo). Inicio es la única raíz:
  arriba el workspace, la lupa, Personalizar, Nueva tarea y el avatar; el
  título grande es el espacio y abre su menú. Todo lo demás se apila encima
  con su atrás. Nada flota.
- **Tema claro y oscuro** según el sistema, con los tokens por omisión del
  escritorio en `apps/desktop/src/styles/global.css`: Violeta en claro y Grafito en oscuro.
- **Solo los workspaces vinculados a la cuenta.** Con la sesión de Danil
  iniciada en una computadora, su motor vincula todos sus workspaces; no hay
  vínculo a mano. Cada fila de `/v1/computers`
  trae `workspaces`, los ids que esa máquina vinculó a la cuenta que entró; el
  relay ya rechaza el resto (`workspace_not_linked`) y el teléfono filtra otra
  vez la lista, la atención y los eventos, por el workspace del sobre y por el
  de `payload.workspace` (`linkedWorkspaces`, `onlyLinked`, `linkedEvents` en
  `@terminus/computers`; prueba en `npm test`). `attention` llega como la lista
  entera de la máquina, que reemplaza, o como una entrada suelta, que cambia solo
  su workspace (`mergeAttention`). Una fila sin el campo es de un plano de control
  anterior y no se filtra.
- **La lista de workspaces es de la cuenta.** Además de lo que listan las
  máquinas, el teléfono lee el registro de la cuenta (`GET /v1/workspaces`,
  `listWorkspaces`) al listar las computadoras: un workspace cuyas máquinas
  duermen y no tienen copia en el relay sigue en la lista, con sus carpetas del
  registro en la máquina donde nacieron (`workspaceEntries`,
  `withAccountFolders` en `engine.ts`). Lo que una máquina contesta manda; el
  registro solo llena lo que falta. Las tareas siguen siendo de cada máquina:
  las de una dormida salen de la copia del relay o no salen, y crear una ahí la
  enciende. «Sin workspaces» solo se dice con el registro vacío y ninguna
  máquina con un workspace ligado. Sin la ruta (un plano de control anterior o
  sin red), lo de antes.
- **El fondo de los chats es del workspace** (`chat_background`): la imagen
  propia se pinta detrás de la conversación con el velo del workspace
  (`chatBackgroundView` en `@terminus/protocol`). Los patrones del escritorio
  (`dusk`) salen de CSS con tokens que `@terminus/design` no repite, así que en
  el teléfono un patrón es el fondo liso del tema.
- **El teléfono no ve la pantalla de la máquina.** Habla los comandos de la
  ventana a través del relay (o del bridge en desarrollo).
- **Enlaces del chat.** Un enlace a una tarea abre la tarea solo si es del
  mismo workspace; si no, lo dice (`chat.link.other_workspace`, como la
  ventana). Dentro de una visualización (`WebFrame`) no se navega: un http(s)
  se abre en el navegador del sistema solo si lo tocó la persona (en iOS,
  `navigationType` `click`; en Android, que no lo distingue, se pregunta
  antes). Lo que la página navegue sola se bloquea.
- **Mermaid en el WebView:** `mermaid@12.2.0` exacto de jsDelivr con SRI
  (`sha384`, el mismo archivo que el paquete de npm), una CSP que solo deja ese
  origen para scripts y nada de red, y la definición escapada dentro del
  `<script>` (`<`, U+2028 y U+2029). Al cambiar de versión se recalcula el hash
  (ver `apps/mobile/src/ui/chat/Mermaid.tsx`).

## En el navegador

La misma app se compila para web y vive dentro de Danil web, en
`/terminus/m/` (`apps/desktop/scripts/web-mobile.mjs`, último paso de
`pnpm web:build`). La web de escritorio manda ahí a los teléfonos y cada una
tiene un enlace a la otra («Ver la versión de escritorio» en la hoja de
workspaces, que va a la raíz que fijó la compilación,
`EXPO_PUBLIC_TERMINUS_WEB_BASE`). Lo que cambia en el navegador va en archivos `.web.ts(x)`:

- **Sesión:** la de la app de Danil en el mismo origen (`supabase.web.ts`),
  como la web de escritorio; sin sesión se va a su inicio con
  `?next=/terminus/m/` para volver aquí (`signin.web.tsx`). No hay bridge.
- **Instalable (PWA):** `public/index.html` es la plantilla de Expo con las
  etiquetas de iOS y Android y `viewport-fit=cover`; `public/icons/` sale de
  `assets/icon.png` (192, 512, maskable 512 con el isotipo al 66 % y
  `apple-touch-icon` de 180). El manifest y sus cabeceras los escribe
  `apps/desktop/scripts/web-phone-pwa.mjs`: `id` y `start_url` `/terminus/m/`
  (no se cambian: obligaría a reinstalar) y `scope: "/"`, porque el inicio de
  sesión de Danil vive en `/` y en iOS fuera del scope abriría Safari aparte.
  La app de Danil tiene su propio manifest con `id: "/"`; el `id` distinto deja
  instalar las dos. `index.html`, el manifest y `sw.js` se revalidan y solo
  `_expo/static/*` (con hash) se guarda largo. En iOS la app instalada no
  comparte almacenamiento con Safari: se inicia sesión una vez dentro de ella.
- **Avisos push:** `apps/mobile/public/sw.js` solo muestra avisos (`push` y
  `notificationclick`, sin `fetch` ni caché) y vive con scope `<base>m/`: en
  app.danil.ai la raíz es del service worker de Appv2. Lo registra
  `apps/mobile/src/lib/push.web.ts` cuando la persona activa «Avisos de tareas» en Cuenta de
  Danil; la suscripción se guarda en Danil Computers, cuyo relay avisa cuando una
  tarea termina, se detiene o pide algo, también con el navegador cerrado. El
  aviso trae solo identificadores: el worker arma la ruta (`?to=/task/…`) y no
  muestra texto del chat, así que con la app cerrada dice que se detuvo y no el
  motivo. Con la app abierta, el aviso local, la campana y el chat leen la clase
  del turno (`sin_cupo`, la credencial, …) y dicen la misma frase que el
  escritorio. El destino del aviso de inicio de sesión lo escribe el
  build (`phoneWorker`). En iPhone solo funciona instalada en el inicio (iOS
  16.4 o posterior). Cerrar sesión borra la suscripción antes de soltar el token.
- **Lo que se recuerda:** `localStorage` en lugar del llavero (`store.web.ts`).
- **Visualizaciones y archivos HTML:** el `iframe` de la ventana (`srcdoc`,
  `allow-scripts` sin `allow-same-origin`) en lugar del WebView. Un PDF no se
  abre dentro (`frame-src 'self'`).
- **Mermaid:** el paquete, cargado al primer diagrama; la política de la página
  no deja traerlo de afuera.
- **Avisos del sistema:** todavía no; la campana sigue contando.

## Patrones del teléfono

| Escritorio (#151) | Teléfono | Por qué |
|---|---|---|
| Lista plana «Tareas»: cada tarea en su sitio, la que te necesita lo dice su marca | Igual, en una sola columna | La tarea no salta de lugar cuando cambia de estado |
| Botón «Filtrar y agrupar» con popover (carpetas, agente, agrupar) | El mismo botón al lado de la línea de alcance; abre una hoja del sistema (`formSheet`) con las mismas opciones y palabras | Un popover no cabe ni se toca bien con el dedo; la hoja es el popover del teléfono y se cierra con el gesto |
| Tarjeta de dos líneas: estado + título + chincheta; debajo, lo que pide o carpeta, agente, máquina y PR | Igual, sacado de `taskCard`; sin PR ni worktree (el teléfono no lee git); la máquina solo con más de una | Misma información en el mismo orden; lo que el teléfono no puede saber no se inventa |
| Dock de agentes: una fila de caras al pie del sidebar; clic abre el chat, clic derecho «Ver sus tareas» | Una fila de caras **arriba de la lista**, del mismo orden y reparto (`planDock`, «+k»); tocar abre su chat, mantener pulsado filtra por sus tareas; «Ver todos» abre una hoja | Abajo le quita alto a la lista; arriba se ve al entrar y se va al hacer scroll, sin robar alto a la lista. Mantener pulsado es el clic derecho del teléfono |
| SpaceBar | Las píldoras de space bajo el workspace, como antes | El escritorio la conserva; es el alcance de la lista |
| Tarjeta flotante al pasar el mouse (`TaskHoverCard`): título, último mensaje, Carpeta, Agente, Proveedor; Abrir, Fijar, Archivar | **Mantener pulsada** la tarjeta abre una hoja del sistema (`preview`, `fitToContents`) con lo mismo, de `taskPreview` (`@terminus/tasks`), más Máquina si hay más de una; Abrir, Fijar/Desfijar y Archivar con los comandos de la ventana, y «Cambiarle el nombre» (`rename_session`, como el menú de la fila) | El teléfono no tiene hover; mantener pulsado es su gesto de vista previa, y la hoja se cierra con el gesto |
| Cuadro de escribir (`Chat.tsx`): adjuntar y permisos a la izquierda; modelo y razonamiento, y enviar/detener a la derecha; `/`, `@`, `!`; cola con «Mandar ahora» | El mismo cuadro y la misma fila (`apps/mobile/src/ui/Composer.tsx`), con el texto que crece hasta seis líneas; los selectores son hojas desde abajo; `/` y `@` abren la lista sobre el cuadro; `!` lo vuelve terminal («Ejecutar»). En una tarea nueva, encima del cuadro: «Ejecutar en» (más de una máquina), Carpeta, Rama base (con git) y Agente | Popovers y menús no se tocan con el dedo; una fila compacta y hojas sí |
| Ajustes → Proveedores de IA en la web (#154): una tarjeta por proveedor y correo, consumo una vez, chapas de máquina, «Iniciar sesión en otra máquina» | La misma pantalla (`accounts`), desde la hoja de workspaces (sección Máquinas); el inicio sin pantalla de la máquina (enlace y código) va en una hoja; cerrar sesión pide confirmar | Es la misma regla (`groupAccounts` en `@terminus/computers`); el teléfono abre el enlace en el navegador del sistema y ahí mismo se copia el código |
| Pestaña Memoria de la vista de proyecto: alcance Proyecto, Workspace o encargado; escribir a mano, editar, borrar; historial por entrada y copias `.conflicto-*` marcadas | Pantalla `memory/[workspace]` desde la hoja de workspaces (sección Memoria, un renglón por workspace de la cuenta): alcance Workspace o cada proyecto del registro; editar y escribir en una tarjeta en la misma pantalla; el historial se despliega bajo la entrada y tocar una versión muestra su texto. Habla **directo con el Worker** (`/v1/workspaces/:id/memory/*`, cliente de `@terminus/computers`, lógica en `apps/mobile/src/lib/memory.ts`), nunca con el relay: funciona con todas las máquinas apagadas y no enciende ninguna. Avisa la copia de un conflicto al guardar, un borrado que no pisó (409) y una memoria ocupada (503) sin perder lo escrito | La memoria vive en el repo de la cuenta (D8): el teléfono no tiene motor que la guarde; los encargados no están en el registro, así que su memoria todavía no se ofrece |
| Íconos de Lucide | Los mismos trazos (`apps/mobile/src/ui/lucide.ts`, `apps/mobile/src/ui/Icon.tsx`) con react-native-svg; las marcas de proveedor de `apps/desktop/src/ui/icons.tsx` en `apps/mobile/src/ui/BrandMark.tsx` | Los SF Symbols no existen en Android: la chincheta y el filtro no se veían en el teléfono de prueba |

## Cómo está armado

```
                                  ┌─▶ VM de Danil (conector)
[App Expo] ──WSS + JWT──▶ [relay de Danil Computers] ─┤
     │                                               └─▶ Mac / VPS con Seldon Host
     └──HTTP + token (desarrollo)──▶ [bridge] ──RPC1──▶ [motor del lab]
```

- `apps/mobile/src/lib/account.tsx` y `supabase.ts`: la sesión de la cuenta de Danil.
- `apps/mobile/src/lib/machines.tsx`: `GET /v1/computers` y una sola flota para
  todas (`accountFleet`, `@terminus/fleet`, una sesión de relay por máquina, lo
  último de cada una guardado en `sliceStorage.ts`), más el bridge si está
  emparejado (`bridgeHost`); la atención de cada una y los avisos.
- `apps/mobile/src/lib/hosts.ts` y `engine.ts` (sin React Native): una máquina, la lista
  cerrada y lo que el teléfono hace con su motor. Las tareas de un workspace
  salen de `list_live_sessions` por carpeta y para `""`, como la ventana; una
  tarea nueva es `send_message` sin sesión; la conversación, `load_session`;
  aprobaciones y preguntas, `pending_requests` y el turno de la pregunta.
- `apps/mobile/src/lib/workspaces.tsx`: el reparto entre máquinas, con la regla de la web
  (`groupWorkspaces`): un workspace de la cuenta tiene el mismo id en cada
  máquina (`apps/desktop/docs/account-workspace.md`), así que dos filas son el
  mismo workspace solo si su id es igual, nunca por nombre ni remoto. Se ven
  una vez; sus carpetas y tareas vienen de cada máquina, marcadas con ella
  (`host/id`), y cada acción va a la máquina de la tarea con el id que ella le
  da al workspace. Los spaces son los de la primera máquina (la VM administrada).

Los avisos salen en la app, igual para los dos caminos: una tarea que entra en
`approving`, `asked` o `failed` (evento `attention`) o un turno que termina bien
(`chat` con `done`; el motor marca `unseen` en cuanto arranca el turno).

| Ruta | Qué es |
|---|---|
| `signin` | Entrar con la cuenta de Danil; en desarrollo, el enlace al bridge. Siempre va primero: sin sesión no se sincroniza nada, tampoco por un bridge emparejado. El bridge solo existe en desarrollo (`__DEV__`); el lab sin cuenta es en desarrollo, en Android y con `EXPO_PUBLIC_TERMINUS_BRIDGE_ONLY=1` (`BRIDGE_WITHOUT_ACCOUNT`). En iOS siempre se inicia sesión |
| `(home)/index` | Inicio: workspace, lupa, Personalizar, Nueva tarea y avatar; el título grande es el espacio (su menú); las secciones de Personalizar, Agentes y las tareas en grupos. Deslizar: Fijar · Archivar; pulsación larga: el menú de la tarea |
| `search` | Buscar: el ⌘K del escritorio con sus chips; Recientes sin texto; Tareas (también subtareas), Archivadas (`archived_tasks`), Carpetas, Inbox y Acciones |
| `personalize` | Personalizar: secciones de Inicio, Filtrar (abre `filter`) y Agrupar |
| `profile` | Menú de perfil: Cuenta de Danil, Tema, Mantener despierta, Configuración, Puertos y Almacenamiento |
| `settings` | Configuración (Proveedores de IA, actividad, memoria, máquinas, bridge); con `section=account`, Cuenta de Danil |
| `inbox`, `inbox-thread` | El Inbox de Danil web de solo lectura y su conversación |
| `task-tools` | Herramientas del chat: sus subtareas |
| `(home)/notifications` | «Ahora» de todas las máquinas y «Antes», lo que llegó con la app abierta. Si se detuvo, el subtítulo dice por qué (el cupo, la credencial), leído del turno sin encender la máquina |
| `(home)/new` | Nueva tarea: el cuadro de escribir con «Ejecutar en» (la última usada, si no la VM), carpeta, rama base y agente; `!` la crea con un comando. La hoja de Carpeta termina en «Nueva carpeta» y «Clonar repo» (ver «Carpetas nuevas») |
| `preview` | Menú de una tarea (⋯ o pulsación larga): PR, Abrir, Cambiarle el nombre, Fijar, Archivar, Eliminar y Finalizar con confirmación; el cohete de la lista abre directamente la confirmación |
| `accounts` | Proveedores de IA: cuentas por proveedor y correo, consumo, máquinas, iniciar y cerrar sesión |
| `filter` | Hoja «Filtrar y agrupar» |
| `agents` | Hoja «Ver todos» del dock |
| `workspaces` | Cambiar de workspace: cada uno con sus máquinas y lo que te necesita (las máquinas, la cuenta y el bridge pasaron a `settings`) |
| `agent/[workspace]/[name]` | Conversaciones con el agente y cuadro para empezar otra |
| `task/[host]/[workspace]/[folder]/[id]` | Conversación en la máquina de la tarea: aprobaciones, preguntas y el cuadro de escribir (modelo, permisos, adjuntos, `/`, `@`, `!`, cola y detener). Un fallo muestra la frase de su clase y, si es el cupo o la credencial, el enlace a Cuentas |
| `pair` | Bridge de desarrollo; también `terminus-mobile://pair?url=…&token=…` |
| `auth/callback` | La vuelta del navegador del inicio con Google o Microsoft |

Las tareas nuevas proponen el proveedor y el modelo de la tarea más reciente de
esa máquina (o del agente); si no hay ninguna, el primer proveedor disponible.
El cuadro deja cambiarlos, igual que el razonamiento y los permisos.

## Lista cerrada

`APP_COMMANDS` (`packages/protocol/src/commands.ts`) creció a propósito con lo
que piden la vista previa, el cuadro de escribir y las cuentas; cada grupo
lleva su comentario allí:

| Para qué | Lecturas | Acciones |
|---|---|---|
| Vista previa y finalizar | `task_blockers` | `set_session_pinned`, `rename_session`, `set_task_archived`, `finish_task`, `delete_session` |
| Cuadro de escribir | `list_models`, `list_permission_modes`, `list_slash_menu`, `list_mentions`, `project_base_branches` | `run_shell_command`, `stop_shell_command`, `guardar_adjunto`, `guardar_imagen_pegada` (motores anteriores), `prepare_attachments`, `set_permission_mode` (cambiar el modo del turno en marcha; a automático aprueba lo pendiente) |
| Cambiar de proveedor (`provider_handoff_v1`; la UI llega en la tarea del teléfono) | `load_session` (con `can_hand_over` y `hand_over_blocked`) | `set_session_provider` (el siguiente turno abre sesión nueva o retoma la aparcada) |
| Almacenamiento por máquina (en Consumos) | `list_workspaces` sin workspace para capacidad; `list_storage` al abrir el detalle del workspace | — |
| Reloj del turno en curso | `list_live_turns` | — |
| Identidad de agentes | `list_agent_profiles`, `preview_file` | — |
| Cuentas de IA | `list_accounts`, `account_status`, `account_limits` | `add_account`, `login_account`, `submit_login_code`, `cancel_login`, `discard_account`, `remove_account`, `set_active_account` (el próximo turno corre con esta cuenta; no enciende la máquina) |
| Fondo del chat | `chat_background` | — |
| Chat enriquecido | `tree_show` (el árbol `terminus-chat-visuals`), `chat_visual_part`, `preview_file`, `attachment_preview` | — |
| Archivos de la tarea | `list_task_trees`, `tree_files`, `tree_show` (cualquier árbol de la tarea, solo lectura) | — |
| Carpetas nuevas | `get_project_directory`, `project_clone_status` | `create_project`, `start_project_clone`, `cancel_project_clone` |
| Registros de actividad por máquina | `list_activity`, `read_activity`, `read_activity_log` | — |
| PR en la tarjeta | `list_session_git` (por carpeta, con las visibles en `priority`) | — |
| Llevar trabajo | `work_status`, `work_key` | `work_export`, `work_read_part`, `work_write_part`, `work_import`, `work_cancel` |
| Espacios (UI nueva) | `list_spaces` | `create_space`, `rename_space`, `space_delete_preview` (lo que eliminar detiene o descarta), `delete_space` (con ese `seen`) |
| Mantener despierta (UI nueva) | `keep_awake_status` | `set_keep_awake` (`on`, `agent`, `off`) |
| Puertos (UI nueva) | `list_ports` | — |
| Archivadas (UI nueva) | `archived_tasks` (todas las carpetas; el relay la guarda en su espejo) | — |

**Máquinas con un motor anterior.** Las funciones de la UI nueva se agrupan en
`APP_FEATURES` (`packages/protocol`). Un motor que no conoce un comando contesta
`command` (o el relay `unsupported` / `command_not_allowed`, o la frase
`shell.service.command`); `Host.call` lo anota y falla con
`command_unsupported` y el comando en `detail` (`isUnknownCommand`,
`CommandSupport`). La UI pregunta `host.available(feature)`: `unknown` hasta la
primera respuesta, `yes` si contestó la lectura de la función y `no` si
rechazó cualquiera de sus comandos; el cambio avisa por `onChange`. La máquina
nunca sale desactualizada por eso, y al volver a encenderse se vuelve a saber.
`command_not_allowed` con `detail.scope` no cuenta: es el relay diciendo que un
comando `scope: "machine"` (como `set_keep_awake`) solo pasa desde la sesión por
omisión de la máquina. Sale `command_not_here` y la función no se oculta.

En Consumos, «Almacenamiento» consulta el resumen de disco al desplegarlo y el
workspace seleccionado al abrir una máquina o medir manualmente. No hay
barridos periódicos ni acciones de limpieza. Capacidad física y tamaño lógico
se muestran separados; un motor sin resumen conserva «capacidad no disponible».
Las respuestas de un contexto anterior se descartan y una desconexión conserva
la fecha de los datos anteriores, marcados como desactualizados.

**Qué enciende la VM.** El relay solo enciende con su lista de intención
(`INTENT_COMMANDS`: escribir, crear, aprobar, `!`, iniciar sesión…). Fijar,
renombrar, archivar, subir una imagen, agregar o quitar una cuenta, crear,
renombrar o eliminar un espacio (también su previa) y cambiar Mantener despierta no están en ella: para
esas (`WAKES_FIRST` en `apps/mobile/src/lib/hosts.ts`) el teléfono pide encenderla al plano de
control (`POST /v1/computers/:id/start`) y espera a que conteste antes de
mandarlas. Marcar vista, detener o cancelar nunca encienden; abrir la app, una
tarea, la vista previa o las cuentas tampoco.

**Carpetas nuevas.** En la hoja de Carpeta de la tarea nueva, «Nueva carpeta»
(`create_project` con nombre, sin ruta) y «Clonar repo» (dirección y nombre
opcional) crean la carpeta en la máquina elegida en «Ejecutar en», dentro de su
carpeta de proyectos (`get_project_directory`; en una VM administrada,
`SELDON_PROJECTS_DIR`, `~/code`). El relay solo llama `service invoke`, que no
abre el canal de `clone_project`: el clon se pide con `start_project_clone`
(contesta enseguida) y sigue en la máquina; su avance llega en el evento
`project_clone` (`waiting`, `receiving`… y al final `done` con el proyecto o el
error) y el teléfono pregunta además `project_clone_status` cada cinco segundos
por si se perdió un evento (`cloneRepo` en `apps/mobile/src/lib/engine.ts`).
Cerrar la hoja no detiene el clon; «Cancelar clon» manda `cancel_project_clone`.
Las dos son intenciones del relay: encienden la VM apagada. El space solo se
manda a la primera máquina del workspace, como al crear una tarea.

**Llevar trabajo.** En la tarea nueva, la hoja de Carpeta lista también las
carpetas de git de otras máquinas del workspace. Elegir una para crear la tarea
en otra máquina lleva su trabajo sin subir con `@terminus/carry`
(`apps/mobile/src/lib/carry.ts`): siempre sellado con la llave del destino
(`work_key`, fijada la primera vez en el llavero), partes de 512 KiB y los
`.env` sugeridos; si la llave cambió no lleva nada. El teléfono nunca trae
trabajo de vuelta. `work_import` y `work_cancel` son intenciones del relay; las
partes no. Sin comprobar en el simulador.

**Adjuntos.** El camino del motor para un archivo que viene de otro cliente es
`guardar_adjunto` (en base64): imágenes PNG, JPEG, WebP y GIF y documentos PDF,
texto, Office y OpenDocument, con el nombre original y un tope de 25 MiB. El
socket corta en 16 MiB por mensaje, así que el teléfono se queda en 11 MB. Un
motor anterior no anuncia `attachment_documents_v1` y el teléfono solo le manda
imágenes por `guardar_imagen_pegada`.

**Inicio de sesión sin pantalla** (#67 del motor): `add_account` deja la
cuenta vacía y `login_account` con modo `tuberia` arranca el CLI; los eventos
`account` de esa máquina traen el enlace (`url`), el código a comparar
(`confirm`, Codex y Grok, que terminan solos) o la petición de pegarlo
(`code`, Claude y Antigravity: `submit_login_code`) y el final (`done`, con
texto si falló). Cancelar es `cancel_login` y `discard_account`, que no borra
una cuenta que llegó a autenticarse.

## Probarla

Sin la sesión de nadie, contra el Danil Computers falso (`apps/mobile/scripts/fake-computers.mjs`:
login de Supabase, `/v1/computers`, `/start` y el relay con espejo, con una VM
apagada y una Mac propia que comparten un workspace, cada motor con sus ids;
además fijar y archivar, el cuadro de escribir, adjuntos con las reglas del
motor y cuentas de Claude y Codex con su consumo y el inicio sin pantalla —en
Claude el código bueno es `good-code`—):

```bash
cd apps/mobile
npm run computers:smoke            # la capa de datos en Node, sin simulador
npm run computers:fake             # o el falso en :8787 para la app
EXPO_PUBLIC_SUPABASE_URL=http://<ip>:8787 EXPO_PUBLIC_COMPUTERS_ENDPOINT=http://<ip>:8787 npm start
```

En la app se entra con cualquier correo y contraseña. `--mac-off` apaga la Mac;
`--license` simula una cuenta sin licencia de pago.

El camino de desarrollo con el motor del lab sigue igual:

```bash
pnpm engine:download && node apps/desktop/scripts/engine.mjs engine   # motor del lab
node apps/mobile/bridge/bridge.mjs                                      # imprime dirección y token
```

## Listas nativas (2026-10-30)

Mismas pantallas, textos y medidas en iOS, Android y la web; cambian solo el
atrás, la búsqueda por gesto, el aspecto del menú y la respuesta al tocar.
Las piezas viven en `apps/mobile/src/ui/list.tsx` (cabecera, título grande, grupos, filas
de 48 o más, segmentado, chips), `apps/mobile/src/ui/Popover.tsx` (menú anclado) y
`apps/mobile/src/ui/SwipeRow.tsx`.

| | iOS | Android | Web |
|---|---|---|---|
| Atrás | «‹ Pantalla» en píldora y el gesto del borde | flecha sin texto y el atrás del sistema | «‹ Pantalla» y la historia del navegador |
| Buscar | lupa y, además, tirar hacia abajo (campo escondido sobre la lista) | lupa | lupa (tirar recarga la página) |
| Menú del espacio | `Menu` de `@expo/ui/swift-ui` (`apps/mobile/src/ui/SpaceMenu.ios.tsx`) | `DropdownMenu` de `@expo/ui/jetpack-compose` (`apps/mobile/src/ui/SpaceMenu.android.tsx`) | popover propio con borde y flecha; cierra tocando fuera o con Esc |
| Filas | deslizar: Fijar · Archivar (`ReanimatedSwipeable`); pulsación larga: el menú anclado | igual, con vibración | igual |
| Toque | gris | ripple | gris y anillo de foco solo con teclado |

- El tema se elige en el perfil (Claro, Oscuro, El del sistema) y se recuerda
  (`apps/mobile/src/lib/appearance.ts`); `useTheme()` lo respeta. En claro la lista va sobre
  `surface-muted`; menús y popovers usan `surface-raised` y `border-strong`
  (`raised`, `borderStrong` en `@terminus/design`).
- Las subtareas no salen en Inicio: viven en el chat (Herramientas) y en Buscar.
- Lo que necesita comandos nuevos se enseña solo si están en `APP_COMMANDS` y
  la máquina no dijo que no los conoce (`ready()` en `apps/mobile/src/lib/pending.ts`, sobre
  `host.available`): crear, renombrar y eliminar espacios (en la primera
  máquina del workspace), Mantener despierta y Puertos (en la primera máquina),
  Archivadas en Buscar. Mover una tarea a otro espacio (`move_task_to_space`)
  y el árbol de trabajo del chat todavía no están en la lista y no se ven.
- El chat lleva bajo el título la fila máquina / carpeta / rama con buscar en
  el chat, subtareas y la barra de uso de la cuenta activa del proveedor
  (detalle con sus ventanas, cuál está en uso, Usar esta para cambiarla,
  Actualizar y Gestionar cuentas). La memoria de la conversación
  (`session_usage`) no está en la lista cerrada.
- La ficha del workspace (cabecera de Inicio y filas de Workspaces) pinta su
  logo de la cuenta (`logo_url` de `GET /v1/workspaces`), leído con la sesión y
  con las reglas de `readAccountAsset` de `@terminus/computers`, las mismas de
  la web de escritorio (`apps/mobile/src/lib/workspaceLogo.ts`,
  `apps/mobile/src/ui/WorkspaceAvatar.tsx`). Sin logo, mientras carga o si
  falla, la inicial. En el falso, `--broken-logo` lo hace fallar y `--no-logo`
  lo quita.
- Sin fuentes propias: Geist y Bricolage del escritorio son `woff2` variables
  y no se cargan en iOS ni Android; se usa la del sistema.

## Qué está comprobado (2026-10-19, macOS, sin simulador)

Esta Mac no tiene runtimes de iOS (`xcrun simctl list runtimes` vacío), así que
no se abrió la app. Se comprobó:

- `npm run typecheck`, `npm run doctor` (20/20) y `npx expo export --platform ios`
  (el bundle de Hermes se arma, con los paquetes compartidos).
- `npm run computers:smoke`, contra el falso por HTTP y WebSocket reales: la
  lista de máquinas; un comando fuera de la lista no se envía; el reparto de un
  workspace entre la VM y la Mac con cada tarea etiquetada; la VM apagada leída
  de la copia sin encenderse; Nueva tarea en la VM apagada la enciende, el
  turno corre y llega el aviso de terminada; en la Mac, un permiso aprobado
  desde el teléfono y sus avisos; una Mac apagada no recibe la acción.
- Las pruebas de `packages/computers` y `packages/tasks`, y la cadena del
  escritorio sin Rust (`verify.mjs --no-cargo`), con el guard `shared-design`.

Paridad con el escritorio (2026-10-19, también sin teléfono ni simulador):
`npm run typecheck`, `npm run doctor` (20/20), `npx expo export --platform
android` y `npm run computers:smoke` con los pasos nuevos: fijar y desfijar
(con la VM apagada la enciende antes), archivar con y sin cambios sin guardar,
los catálogos del cuadro, una imagen adjunta mandada con modelo, razonamiento y
permisos (un PDF no pasa), «Mandar ahora», `!` creando una tarea, las cuentas
juntadas por correo con su consumo, el inicio de sesión sin pantalla de Codex
y de Claude en otra máquina y cerrar la sesión en una; marcar vista y abrir
siguen sin encender la VM.

Carpetas nuevas (2026-10-20, sin teléfono ni simulador): `npm run typecheck` y
`npm run computers:smoke` con «Nueva carpeta» y «Clonar repo» contra el falso
(avance por eventos, la carpeta clonada en la lista, una URL rechazada antes de
clonar y cancelar a mitad). No se tocaron las hojas en un teléfono ni se clonó
en una VM real.

**No está comprobado:**

- Ninguna pantalla: ni el inicio de sesión, ni tocar botones, ni el dock, la
  hoja del filtro o las tarjetas en un simulador o un teléfono. Tampoco la
  vista previa, el cuadro de escribir (teclado, hojas, selector de fotos) ni
  la pantalla de cuentas.
- Adjuntos, `!`, ramas base y el inicio de sesión contra un motor de verdad
  por el relay (solo contra el falso).
- Google y Microsoft de verdad: necesitan la URL de vuelta en Supabase (abajo).
- Contra `computers.danil.ai` y una VM real, y contra el bridge con el motor
  del lab después del cambio a `service invoke`.
- Preguntas (`answer_question`) de punta a punta.
- Android, avisos con la app cerrada, deep links en frío en Expo Go.

## Lo que necesita el plano de control

1. **URLs de vuelta en Supabase** (Auth → URL Configuration → Redirect URLs):
   `terminus-mobile://auth/callback` para los builds y, en desarrollo con Expo
   Go, `exp://**`. Sin eso Google y Microsoft no vuelven a la app; correo y
   contraseña funcionan igual.
2. **Decir qué máquina se puede encender.** `GET /v1/computers` hoy da
   `provider`; la web y la app ya leen `wakeable` y `kind` si llegan. Sin
   ellos, una máquina propia registrada sin proveedor se tomaría por VM. Con
   `kind: "physical"` (o `wakeable: false`) la app no le manda intenciones; sin
   eso, el relay la intentaría encender y volvería `start_failed`.
4. **Contrato del motor.** Ningún cliente (teléfono, web ni ventana) marca
   desactualizada una computadora por el hash de su `commands.json` ni le manda
   al relay `?contracts=`: solo cuando el relay o el motor contestan
   `version_mismatch`/`outdated`. Un motor con otro contrato sigue en servicio y
   falla solo la orden que no conoce; un cambio de contrato nunca deja sin uso
   máquinas enteras (decisión del 2026-10-29). `machineCompatibility` sigue en
   `@terminus/computers` sin usarse en los clientes.
3. **Lista de permiso por cliente en el relay.** El relay solo bloquea funciones
   de escritorio; la lista cerrada del teléfono la hace cumplir el cliente. Si
   se quiere que el servidor también la imponga, el relay necesita saber que la
   sesión es del teléfono (otro subprotocolo, p. ej. `danil.computers.v1.mobile`).

## Lo que sigue

1. **Development build con EAS**, para push remotas, el ícono y el esquema
   `terminus-mobile://` (también para la vuelta de Google y Microsoft).
2. **Gateway de push.** Un servicio que guarda la llave de APNs y la cuenta de
   FCM; las máquinas le piden enviar. Los avisos ya se calculan en la app.
3. **La web al paquete compartido.** Hecho: la web, el escritorio y el
   teléfono usan `@terminus/computers` y una sola flota, `@terminus/fleet`
   (`accountFleet` en `apps/mobile/src/lib/hosts.ts`).