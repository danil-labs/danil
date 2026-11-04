# Pausa por credencial: una tarea espera a la persona

Propuesta para danil-labs/danil-engine#328. Relacionada con #332 (el fallo de
una hija no le llega a la coordinadora) y #327 (respuestas sin remitente).
Estado: propuesta, sin aprobar. No incluye código.

Leído antes de proponer: motor `danil-engine` en `origin/dev` `0bd55827` y esta
app en `dev` `67c28871`. Las rutas de motor de este documento son de ese
repositorio.

## 1. Problema

Tres tareas hijas usaban la misma sesión de AWS SSO de la persona. La sesión
caducó. Cada hija lanzó su propio `aws sso login --use-device-code` y le
mostró un código distinto. La persona no supo cuál aprobar, los códigos
caducaron y las tres tareas se quedaron bloqueadas.

A quién afecta:

- **A la persona**, que recibe varias peticiones para una sola acción y no
  sabe cuál vale.
- **A la coordinadora**, que no tiene forma de saber que sus hijas esperan lo
  mismo. Hoy lo resolvió a mano: un login, un `task send` a cada hija y una
  prohibición en cada brief.
- **A una orquestación desatendida**, que se detiene sin que nadie lo vea.

Cómo se observa hoy: no se observa. `task show` no tiene un estado «esperando
a la persona». La tarea termina su turno con un texto libre, igual que una
tarea que terminó bien.

No es una preferencia: es un defecto de coordinación. Cualquier credencial
compartida de la máquina lo produce: AWS SSO, `gcloud auth login`,
`az login`, `gh auth login`, un VPN, un 2FA.

## 2. Lo que ya existe en el motor

La propuesta reutiliza tres piezas medidas en el código:

| Pieza | Dónde | Qué aporta |
|---|---|---|
| Libro de atención | `workspace/attention.rs` (`attention.json`, `list_workspace_attention`, evento `attention`) | La lista de lo que espera a la persona por tarea: `approving`, `asked`, `failed`, `unseen`. La ventana y el relay del teléfono ya la leen. |
| Reanudar en grupo | `runtime/chat/relevo.rs` (`tasks_awaiting_quota`, `resume_awaiting_quota`) | Barre el workspace, encuentra las tareas cortadas por cupo y las relanza juntas. Es el mismo patrón que necesita una credencial. |
| Autoridad de la lanzadora | `cli/commands/tasks.rs` (`decider`, `task permission --decision person`, `orchestration::leave_to_person`) | Solo la tarea que lanzó a otra decide por ella; puede dejarle la decisión a la persona. |

La ventana ya tolera estados de atención nuevos: `features/shell/attention.ts`
descarta los estados que no conoce (`known`). Un motor nuevo con una ventana
vieja no rompe nada; solo no pinta el estado nuevo.

Lo que falta: un estado declarado por el agente, con motivo y con una clave
que permita agruparlo.

## 3. Mecanismo común

Una tarea declara que espera algo que solo la persona puede dar. La
declaración tiene **motivo** y, si es una credencial, una **clave**. Todas las
tareas de una máquina que esperan la misma clave forman un grupo. Resolver el
grupo es una sola acción. Al resolverse, el motor reanuda cada tarea del
grupo.

```
hija: danil task wait --credential aws-sso:danil-prod --note "sso caducó"
      → el turno termina
motor: waiting = {reason: credential, key: aws-sso:danil-prod, since}
      → task show lo enseña; la lanzadora recibe un aviso
persona o coordinadora: hace el login una vez
      → danil task resume --credential aws-sso:danil-prod
motor: manda a cada tarea del grupo «La credencial aws-sso:danil-prod está lista; continúa.»
```

### 3.1 Cómo lo declara el agente

