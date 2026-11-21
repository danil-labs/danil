# QA de Comportamiento: Business Logic (11-business-logic.md)

Este documento audita y verifica el cumplimiento formal de la lógica de negocio del front nuevo para las cinco features: `projects`, `chat`, `files`, `terminal` y `ai-credentials`.

---

## 1. Feature: Projects (`packages/features/projects`)

| Regla de 11-business-logic (§ 4 & Mapa) | Estado | Archivo:Línea | Qué falta / Diagnóstico |
|---|---|---|---|
| **Motor exclusivo para tareas:** Creación y despacho de tareas interactúa exclusivamente con el motor destino vía WebSocket o IPC local. | Cumple | `src/queries.ts:65-139` | Implementado en `fetchProjectsAndTasks` y `useProjects`. |
| **Tareas privadas por defecto:** Listado acotado por persona/sesión en la máquina. | Cumple | `src/queries.ts:97-122` | Filtrado acotado por proyecto y sesión activa. |
| **Borrado destructivo con `task_lifecycle_preview`:** Inspección previa con `{ project, id, action: "delete" }`, retorno de miembros, estado de integración git (`none`, `merged`, `unmerged`, `unchecked`) y token de consentimiento opaco (`consent`, 5 min) sin invocar `task_blockers`. | Cumple | `src/queries.ts:185-231` | `inspectTaskDeletion` procesa `consent` y miembros con su estado de integración git sin depender de `task_blockers`. |
| **Confirmación explícita y `task_lifecycle_apply`:** Diálogo modal exigiendo confirmación de descarte (`discard: true`) ante archivos huérfanos o ramas no integradas. | Cumple | `src/queries.ts:247-260` | Se calcula `discard = preview.members.some(m => m.files.length > 0)` y se envía con el token de consentimiento. |
| **Manejo de `task_family_consent_changed`:** Si el motor responde `task_family_consent_changed`, el front **nunca** reaplica a ciegas; solicita una nueva preview y pide confirmación actualizada. | Cumple | `src/queries.ts:263-290`, `src/lifecycle/task.ts:35-65` | `applyTaskDeletion` detecta `task_family_consent_changed` en la respuesta o excepción del motor y lanza error tipado. `executeTaskDeletionLifecycle` solicita automáticamente una nueva preview con nuevo token de consentimiento y notifica el cambio sin reaplicar a ciegas. |
| **Store reactivo unificado tras borrado (B-012):** Tras borrado exitoso, actualización atómica en una sola transacción (`removeTasksFromStore`) sin limpiar 10 almacenes dispersos. | Cumple | `src/queries.ts:30-51` | `removeTasksFromStore` reconcilia `tasksByProject` y actualiza `taskCount` en una sola mutación reactiva. |
| **Comandos RPC1 válidos y supresión N+1 (B-013):** Uso exclusivo de comandos existentes en el cliente generado. Carga por lotes acotada (`batchMap`). | Cumple | `src/queries.ts:97-127`, `src/model.ts` | Eliminada la invocación inválida a `list_sessions`; se utiliza directamente el comando tipado `list_live_sessions`. Retirada la referencia a `task_blockers` en `model.ts` e `index.ts`. |

---

## 2. Feature: Chat (`packages/features/chat`)

