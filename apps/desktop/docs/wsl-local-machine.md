# Linux en esta PC: la distro como máquina hija

**Estado:** EN PRUEBA · 2026-11-04

**Decisión en una línea:** una distro de WSL con motor de Danil es una máquina
**solo local**, hija de la computadora que la tiene. No se inscribe en el plano
de control ni abre su propio relay; la ventana le habla directo por RPC1 en
`127.0.0.1`.

Reemplaza, para la v1, el camino «relay primero» de
[wsl-onboarding.md](wsl-onboarding.md): ahí la distro se inscribía como
cualquier VPS. Aquí se acepta una excepción a la regla «toda máquina se alcanza
por el relay», a cambio de que conectar sea un botón, sin código de alta ni
cuenta, y que funcione sin internet.

## Qué es

- **Otro motor.** El mismo `seldon-runtime` que fija esta ventana
  (`seldon-runtime.lock`), en su versión de Linux, instalado con el
  `install.sh` de seldon-host y `--no-connect`. Tiene sus propios workspaces,
  agentes, cuentas y archivos.
- **Id de máquina:** `wsl:<distro>`. Solo existe en esta computadora
  (`wsl-children.json` en la carpeta de datos de la ventana). Guardar ese
  registro nunca lo vacía: si no se puede leer, falla, y conserva las entradas
  que esta versión no entiende.
- **En la flota** entra con un enlace propio (`features/machines/guestLink.ts`),
  con la misma forma que una sesión de relay: «Ejecutar en», el chat, los
  archivos y los eventos funcionan igual que con cualquier máquina.

## Cómo se habla con ella

| Para qué | Canal |
| --- | --- |
| Instalar distro, crear usuario, instalar motor | `wsl.exe --exec sh -s` con el script por stdin |
| Descriptor y token del motor | `\\wsl.localhost\<distro>\home\<usuario>\.local\share\seldon-host\data\` |
| Órdenes y eventos | RPC1 por TCP a `127.0.0.1:<puerto>` (WSL reenvía el puerto a Windows) |
| Mantenerla encendida | un `wsl.exe … cat` abierto mientras la ventana la usa |

Medido el 2026-11-03 en Windows 11 con WSL 3.0.3 y Ubuntu 26.04:

- RPC1 desde Windows: ~5 ms por orden con la conexión abierta.
- `wsl.exe -- true`: ~430 ms por llamada, y a veces más de 10 s. Por eso no es
  el canal de las órdenes.
- Leer el descriptor por `\\wsl.localhost`: ~0,7 s. Con `wsl.exe cat` fueron 14 s.
- WSL apaga la distro unos 20 s después de cerrarse el último `wsl.exe`, y con
  ella el motor («se apaga por señal»). De ahí el `wsl.exe` que se queda
  abierto.
- El motor cambia de puerto y de token en cada arranque. Si una orden no
  llega, la ventana relee el descriptor y la repite con el mismo `request_id`.

## Lo que hace la ventana al conectar

1. Si la distro no tiene usuario (instalada con `--no-launch`), lo crea con el
   nombre y la contraseña que da la persona, como la primera vez que se abre
   Ubuntu. La contraseña viaja por stdin y no se guarda.
2. Instala lo que pide el motor si falta (`curl`, `tar`, `cmp`, `libdbus-1-3`).
3. Baja el binario de Linux del lock, verifica su SHA-256, arma el paquete
   local y corre `install.sh --no-connect`.
4. Fija `UMask=0077` en el servicio de usuario. En Ubuntu el servicio hereda
   `UMask=0002`, el motor crea `executor-releases/` con escritura de grupo y
   su propio preflight lo rechaza (`executor_release_permissions`): ninguna
   tarea arranca. Hay que corregirlo también en el `install.sh` de seldon-host.
5. Crea el workspace de la ventana con el mismo id (`add_workspace`).
   `materialize_workspace` pide cuenta de Danil y la máquina hija no la tiene.

Instalar una distro nueva baja la imagen del catálogo de Microsoft
(`DistributionInfo.json`) con avance y reanudación, verifica su SHA-256 y la
registra con `wsl --install --from-file`. `wsl --install -d` se quedó colgado
dos veces sin decir nada cuando no corre en una consola.

## Pendiente

- Llegar a la distro desde la web y el teléfono: relay → motor de esta PC →
  motor de la distro. Hoy solo la ventana de esta PC la ve.
- Los nombres de distro con espacios no existen: WSL los rechaza
  (`E_INVALIDARG`).

## Estado y trabajos (v6 del flujo)

La pantalla no guarda nada: muestra lo que le da la ventana.

- `wsl_state` devuelve de una vez el estado de Linux (`ready`, `missing`,
  `reboot`, `virtualization`, `unsupported`, `unknown`), las distribuciones con
  su máquina hija si la tienen, el trabajo en curso y lo que quedó pendiente de
  un reinicio.
- Activar, instalar y conectar son **trabajos**: uno a la vez, en un hilo de la
  ventana. Un segundo clic se engancha al que corre. Cada paso se publica con
  `guest-job` y se guarda en `wsl-state.json`, así que salir de Configuración o
  cerrar la ventana no lo pierde. Al terminar, `guest-state-changed` pide releer.
- **Reinicio pendiente:** se sabe por `RebootPending` en el registro, por
  `wsl --status` (virtualización sin encender) o porque se activó WSL desde aquí
  después del último arranque. Mientras falte, no se instala. Si una
  instalación chocó con eso, queda en `resume` y, después del reinicio, se
  ofrece «Continuar» con la misma descarga (la imagen verificada no se vuelve
  a bajar). La contraseña se vuelve a pedir: no se guarda.
- `apt-get` espera hasta 5 minutos a que otro programa suelte el candado
  (`-o DPkg::Lock::Timeout=300`). Fue lo que tumbó el segundo intento de
  conectar Debian.
- Las líneas del instalador que se muestran en «Ver lo que está haciendo» no
  nombran piezas internas: dicen «el motor de Danil».

## Código y comandos

El código vive en `src-tauri/src/extracted/guests/`, preparado para más de un
canal de máquinas locales: `mod.rs` (el canal y el huésped), `run.rs` (procesos
con plazo), `wsl.rs` (lectura de `wsl.exe`), `wsl_setup.rs` (lo que solo existe
en WSL) y `child.rs` (registro, RPC1, eventos y trabajos).

Comandos de la ventana (no del motor; no están en `commands.json`):

| Comando | Qué hace |
| --- | --- |
| `guest_channels` | Los canales de este equipo: `["wsl"]` en Windows, `[]` en los demás. |
| `guest_children { fresh? }` | Las máquinas hijas con su estado. |
| `guest_call`, `guest_events` | Una orden o una página de eventos al motor del huésped. |
| `guest_copy_folder`, `guest_sync_spaces` | Carpetas y espacios de esta PC en el huésped. |
| `guest_start`, `guest_remove` | Encenderla y quitarla. |

El alta de WSL conserva sus comandos (`wsl_state`, `wsl_catalog`,
`wsl_enable`, `wsl_install`, `wsl_connect`, `wsl_reboot`, `wsl_distro_user`,
`wsl_job_*`, `wsl_resume_forget`). Cuando cambia una máquina hija, la pantalla
avisa a la flota con el evento `danil:guests-changed`.