| Vía | Propuesta | Por qué |
|---|---|---|
| **CLI** | `danil task wait` (nuevo). Es la única fuente del estado. | Es explícita, la puede auditar el motor y funciona igual en Claude, Codex, OpenCode y Antigravity. |
| **Convención en instrucciones** | El motor agrega una línea a las instrucciones de cada tarea: «Si caduca una credencial externa, no inicies sesión. Ejecuta `danil task wait --credential <clave>` y termina el turno.» | Sin la línea, el agente hace lo que hizo en el incidente. La línea va junto al bloque del CLI que el motor ya inyecta. |
| **Detección** | Fuera de la primera versión. | Reconocer `aws sso login` o un código de dispositivo en la salida de una herramienta depende del proveedor y de la versión de cada CLI externo. Un falso positivo pausa trabajo sano. |

La clave es texto libre normalizado: `<tipo>:<identidad>`, en minúsculas,
máximo 128 bytes, sin secretos. Ejemplos: `aws-sso:danil-prod`,
`gcloud:alberto@danil.ai`, `vpn:oficina`. El motor no interpreta la clave: dos
tareas se agrupan si escriben la misma. La instrucción da el formato y un
ejemplo por tipo común.

`--reason` acepta `credential` (por omisión con `--credential`) y `person`
(otra cosa que solo la persona puede hacer, sin clave y sin grupo).

### 3.2 Ciclo del estado

- Se escribe al llamar `task wait`. Se ve como «esperando» cuando el turno
  termina (`running: false`); mientras el turno sigue vivo, `task show` lo
  muestra pero la tarea cuenta como trabajando.
- Se borra al empezar el siguiente turno de la tarea, venga de donde venga:
  `task resume`, `task send` de la lanzadora o un mensaje de la persona. Así
  nunca queda un estado viejo encima de una tarea que ya avanzó.
- Archivar o borrar la tarea lo borra con ella.
- No caduca solo. Una espera sin respuesta es justo lo que la persona debe ver.

## 4. Alcance

### Primera versión (v1): estado visible y reanudación por CLI

Solo motor y CLI. No cambia la ventana ni el teléfono.

1. `danil task wait --credential <clave> [--note <texto>]` y
   `danil task wait --reason person --note <texto>`. Solo sobre la propia
   tarea (`caller_task`); otra tarea no puede declarar la espera de una ajena.
2. `task show` y `task status` suman `waiting`:
   `{reason, key?, note?, since}` o `null`.
3. `task list --waiting [--credential <clave>]` lista las tareas que esperan,
   como `tasks_awaiting_quota` pero por clave.
4. `danil task resume --credential <clave>` reanuda el grupo. La persona
   (sin `caller_task`) reanuda todas las del workspace en esta máquina. Una
   tarea solo reanuda las que lanzó ella o sus descendientes, con la misma
   regla que `decider` (`not_launcher`). Devuelve
   `{resumed:[{folder,task}], skipped:[{folder,task,reason}]}`.
   `danil task resume --task <id>` reanuda una sola.