| Regla de 11-business-logic (§ 4 & Mapa) | Estado | Archivo:Línea | Qué falta / Diagnóstico |
|---|---|---|---|
| **Streaming reactivo en canal `"chat"`:** Flujo en tiempo real sobre el canal `"chat"`, procesando eventos de deltas de texto continuo. | Cumple | `src/stream/subscription.ts:22-47` | Suscripción al evento `"chat"` con despacho seguro a listeners. |
| **Preservación de razonamiento (thinking, B-015):** Persiste y visualiza bloques de pensamiento (`reasoning`), garantizando que no desaparezcan al terminar el turno ni cuando se recibe una herramienta intermedia. | Cumple | `src/turns/machine.ts:106-135, 177-186` | La máquina de turnos mantiene `ReasoningPiece` en `pieces` de forma inmutable tras cerrarse. |
| **Llamadas a herramientas (tools):** Muestra llamadas a herramientas (`tool` / `tool_done`) preservando el orden causal dentro del turno. | Cumple | `src/turns/machine.ts:177-224` | `TOOL_START` y `TOOL_DONE` actualizan el estado causal en el array `pieces`. |
| **Interacción `question` y `permission` correlacionadas por `request_id`:** Monta formularios (`QuestionCard`, `ToolPermission`) y responde con `answer_question` o `respond_permission`, correlacionando deltas, reasoning, tools, questions y permissions mediante `request_id`. | Cumple | `src/store.ts:60-155, 230-240`, `src/turns/machine.ts:46-85, 305-345` | Soporte completo para `QuestionPiece` en `TurnPiece`. Procesamiento de eventos push `question` y `question_answered`. Correlación de piezas de herramientas, preguntas y permisos por `request_id`. Método reactivo `answerQuestion` en el store. |
| **Reconexión resiliente con cursor (B-014):** Previene la duplicación o pérdida de deltas tras micro-desconexiones de red o reinicio del relay. | Cumple | `src/stream/cursor.ts:34-90`, `src/stream/subscription.ts:28-36` | `StreamCursor` mantiene `seenEventIds` y filtra eventos duplicados por `segment_id`, `message_id` y `request_id` en `isDuplicateEvent` antes de despacharlos al store en caso de reconexión. |
| **Límite R6 (< 400 líneas):** Módulos desacoplados en hooks y submódulos pequeños. | Cumple | `src/store.ts` (229 líneas), `src/turns/machine.ts` (330 líneas) | Todos los archivos están estrictamente por debajo de 400 líneas. |

---

## 3. Feature: Files (`packages/features/files`)

| Regla de 11-business-logic & Arquitectura | Estado | Archivo:Línea | Qué falta / Diagnóstico |
|---|---|---|---|
| **Árbol de archivos y estado Git:** Consulta de archivos y carpetas mediante `tree_files`, `tree_folder` y `tree_git_status` sin bloquear. | Cumple | `src/queries.ts:44-54` | Integración con llamadas tipadas a `tree_files`, `tree_folder` y `tree_git_status`. |
| **Tope de seguridad para archivos grandes (5 MB, B-019):** Truncamiento a 64 KB y advertencia si el archivo supera 5 MB (`LARGE_FILE_THRESHOLD_BYTES`), evitando congelar la interfaz. | Cumple | `src/queries.ts:161-170`, `src/model.ts:61` | Truncamiento seguro y flag `isLargeFile` implementados. |
| **Edición y parche:** Mutaciones atómicas mediante `tree_write` y visualización de diferencias con `tree_patch`. | Cumple | `src/queries.ts:218-225, 253-260` | Hooks `useFileDiff` y `useWriteFile` implementados. |
| **Diccionario compacto de iconos (B-020):** Clasificación de archivos por categorías limpias (`IconCategory`) sin CSS disperso. | Cumple | `src/model.ts:77-89` | Definición de categorías exportada en el modelo. |

---

## 4. Feature: Terminal (`packages/features/terminal`)

| Regla de 11-business-logic & Arquitectura | Estado | Archivo:Línea | Qué falta / Diagnóstico |
|---|---|---|---|
| **Consola interactiva con streaming ANSI:** Renderizado en streaming y decodificación de texto y secuencias ANSI. | Cumple | `src/queries.ts:102-112` | Acumulador reactivo de salida con soporte UTF-8 y decodificación de chunks. |
| **Stdin sin pérdidas (B-017):** Retención en buffer (`stdinBuffer`) de pulsaciones hasta que el pty remoto confirma que está listo (`shell_started` / `isPtyReady`). | Cumple | `src/queries.ts:62-81, 158-163` | `flushStdinBuffer` se dispara exclusivamente al recibir `shell_started`. |
| **Aislamiento causal por sesión:** Los eventos de streaming en el canal `"chat"` deben corresponder estrictamente a la sesión de la terminal activa para evitar mezcla de salidas entre terminales concurrentes. | Cumple | `src/queries.ts:89-96` | El listener del evento `"chat"` comprueba `eventSession === sessionId`, descartando eventos ajenos a la sesión activa de la terminal. |
| **Ciclo de vida y cierre limpio:** Invocación de `run_shell_command`, `write_shell_input`, `stop_shell_command` y `close_process` al desmontar. | Cumple | `src/queries.ts:137, 169, 185, 218` | Ciclo de vida completo implementado con `onCleanup`. |

