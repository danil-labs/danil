# Propuesta: proveedores permitidos por workspace

Fecha: 2026-11-03. Rama `docs/workspace-provider-policy`, desde `origin/dev`
de `danil-labs/danil` @ `67c28871`. Origen:
[danil-labs/danil-engine#331](https://github.com/danil-labs/danil-engine/issues/331).
**Es solo diseño y no cambia código.** El código del motor citado está en
`danil-engine` `origin/dev` @ `0bd55827`. Las rutas son relativas a
`crates/existing-runtime/src/`.

## Veredicto

**Construir una versión reducida.** El motor ya tiene la mitad del mecanismo
para los workspaces que gobierna el Harness. Falta lo siguiente:

1. Una política local para cualquier workspace. Esto incluye las cuentas
   personales, que no tienen Harness.
2. Cerrar los caminos por los que hoy se salta la política.
3. Mostrar el bloqueo en `agent list` y devolver un error con código.

## 1. Problema

Un cliente no autoriza Codex. En su workspace, `agent list` muestra Codex
disponible y `task create --agent codex` lo lanza. Lo frena solo una nota en la
memoria, y un agente coordinador puede no leerla. Si se usa un proveedor no
autorizado con datos del cliente, hay un incumplimiento contractual. No es un
problema de experiencia.

**A quién afecta:**

- A la persona que trabaja para un cliente con restricciones (consultoría,
  sector regulado). Lo nota cuando ya ocurrió y lo ve en la marca del CLI de
  la tarea.
- Al agente coordinador. Elige proveedor por costo o capacidad y nada le dice
  que uno está prohibido.
- A la organización con Harness. Su lista de proveedores existe, pero tiene
  huecos (§2).

**No es una preferencia.** «Prefiero Claude para este cliente» se resuelve con
el proveedor por omisión. Esta propuesta trata un **límite**: un proveedor
bloqueado no debe correr ningún turno en ese workspace.

## 2. Lo que ya existe (medido en el código)

Ya existe una política de proveedores y modelos **solo para workspaces
gobiernos por el Harness**:

| Pieza | Dónde | Qué hace |
|---|---|---|
| Documento del Harness | `workspace/radiant/governance.rs` (`Models`, `ModelProvider`) | `models.providers` es la lista de CLIs admitidos por id (`claude`, `codex`…), con `account_mode`. `models.allowed` lista modelos por proveedor; vacía significa cualquiera. `models.default` es el modelo por omisión. |
| Exigencia | `workspace/governed.rs:65` (`locks`), `:477` (`admits_provider`), `:498` (`model_policy`) | La lista solo se exige con `enforcement.mode = managed` y `models` en `locked`. Sin eso, la lista es informativa. |
| Turno | `runtime/chat/launch.rs:1887` → `governed.rs:516` (`model_for_turn`) | Rechaza **cada turno** de un proveedor o modelo no admitido con `radiant.governance.model_not_allowed`. Todos los caminos de `send_message*` pasan por `send_message_inner`. Esto incluye una tarea remota que nace en esta máquina (`workspace/remote_child.rs:218`). |
| Ventana | `runtime/surfaces.rs:149` | `list_surfaces` marca el proveedor con la marca `radiant` («Harness» en la ventana, `features/chat/marks.ts`). El menú del chat no lo ofrece. |
| Modelos | `runtime/models.rs:1434`, `:1454` | `list_models` filtra los modelos a los permitidos. |

**Huecos medidos:**

1. **Un workspace sin Harness no tiene política.** Esto incluye toda cuenta
   personal y todo workspace de una organización que no activó el gobierno.
   Es el caso del issue.
2. **`agent list` no la aplica.** `cli/commands/mod.rs:469` → `list_providers`
   (`runtime/agents/probes.rs:590`) no lee `model_policy`. El CLI muestra Codex
   como disponible, aunque la ventana lo marca como bloqueado.
3. **`task create` no valida la política.** `validate`
   (`cli/commands/tasks.rs:248`) solo comprueba que el CLI existe y que el
   modelo está en su catálogo. El rechazo llega después, en el turno, como
   una clave de catálogo sin código estable ni `detail` con lo permitido.
4. **El handover no valida la política.** `set_provider_de`
   (`runtime/chat/handover.rs:29`) acepta el cambio a un proveedor bloqueado.
   La tarea queda marcada para cambiar, y su siguiente turno falla.
5. **La política depende de cada máquina.** El gobierno se activa por motor
   (`radiant/governed/`). Si una tarea se delega a otra máquina donde ese
   workspace no está gobernado, el turno corre.
6. **Un proveedor es un CLI y no un vendedor de modelos.** `opencode-zen` y
   otros CLIs que enrutan a varios vendedores pueden usar modelos de OpenAI.
   Bloquear `codex` no bloquea GPT por esa vía. El vendedor real
   (`model_vendor`) se conoce solo **después** del turno, así que no sirve para
   admitir antes de lanzar.

## 3. Mecanismo común

Hay **una sola función del motor** que responde «¿este workspace admite este
proveedor y este modelo?». Esa función se consulta en cada punto donde se
elige o se usa un proveedor. Su respuesta se obtiene de la siguiente manera:

```
efectiva = local ∩ Harness
```

- **Local (workspace).** Es una lista de proveedores admitidos en `meta.json`
  del workspace. Existe para cualquier cuenta. Sigue el precedente de
  `consents` (`workspace/workspaces.rs:84`), que ya es por workspace porque
  «lo que se consiente es que el material de un cliente salga de la máquina».
- **Harness (organización).** Es `models` del documento de gobierno, igual
  que ahora, cuando está bloqueada (`locked`).
- **Gana la más restrictiva.** Se usa la intersección. La política local solo
  puede estrechar lo que el Harness permite y nunca ampliarlo. Si el Harness
  bloquea `models`, la persona igual puede quitar proveedores en local, pero
  no puede agregar uno que el Harness no admite.
- **Sin ninguna de las dos**, todo está admitido, como hoy.

## 4. Alcance de la primera versión

### Entra

1. **Política local por workspace.** Agrega a `meta.json` el campo
   `providers_allowed: Option<Vec<String>>`, con ids de CLI de la tabla
   `agents`. `None` significa sin política. Es una **lista de permitidos y no
   de bloqueados**. Así, un CLI que llega con una actualización queda fuera
   hasta que alguien lo admite. Una lista de bloqueados lo dejaría pasar sin
   que nadie lo decida.
2. **Granularidad: proveedor (CLI).** Para los modelos se reutiliza
   `models.allowed` del Harness como está. La política local de la v1 no
   tiene lista de modelos.
3. **Un solo punto de decisión.** `governed::model_for_turn` pasa a ser
   `provider_policy::admit(ws, agent, model)`. Esa función combina las dos
   fuentes y devuelve un error estructurado.
4. **La función se aplica en estos puntos:**
   - `task create`, `task handoff`, `task spawn` y todo lo que llama
     `validate`. Rechaza **antes** de crear la tarea.
   - `set_session_provider` (handover). Rechaza el cambio y no deja la tarea
     marcada.
   - El turno (`send_message_inner`), como hoy. Es la red de seguridad para
     todos los caminos, incluidos las respuestas a un canal, los encargados y
     la reanudación de una tarea existente.
   - **Las tareas de otra máquina se verifican en el origen y en el destino.**
     El motor que delega comprueba el proveedor contra su política antes de
     enviar. El motor que recibe aplica la suya en el turno, como hoy.
5. **Error con código.** Se usa `provider_not_allowed`, con este `detail`:
   `{provider, model?, source: "workspace"|"harness"|"both", allowed:[…],
   recovery}`. Para un modelo se usa `model_not_allowed`, con el mismo
   formato. El CLI y la ventana leen el código y no la prosa.
6. **`agent list` lo muestra.** Cada fila agrega
   `policy: {allowed: bool, source?: "workspace"|"harness"}`. Un agente
   coordinador lo ve antes de elegir.
7. **La ventana:**
   - Agrega una sección «Proveedores permitidos» en Configuración ›
     Workspace. Muestra una casilla por CLI. Muestra lo que el Harness fija
     como solo lectura, con la marca «Harness».
   - En el menú del chat, `list_surfaces` agrega una marca nueva (`política`)
     junto a `radiant`. El selector de handover tampoco ofrece un proveedor
     bloqueado.
   - Cuando un turno se rechaza en una tarea existente, la ventana muestra un
     aviso con la acción «Cambiar de CLI», si `can_hand_over` lo permite.
8. **Autoridad.** El comando que escribe la política (`set_workspace_providers`)
   es una función de la ventana con autoridad `admin`. La credencial de una
   tarea **no** puede cambiarla. Si un agente pudiera hacerlo, se saltaría el
   límite.

### Queda fuera (y por qué)

- **Bloquear por vendedor de modelos** (OpenAI detrás de `opencode-zen`). El
  vendedor no se conoce antes del turno. Para la v1 hay una mitigación: la
  ventana advierte al admitir un CLI multivendedor y recomienda combinarlo
  con `models.allowed` en el Harness. Una política por vendedor necesita que
  cada adaptador declare el vendedor de cada modelo de su catálogo. Eso es un
  trabajo aparte.
- **Una lista local de modelos.** El Harness ya la tiene. En una cuenta
  personal, bloquear el CLI cubre el caso del issue.
- **Granularidad por cuenta** (Codex con la cuenta de la empresa sí, con la
  personal no). El Harness ya declara `account_mode`, pero el motor no lo
  exige. Se puede agregar en una versión posterior, con
  `accounts::active_account`.
- **Una política que viaja entre máquinas sin el Harness.** Hoy cada motor
  tiene su `meta.json`. Cuando exista el workspace de la cuenta
  (`apps/desktop/docs/account-workspace.md`, en propuesta), la política local
  debe vivir en ese registro del plano de control. Mientras tanto, la v1 la
  verifica en el origen al delegar (§4.4), y la ventana avisa si otra
  máquina del mismo workspace no tiene la misma política.
- **La seguridad frente a un agente malicioso con shell.** Un turno con
  `execute` puede editar `meta.json` o lanzar `codex` desde la terminal. La
  política evita **el uso por error** (de la persona, del coordinador o de un
  handover). No es un sandbox. El Harness tiene la misma advertencia:
  «el bloqueo es coherencia, no seguridad» (`governed.rs:8`).
- **Cambiar la semántica del Harness** (exigir `providers` aunque `models` no
  esté en `locked`). Ver la decisión D3.

### Recursos que agrega

- Un campo opcional en `meta.json`. Un `meta.json` anterior lo carga como
  `None`.
- Un comando de ventana con autoridad `admin` y un campo de salida en
  `agent list`.
- No agrega procesos, almacenes ni tareas de fondo. Se lee al decidir, igual
  que `model_policy` hoy.

## 5. Tareas existentes cuyo proveedor queda bloqueado

- **Un turno en curso termina.** No se mata un proceso a mitad de turno,
  porque perder el trabajo no reduce la exposición ya ocurrida. Si la
  persona quiere detenerlo, ya tiene «Detener».
- **El siguiente turno se rechaza** con `provider_not_allowed`. La tarea
  conserva su historial y su árbol.
- **La salida es el handover a un proveedor admitido** (`provider_handoff_v1`).
  Los casos que hoy no pueden cambiar de CLI (encargados, subagentes, forks,
  tareas adoptadas) quedan de solo lectura. Su aviso dice «Bloqueado por la
  política del workspace; abre una tarea nueva con un proveedor permitido».
- **Una sesión residente** (`native_driver`) del proveedor bloqueado se cierra
  al terminar su turno vivo. No se reutiliza.
- Una tarea de otra máquina sigue la política **de la máquina donde corre**, y
  además la del origen cuando se delega.

## 6. Contratos que cambian

Todo lo de esta sección es del motor. Este repositorio lo consume y no lo
inventa.

| Contrato | Cambio | Compatibilidad |
|---|---|---|
| `meta.json` | `providers_allowed?: string[]` | Es un campo opcional. Un motor anterior lo ignora y no aplica la política. **Una ventana nueva sobre un motor viejo no debe mostrar la sección como si funcionara**: se anuncia con una extensión. |
| Extensión del manifiesto | `workspace_provider_policy_v1` en `engine-manifest/extensions/` | La ventana muestra Configuración › Proveedores solo si el motor la anuncia. Sigue el mismo patrón que `provider_handoff_v1`. |
| Comando de ventana | `set_workspace_providers {workspace, providers: string[] \| null}` con `admin` | Es nuevo. Rechaza con `radiant.governance.locked` si intenta admitir algo que el Harness no admite. |
| `agent list` / `list_providers` | `policy: {allowed, source?}` por fila | Es un campo nuevo. Un cliente anterior lo ignora. Cambia `commands.public.json`. |
| `list_surfaces` | La marca `política` | La ventana nueva la traduce. Una ventana vieja pinta la marca tal cual, que es el comportamiento por omisión de `marks.ts`. |
| Errores | `provider_not_allowed` y `model_not_allowed` con `detail` | Reemplazan el `Err(String)` de `model_for_turn`. Las claves de catálogo `radiant.governance.*` se mantienen para el texto. |
| Delegación remota | El origen valida antes de enviar | No cambia el protocolo. Si el destino es un motor viejo, la verificación del origen sigue cubriendo la delegación. |
| Harness (`Radiant`) | Ninguno en la v1 | `models.providers` ya existe en `contract/workspace-governance.schema.yaml`. |

## 7. Dónde vive cada parte

- **Motor (`danil-engine`).** La decisión y su aplicación en cada punto.
  Tiene que estar ahí porque es el único lugar que todos los caminos
  atraviesan: el CLI, la ventana, el móvil, el coordinador y las otras
  máquinas. Si estuviera en un cliente, se saltaría desde cualquier otro.
- **Workspace (`meta.json`, en el motor).** La lista local. Es del workspace
  porque el compromiso es con el cliente de ese workspace y no con la
  máquina ni con la persona.
- **Harness.** La lista de la organización, sin cambios. Si existe, manda.
- **Ventana (este repositorio).** Editar, mostrar y explicar. Nunca decide.
- **Plano de control (`computers`).** No participa en la v1. Será el lugar de
  la política local cuando el workspace sea de la cuenta.

## 8. Riesgos

1. **Falsa seguridad con los CLIs multivendedor.** Un cliente puede creer
   que «sin Codex» significa «sin OpenAI». Mitigación: el aviso al admitirlos
   y la documentación.
2. **Máquinas sin la misma política.** Una persona entra directamente a otra
   máquina donde no configuró la lista. Mitigación: la verificación en el
   origen, el aviso de diferencia, y en la v2 el registro de cuenta.
3. **Bloquear a mitad de una orquestación.** Las hijas de un coordinador con
   el proveedor bloqueado se quedan sin turno. Es el comportamiento correcto,
   pero el error tiene que llegar al coordinador con `detail.allowed` para que
   pueda relanzar las hijas.
4. **Editar `meta.json` a mano o desde un turno.** Está fuera del modelo de
   amenaza (§4) y se declara en la documentación.
5. **Una ventana nueva sobre un motor viejo** mostraría una política que nadie
   aplica. Mitigación: la extensión `workspace_provider_policy_v1`.

## 9. Decisiones de la persona

| # | Decisión | Recomendación |
|---|---|---|
| D1 | ¿Lista de permitidos o de bloqueados? | **Permitidos.** Un CLI nuevo no debe entrar sin que nadie lo decida. |
| D2 | Cuando hay Harness y política local, ¿cuál gana? | **La intersección.** La local solo estrecha. |
| D3 | ¿El Harness exige `models.providers` siempre, o solo con `models` en `locked`, como hoy? | **Como hoy en la v1.** Cambiarlo cambia el comportamiento de las organizaciones que ya usan el modo informativo. Se puede revisar con Harness aparte. |
| D4 | ¿La v1 incluye bloquear por vendedor de modelos? | **No.** Hoy no se puede saber el vendedor antes del turno. Se usa el aviso y el Harness `models.allowed`. |
| D5 | ¿Qué pasa con un turno en curso cuando se bloquea su proveedor? | **Termina.** El siguiente se rechaza. |
| D6 | ¿Quién puede editar la política local? | **Solo la persona desde la ventana (`admin`)**, nunca una tarea. |
| D7 | ¿La política local se mueve al plano de control cuando el workspace sea de la cuenta? | **Sí.** Se deja anotado como dependencia de `account-workspace`. |

## 10. Encargos propuestos (no lanzados)

Se ejecutan en este orden: las partes 2 y 3 dependen de la 1.

1. **`architect` — revisar el contrato.** Objetivo: aprobar el campo de
   `meta.json`, la extensión, el comando `admin`, los códigos de error y el
   campo de `agent list`. Criterio: un contrato escrito en `danil-engine/docs/`
   y validado en `commands.public.json`.
2. **`tech-lead` en `danil-engine` — el motor.** Objetivo: `provider_policy::admit`
   y su aplicación en `validate`, `set_provider_de`, `send_message_inner`, la
   delegación remota (origen) y `list_providers`. Dependencia: la parte 1.
   Criterio: hay pruebas unitarias por punto para estos casos: sin política,
   solo local, solo Harness, ambas, y la local que intenta ampliar. En la
   prueba, `task create --agent codex` en un workspace con
   `providers_allowed: ["claude"]` falla con `provider_not_allowed` y no crea
   la tarea.
3. **`design` y luego `tech-lead` en `danil` — la ventana.** Objetivo:
   Configuración › Workspace › Proveedores permitidos, la marca `política`, el
   aviso de turno rechazado con «Cambiar de CLI» y el selector de handover
   filtrado. Dependencias: las partes 1 y 2 y que el motor esté fijado con la
   extensión. Criterio: `pnpm verify` en verde y las claves en `es` y `en`.
4. **`qa` — el recorrido real.** Configurar el workspace con solo Claude.
   Comprobar estos resultados: `agent list` marca Codex; el menú no lo ofrece;
   `task create --agent codex` falla; el handover a Codex se rechaza; una tarea
   Codex existente no corre su siguiente turno y ofrece cambiar; una
   delegación a otra máquina con Codex se rechaza en el origen. Criterio:
   evidencia en `docs/qa-results/`.

## 11. Lo que no se midió

- No se probó en una máquina que `send_message_inner` cubra **todos** los
  turnos (respuestas en un turno vivo, reanudaciones por canal). Se dedujo de
  la lectura: los ocho `send_message*` llaman a `send_message_inner`.
- No se midió cómo llega hoy al CLI el `Err(String)` de `model_for_turn` (qué
  `code` ve `task create`).
- No se revisó el móvil. Usa el mismo `list_surfaces` por la relay y debería
  heredar la marca, pero no se comprobó.
