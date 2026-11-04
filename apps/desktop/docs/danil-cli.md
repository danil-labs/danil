# CLI de Danil

Con la CLI manejas Danil desde una terminal o desde un agente: tareas, workspaces,
carpetas y tus computadoras.

## Qué es

`danil` y `dn` son el mismo comando. `dn` es la forma corta. No hay otros nombres
operativos: `terminus`, `radiant` y `seldon-runtime` no son comandos de esta CLI y
no tienen alias.

```sh
dn --help
dn --version
danil --version
```

**Disponibilidad.** `dn machines` y las variables `DANIL_*` llegan con el motor
que ya tiene el grupo `machines`, y con la app que lo nombra. Las instalaciones
actuales todavía no los tienen. Si `dn` no existe o `dn machines` responde
`unrecognized subcommand`, tu instalación es anterior. Ese motor no se instala
solo.

## Cómo se organiza

Hay dos clases de comandos:

| Clase | Comandos | Para qué |
|---|---|---|
| Por dominio | `dn machines`, `dn harness`; más adelante `dn agents` | Un área completa del producto, con sus subcomandos |
| De trabajo | `task`, `workspace`, `folder`, `status`, `context`, `guide` y otros | Lo que usas cada día; `dn --help` los lista |

**Regla para agregar un comando.** Si pertenece a un dominio, va dentro de su
grupo. Sólo es de primer nivel si se usa en todo el trabajo diario. Un comando
nuevo no ocupa el nombre de un grupo de dominio ni repite el nombre del comando
(nada de `danil danil`). Todo comando funciona igual con `danil` y con `dn`.

`dn agent-context --json` imprime los comandos con sus opciones y autoridad, salvo
`dn machines connect` y `dn machines status`, que describe la tabla de Autoridad.
`dn guide` imprime la guía de tu versión.

## `dn machines`

Tus máquinas: conectar una a tu cuenta y encender tus VMs de EC2.

### Conectar tu máquina, VPS o servidor

1. Instala Seldon Host en esa máquina con el comando que muestra **Conectar otra
   máquina** en la app. Deja `danil` y `dn` en `~/.local/bin`.
2. El instalador muestra una liga y un código.
3. Abre la liga y aprueba con tu cuenta de Danil antes de 10 minutos.

Si instalaste sin conectar, o quieres reintentar:

```sh
dn machines connect
dn machines connect --name "Mi VPS"
```

Si instalaste en una carpeta propia, agrega `--data <carpeta>/data`.

Para saber cómo va:

```sh
dn machines status
dn machines status --json
```

Sale con 0 si está conectada, con 3 si no tiene cuenta y con 1 si algo falló. Al
fallar dice el tramo, la causa y cómo arreglarlo.

### VMs de EC2 con AWS SSO

`dn machines vm` enciende y apaga VMs de EC2 con **tu propia** sesión de AWS.
Sólo necesita un archivo de configuración sin secretos.

```sh
dn machines vm setup --config-file vm.json
dn machines vm login
dn machines vm start --name windows --login
dn machines vm status --name windows --json
dn machines vm stop --name windows --confirm-shared-stop
```

`--confirm-shared-stop` es obligatorio: confirma que ya coordinaste con quienes
usen esa VM.

### Diferencia con las VMs administradas

| | `dn machines connect` | `dn machines vm` | VM administrada |
|---|---|---|---|
| Qué es | Una máquina tuya | Una EC2 a la que tienes acceso | Una máquina que prepara Danil |
| Cómo entra a tu cuenta | Código que apruebas | No entra: sólo la enciende o apaga | Credencial de inscripción de un solo uso (`enroll.json`) |
| Quién actúa | Tú, con tu cuenta de Danil | Tú, con AWS SSO | El equipo de Danil |

Las VMs administradas no se conectan con esta CLI. No uses `enroll.json` en una
máquina propia.

### Máquinas compartidas de tu organización

`dn machines machine` lista, enciende y apaga las máquinas que tu organización
comparte, como `vm-verify`. Dan servicios y no corren tareas. Usa la sesión de
Danil del motor; no pide AWS.

```sh
dn machines machine list --json
dn machines machine start vm-verify --wait --timeout 300
dn machines machine stop vm-verify
```

`start` y `stop` tienen efecto real y quedan auditados. Son idempotentes. Con
`--wait`, `start` espera a que la máquina corra; si se agota el plazo, responde
`wait_timed_out` con el último estado y sale con 4.

## `dn harness`

Todavía no está disponible: hoy `dn harness` responde `unrecognized subcommand`.
Estos son los grupos previstos.

| Grupo | Para qué | Estado |
|---|---|---|
| `dn harness eval` | Evaluar tu harness en local | En desarrollo |
| `dn harness policy` | Ver, comparar, validar y proponer políticas | En desarrollo |
| `dn harness members` | Personas de la organización | Depende de un servicio que aún no existe |
| `dn harness usage` | Consumo de la organización | Depende de un servicio que aún no existe |

## Autoridad

| Comando | Qué exige |
|---|---|
| `dn machines connect` | Una cuenta de Danil que apruebe el código |
| `dn machines status` | Acceso a la máquina; no necesita sesión |
| `dn machines vm setup`, `login`, `start`, `stop` | Tu sesión personal de AWS SSO. Sólo en tu terminal: una tarea no puede usarlos |
| `dn machines vm status` | Tu sesión de AWS SSO y la configuración de la VM |
| `dn machines machine list` | Lectura, con la sesión de Danil del motor |
| `dn machines machine start`, `stop` | Autoridad de tarea: una tarea sí puede usarlos |
| `task`, `workspace`, `folder` | Dentro de una tarea, la autoridad de esa tarea; en tu terminal, la tuya sobre el motor local |
| `dn harness` | Se documentará cuando exista |