5. La lanzadora recibe un aviso cuando una hija entra en espera: tarea,
   título, motivo, clave. Va por el mismo camino que la respuesta de la hija,
   con remitente (cubre el caso de #327 para este aviso).
6. La línea de convención en las instrucciones de cada tarea.

Resultado observable: en una réplica del incidente con tres hijas,
`task list --waiting` enseña tres tareas con la misma clave; un solo
`task resume --credential` las reanuda; ninguna hija ejecuta un login.

Cómo se informa un fallo: `task wait` con clave inválida responde
`invalid_request` con el motivo; `task resume` sin tareas en espera responde
`resumed: []`, no un error; una tarea que no se pudo reanudar va en `skipped`
con su causa (`busy`, `archived`, `not_launcher`).

### Segunda versión (v2): una acción en la ventana y en el teléfono

1. Estado de atención nuevo `waiting` en `attention.json`, con `key`. Va
   primero en la prioridad junto a `approving`: las dos detienen trabajo.
2. La ventana enseña un grupo por clave: «aws-sso:danil-prod · 3 tareas
   esperan» con una acción «Ya inicié sesión: reanudar». La marca de cada
   tarea dice «Esperando credencial».
3. El teléfono recibe el aviso y ofrece la misma acción.
4. Extensión RPC1 `credential_wait_v1` para la ventana:
   `list_waiting_tasks` y `resume_waiting_tasks {key}`.

### Después (v3 o nunca)

- **Resolutor declarado**: la persona registra en el workspace cómo se
  renueva una clave (`aws sso login --profile danil-prod`) y la ventana lo
  ejecuta en una terminal suya. Requiere decidir quién corre comandos en
  nombre de la persona.
- **Comprobación antes de reanudar**: un comando de verificación por clave
  (`aws sts get-caller-identity`) que el motor corre antes de reanudar.
- **Detección automática** en la salida de herramientas.
- **Grupos entre máquinas** con `packages/fleet`.

### Fuera de alcance

- Que Danil guarde o renueve la credencial externa. La credencial sigue en la
  máquina (`~/.aws`), fuera del motor. Los secretos de Danil
  (`secrets_v1`, `docs/account-credentials.md`) son otra cosa: claves fijas,
  no sesiones interactivas.
- Reintento automático por tiempo: una credencial no vuelve sola.
- El fallo por cupo (#332): ya tiene su propio camino (`resume_awaiting_quota`).

## 5. Dónde vive cada parte

| Parte | Lugar | Por qué |
|---|---|---|
| Estado `waiting`, grupo por clave, reanudación, aviso a la lanzadora, línea de instrucciones | **Motor** (`danil-engine`) | El estado es de la tarea y el motor es dueño de las tareas. La autoridad de reanudar es la misma que la de `task permission`. |
| `task wait`, `task resume`, `task list --waiting`, campo en `task show` | **CLI** (`crates/terminus-cli`, rutas en `engine-manifest`) | Es la superficie que usan los agentes. |
| Grupo y acción en la ventana (v2) | **Ventana** (`apps/desktop`, `packages/design` para el estado, `packages/tasks` para la tarjeta) | La ventana solo pinta y llama; la lógica de grupo la da el motor. |
| Acción en el teléfono (v2) | **App móvil** y `packages/protocol` (comando nuevo en la lista cerrada); aviso en el **relay** `computers` | El teléfono habla con la máquina por esa lista cerrada; el push lo manda el relay. |
| Harness | **Nada en v1 ni v2.** | Es política y uso de organizaciones. Una métrica «tiempo en espera de credencial» puede venir después, si alguien la pide. |
| Workspace (base central) | **Nada.** | El estado es local a la máquina, igual que `attention.json`. No hay dato que deba sobrevivir a la máquina. |

Nota de nombres: el **Inbox** de `packages/attention` es la bandeja de
conversaciones de clientes (canales, difusiones), no la atención de tareas.
Esta propuesta no lo toca. «Una acción para la persona» vive en la atención
de tareas de la ventana y del teléfono.

## 6. Contratos que cambian

### v1

| Contrato | Cambio | Compatibilidad |
|---|---|---|
| CLI | Rutas nuevas `task wait`, `task resume`; filtro `--waiting` y `--credential` en `task list`; campo `waiting` en `task show` y `task status`. | Aditivo. Un agente con CLI viejo no ve el campo. |
| Datos del motor | Archivo `waiting.json` junto a la sesión (como `handoff.json` y `ceded.json`): `{reason, key, note, since, by_turn}`. | No toca `session.json`: las sesiones históricas no cambian. |
| Turno de reanudación | Entrada nueva con `meta: "credential_resolved"` y los saltos (`hops`) del encargo original. | Conserva `MAX_DELEGATION_DEPTH`: reanudar no abre una cadena nueva. |
| Instrucciones de tarea | Una línea más en el bloque del CLI. | Sin efecto en tareas abiertas antes del cambio hasta su siguiente turno. |

El contrato congelado de la ventana (`src-tauri/crates/engine-protocol/commands.json`)
no cambia en v1.

### v2

| Contrato | Cambio | Compatibilidad |
|---|---|---|
| RPC1 | Extensión `credential_wait_v1` en `crates/engine-manifest/extensions/`, anunciada en `status.service_features`, copiada byte a byte en esta app, como `provider_handoff_v1`. | Fuera de la huella `status.contract`. |
| `list_workspace_attention` y evento `attention` | Valor nuevo `waiting` en `state` y campo opcional `key`. | La ventana de escritorio descarta estados desconocidos. **Sin medir** en la app móvil: hay que comprobarlo antes de publicar el motor. |
| `packages/protocol` | Comando `resume_waiting_tasks` en la lista cerrada del teléfono. | Aditivo. |
| Push del relay | Clase de aviso `waiting`. | Requiere cambio en `computers` (otro repositorio). |

## 7. Teléfono: un aviso por tarea y una acción agrupada

La decisión vigente es **un aviso por tarea**: un mensaje nuevo de la misma
tarea reemplaza al anterior y no vuelve a sonar. Tres hijas esperando la misma
clave serían tres avisos que suenan, que es el problema del incidente con
otra forma.

Propuesta compatible con esa decisión:

- **Solo avisa la tarea raíz.** Si las tareas en espera tienen una lanzadora,
  el motor no marca `waiting` en las hijas para el push; marca la raíz de su
  árbol con `waiting` y la clave. Es un aviso de una tarea (la coordinadora),
  y la acción reanuda el grupo entero. El relay ya hace algo parecido: no manda
  `finished` de una hija.
- **Sin lanzadora**, cada tarea es su propia raíz. Si la persona abrió tres
  tareas sueltas que esperan la misma clave, recibe tres avisos. Para v2 se
  acepta; agruparlas pide una etiqueta por clave (`tag = credential:<ws>:<key>`),
  que cambia la regla «uno por tarea» a «uno por tarea o por credencial».
  Eso lo decide la persona (decisión D4).
- Al tocar el aviso, el teléfono abre la vista del grupo, no la tarea: la
  acción es la misma desde cualquier tarea del grupo.
- En iPhone el reemplazo por `tag` no funciona (medido: Safari lo ignora).
  Con «solo avisa la raíz» el número de avisos ya es bajo sin depender de eso.

## 8. Qué hace la coordinadora

Con v1, la coordinadora:

1. Recibe el aviso «La tarea «X» espera la credencial `aws-sso:danil-prod`».
2. Consulta `task list --waiting --credential aws-sso:danil-prod` para ver el
   grupo de sus descendientes.
3. Elige una de dos vías:
   - **Hace el login una vez** en su propio turno y le enseña a la persona un
     solo código. Tras el login, `task resume --credential ...`.
   - **Se lo deja a la persona**: termina su turno con `task wait` sobre la
     misma clave. Así la espera sube a la raíz y la persona ve una sola
     petición.
4. No reanuda hijas de otra coordinadora: `not_launcher`.

Recomendación para la instrucción de la coordinadora: la segunda vía por
omisión. Un login con código de dispositivo necesita a la persona de todas
formas; si la coordinadora lo lanza, el código vive en una conversación que la
persona puede no estar mirando.

## 9. Riesgos

| Riesgo | Mitigación |
|---|---|
| El agente ignora la convención y hace login igual. | La línea va en las instrucciones del motor, no en cada brief. Se mide en la réplica del incidente con Claude y Antigravity. Si falla, la detección (v3) gana prioridad. |
| Dos agentes escriben claves distintas para la misma credencial (`aws:prod` y `aws-sso:danil-prod`). | Formato y ejemplos en la instrucción. `task list --waiting` enseña las claves y la persona puede reanudar varias. |
| La persona dice «listo» sin haber iniciado sesión. | La tarea reanudada vuelve a fallar y vuelve a `task wait`. El costo es un turno. La comprobación previa queda para v3. |
| Una tarea en espera durante un relevo de servicio (instalación). | `waiting.json` está en disco, igual que `handoff.json`; el servicio nuevo lo lee. El libro de atención ya comparte candado entre servicios. |
| La clave lleva un dato sensible (un correo, un id de cuenta). | Máximo 128 bytes, sin valores de secreto; el motor rechaza claves con forma de token. El correo es aceptable: es local a la máquina. |
| Una ventana o app móvil vieja recibe `waiting` en la atención (v2). | Escritorio lo descarta (medido en código). Móvil **sin medir**. |

## 10. Decisiones para la persona

| # | Decisión | Opciones | Recomendación |
|---|---|---|---|
| D1 | ¿La v1 es solo motor y CLI, sin cambios en la ventana? | Solo CLI / CLI y ventana juntos | **Solo CLI.** Resuelve el incidente (las coordinadoras ya usan el CLI) y deja medir la convención antes de diseñar pantallas. |
| D2 | ¿Cómo declara el agente la espera? | CLI explícito / detección / ambos | **CLI explícito con convención en las instrucciones.** Detección después, si la medición muestra que los agentes ignoran la línea. |
| D3 | ¿Quién puede reanudar un grupo? | Solo la persona / persona y lanzadoras | **Persona y lanzadoras**, con la regla de `decider`: una tarea solo reanuda lo que lanzó. |
| D4 | Aviso al teléfono de un grupo | Solo la raíz avisa (uno por tarea se mantiene) / etiqueta por credencial (cambia la regla) | **Solo la raíz avisa** en v2. Revisar la etiqueta por credencial si aparecen tareas sueltas con la misma espera. |
| D5 | ¿Qué hace la coordinadora por omisión? | Hace el login / se lo deja a la persona | **Se lo deja a la persona** con `task wait` sobre la misma clave. |
| D6 | ¿Danil ejecuta el comando de login (resolutor declarado)? | No / sí, en v3 | **No por ahora.** Ejecutar comandos de login en nombre de la persona es un límite de producto nuevo. |

## 11. Encargos propuestos (no lanzados)

Las partes 1 y 2 tocan los mismos archivos del motor: van en secuencia.

| # | Responsable | Objetivo | Alcance | Depende de | Aceptación |
|---|---|---|---|---|---|
| 1 | `architect` (danil-engine) | Revisar los contratos de v1: rutas del CLI, `waiting.json`, meta del turno de reanudación, autoridad. | Solo revisión del diseño de §6 v1. | D1, D2, D3 | Dictamen escrito; cambios al diseño anotados aquí. |
| 2 | `tech-lead` (danil-engine) | Implementar v1. | `task wait`, `task resume`, `task list --waiting`, `waiting` en `task show`/`task status`, aviso a la lanzadora, línea de instrucciones. | 1 | E2E con proveedores sintéticos: tres hijas con la misma clave, un `resume`, tres turnos `credential_resolved`, cero logins; `skipped` con `not_launcher` para una tarea ajena. |
| 3 | `qa` | Réplica del incidente con agentes reales. | Coordinadora con tres hijas (Claude y Antigravity) y una credencial caducada a propósito. | 2 | Ninguna hija lanza un login; la persona aprueba un código o ninguno; evidencia de `task list --waiting` antes y después. |
| 4 | `architect` (danil-engine y esta app) | Extensión `credential_wait_v1` y estado `waiting` en la atención. | Contrato de v2; medir la app móvil con un estado desconocido. | 3 y D4 | Extensión escrita y copiada byte a byte; móvil medido. |
| 5 | `design` | Grupo por clave y acción «reanudar» en la ventana. | `packages/design` (estado y tono), `packages/tasks` (tarjeta), vista del grupo. | 4 | Recorrido en la ventana real con el laboratorio del motor. |
| 6 | `tech-lead` (esta app y `computers`) | Acción en el teléfono y aviso del relay. | `packages/protocol`, app móvil, clase `waiting` en el relay, regla «solo la raíz». | 4, 5 | Un aviso por grupo con coordinadora; la acción desde el teléfono reanuda las tres. |

## 12. Sin medir

- Si Claude, Codex, OpenCode y Antigravity siguen la línea de convención en
  vez de lanzar el login. Se mide en el encargo 3.
- Cómo trata la app móvil un estado de atención desconocido.
- Si el relay `computers` puede subir la espera de una hija a su raíz con lo
  que ya guarda del panel (`parent`/`launched_by`), o si el motor debe mandar
  la raíz en el evento.