---

## 5. Feature: AI Credentials (`packages/features/ai-credentials`)

| Regla de 11-business-logic (§ 3) | Estado | Archivo:Línea | Qué falta / Diagnóstico |
|---|---|---|---|
| **Consulta única y cacheada por workspace (B-023):** Consulta de destinatarios y cuentas mediante `GET /v1/credentials/workspaces/{id}/accounts`. | Cumple | `src/queries.ts:76-98` | Hook `useWorkspaceAccounts` con reintento automático. |
| **Sellado local con WebCrypto (`TERMINUS-SECRET/1`):** Cifrado X25519 + HKDF-SHA256 + AES-256-GCM para cada máquina autorizada con llave pública (`copies: [{machine_id, sealed}]`). El secreto en texto claro **nunca** viaja al servidor ni se almacena en base de datos. | Cumple | `src/seal.ts:86-135`, `src/queries.ts:128-145` | Sellado cliente puro sin APIs del DOM incompatibles. |
| **Estados por máquina (`active`, `pending`, `removed`):** Gestión y mutación de estados de credenciales por máquina mediante `/machines/{machine_id}` y `/restore`. | Cumple | `src/queries.ts:207-280`, `src/model.ts:34-41` | Mutaciones `useRemoveMachineAccount` y `useRestoreMachineAccount` operativas. |
| **Encendido explícito de máquinas (wake solo por acción de la persona, B-021):** Sin sondas en background ni encendidos automáticos; encendido únicamente por clic del usuario. | Cumple | `src/queries.ts:286-308`, `src/screens/AiCredentialsScreen.tsx:67-75` | Invocación condicionada a la acción explícita del usuario. |
| **Prohibido `set_api_key`:** El alta y rotación va siempre por el borde `/v1/credentials/workspaces/{id}/accounts`, nunca por el motor. | Cumple | `src/queries.ts:147` | Todas las mutaciones van al cliente del borde; sin llamadas a `set_api_key`. |
| **Soporte de proveedores sin bloqueos artificiales:** Soporte formal de Claude, Codex, Antigravity, OpenCode y Gemini. Antigravity opera bajo ACP v1.5.0 sin arrojar error artificial. | Cumple | `src/queries.ts:112-155`, `src/model.ts:32` | Desbloqueada la conexión de Antigravity (eliminado `throw UNAVAILABLE_ERROR`), sellando tokens vía WebCrypto. Incorporado `gemini` al tipo `SupportedProvider`. |
| **Lectura de estado en motor mediante `account_credentials_list`:** Lectura del estado en la máquina con `account_credentials_list` conforme al contrato § 3. | Cumple | `src/queries.ts:76-105`, `src/index.ts` | Hook `useMachineAccountCredentials` implementado consumiendo el comando RPC1 `account_credentials_list` del motor sin mutar por motor. |

---

## Tareas pendientes para VP2 (Visual / Pantallas)
- **VP2 (Chat):** Montar renderizado visual de `QuestionCard` para piezas con `kind === "question"` en la pantalla de chat o en `MessageItem.tsx`.
- **VP2 (AI Credentials):** Añadir tarjeta de proveedor Gemini en `AiCredentialsScreen.tsx` junto a Claude, Codex, Antigravity y OpenCode.