El resto de los comandos declara su autoridad en `dn agent-context --json`, en los
campos `authority` y `audience`.

Dentro de una tarea la CLI usa las variables `DANIL_CONNECTION`,
`DANIL_WORKSPACE`, `DANIL_FOLDER` y `DANIL_TASK`. Danil las pone por ti.

## Migración

| Antes | Ahora |
|---|---|
| `terminus <comando>` | `danil <comando>` o `dn <comando>` |
| `seldon-runtime danil connect` | `dn machines connect` |
| `seldon-runtime danil status` | `dn machines status` |
| `terminus vm <orden>` | `dn machines vm <orden>` |
| `terminus machine <orden>` | `dn machines machine <orden>` |
| `TERMINUS_CONNECTION`, `_WORKSPACE`, `_FOLDER`, `_TASK` | `DANIL_CONNECTION`, `_WORKSPACE`, `_FOLDER`, `_TASK` |
| `TERMINUS_CLI`, `TERMINUS_PROFILE`, `TERMINUS_CREDENTIAL` | `DANIL_CLI`, `DANIL_PROFILE`, `DANIL_CREDENTIAL` |
| `radiant graph`, `diff`, `assess`, `validate`, `bundle`, `run`, `connect`, `connections` | `dn harness eval …` (en desarrollo) |
| `radiant members`, `radiant usage` | `dn harness members`, `dn harness usage` (pendientes) |

Las órdenes `radiant` no listadas aún no tienen lugar en Danil. Sigue usando la CLI
de Radiant para ellas.

El contexto `TERMINUS_*` no se ignora. Si alguna de esas variables sigue en tu
entorno, la CLI se detiene:

```text
conflicting_selection: El entorno CLI TERMINUS_* ya no se admite. Usa DANIL_*.
```

La salida es 2. Así una tarea nunca termina actuando con tu autoridad de persona.
Quita la variable o cámbiala por su `DANIL_*`. Revisa también la configuración MCP
de tus orquestadores externos.

## Ejemplos probados

Se ejecutaron con Linux x86_64. Lo no listado aquí no se ejecutó para esta guía.

| Ejemplo | Resultado |
|---|---|
| `dn --help`, `dn --version`, `danil --version` | Probado, salida 0 |
| `dn machines --help`, `dn machines vm login --help` | Probado, salida 0 |
| `dn machines connect`, `--name`, `dn machines status`, `--json` | Probado con el instalador y un plano de control de prueba |
| `dn --root <carpeta> status --json` | Probado, salida 0 |
| `dn --root <carpeta> workspace list --json` | Probado, salida 0 |
| `dn agent-context --json`, `dn guide` | Probado, salida 0 |
| `TERMINUS_TASK=x danil status` | Probado, salida 2 con el mensaje de arriba |
| `dn machines vm status --name demo --json` sin configuración | Probado: error `vm_config` |
| `dn machines vm setup`, `login`, `start`, `stop` con AWS real | **No probado** |
| Windows y macOS | **No probado** para esta guía |

## Anexo: launchers desde este repositorio

El tooling requiere Node y un ejecutable operativo existente. Desde la raíz:

```sh
node apps/desktop/scripts/cli-path.mjs --help
```

Para instalar, usa `install --target <ejecutable-absoluto> --bin-dir
<directorio-absoluto-canónico>`. Agrega `--dry-run` para comprobar sin escribir.
El destino puede ser el ejecutable físico `terminus` junto a su motor, un CLI
independiente compatible o un AppImage ejecutable. No selecciones otro launcher.
Los launchers siguen la ruta elegida: si mueves la app, vuelve a ejecutar la
instalación con su nueva ruta.

En macOS el ejecutable instalado conserva la ruta
`/Applications/Terminus.app/Contents/MacOS/terminus`. En Windows conserva
`terminus.exe` dentro de la instalación. En Linux selecciona el AppImage o
el ejecutable del laboratorio, nunca una ruta temporal de montaje del AppImage.

El comando comprueba `danil` y `dn` en el directorio elegido y en todo el PATH.
Rechaza archivos ajenos, enlaces (también rotos) y colisiones con extensiones
Windows, sin reemplazarlos. Sólo actualiza archivos que coinciden por completo
con el formato de launcher propio. Windows recibe `.cmd` para cmd/PowerShell
y scripts sin extensión para Git Bash. Unix recibe scripts que usan `exec`.

El instalador no cambia el PATH ni perfiles del shell. El resultado JSON indica
si el directorio ya está en PATH. Si no, agrégalo mediante la configuración de
tu sistema y vuelve a abrir la terminal. Los alias o funciones definidos por el
shell no aparecen en el PATH: revísalos también en la terminal que usarás.

Para retirar únicamente los launchers propios, usa `uninstall --bin-dir
<directorio-absoluto-canónico>`, con `--dry-run` si quieres inspeccionar primero.
No retira el ejecutable ni modifica datos o credenciales.

`npx @danil-labs/terminus` resuelve el único bin del paquete,
`danil-terminus`, que instala la app. El paquete no expone un bin `terminus`
ni instala el CLI operativo. Las versiones ya publicadas no cambian con esta
implementación local.

Notas para quien mantiene la CLI: [danil-cli-internal.md](danil-cli-internal.md).
