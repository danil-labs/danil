# Linux en esta Mac: una VM de Lima como máquina hija

**Estado:** EN PRUEBA · 2026-11-05

Es el mismo modelo que [Linux en esta PC](wsl-local-machine.md): un huésped
con motor de Danil, **solo local**, sin cuenta ni relay. La ventana le habla
por RPC1 en `127.0.0.1`. Cambia el canal: aquí es `limactl`, no `wsl.exe`.

- **Id de máquina:** `lima:<instancia>`.
- **Registro:** `guests.json` en la carpeta de datos local de la ventana
  (`{ channel, guest, user, home, name, added_at }`). Tiene las reglas de
  `wsl-children.json`: si no se puede leer, guardar falla, y conserva lo que
  no entiende. Las entradas `wsl` no van aquí.
- **Código:** `src-tauri/src/extracted/guests/lima.rs` (canal) y `child.rs`
  (conexión, alta y trabajos, comunes con WSL).

## Cómo se habla con ella

| Para qué | Canal |
| --- | --- |
| Encontrar `limactl` | `/opt/homebrew/bin`, `/usr/local/bin`, `~/.local/bin` y después el PATH. Una ventana abierta desde Finder no trae Homebrew en el PATH. |
| Listar VMs | `limactl list --json` en el `LIMA_HOME` vigente (`~/.lima` si no está definido), y con `LIMA_HOME=$COLIMA_HOME/_lima` (`~/.colima/_lima` por omisión) para las de Colima: esas son del sistema y nunca se ofrecen |
| Correr un script | `limactl shell --workdir / <vm> sh -s` con el script por stdin. Sin `--workdir`, Lima intenta entrar a la carpeta actual de la Mac |
| Descriptor y token | un solo `limactl shell` que imprime los dos. Se leen en memoria: el token no va a disco, a un trabajo ni a un error |
| Órdenes y eventos | RPC1 a `127.0.0.1:<puerto>`: el hostagent de Lima reenvía el puerto a la Mac |

`address` del descriptor solo se acepta si es loopback. Si una orden no llega,
o el motor contesta `invalid_token` o `unauthorized`, se relee por el canal: el
puerto y el token cambian en cada arranque del motor.

Sin cuenta de Danil el bloque se muestra igual: es local. El laboratorio
(`pnpm engine:start`) le da a la ventana un `HOME` desechable; en macOS le
pasa `LIMA_HOME` y `COLIMA_HOME` con las carpetas reales, para que vea las VMs
de la persona (una variable ya definida se respeta).

## Apagada

Una VM apagada **no se enciende por leer**. Si la lista compartida de
`limactl list` (una lectura cada 3 s para todas las máquinas) no dice
`Running`, `guest_call`, `guest_events` y el estado contestan `machine_off`
al instante, sin `limactl shell` ni la espera de 40 s. Solo `guest_start`
corre `limactl start` (hasta 5 min) y luego espera a que el motor conteste.
Lima no necesita `keep_alive`: la VM sigue encendida sola.

## Conectar (`guest_connect`) y crear (`lima_create`)

Los dos son trabajos, como en WSL (`guest-job`, `wsl-state.json`).

1. `probe.sh` por el canal: arquitectura, systemd de usuario, dependencias,
   `sudo -n`, si hay motor y su `contract`, si está inscrito en una cuenta
   (`seldon-runtime machines status --data <data> --json`: 0 conectado,
   3 sin cuenta) y cuántas carpetas de la Mac ve la VM. Esa última cifra se
   muestra en una línea antes de instalar.
2. Según el motor que encuentra:
   - **`already`**: motor sin cuenta con el `contract` del lock. Se conecta
     sin reinstalar.
   - **`enrolled`**: motor inscrito en una cuenta, o sin poder saberlo. Se para
     ahí: no corre `add_workspace` ni `set_active_workspace`.
   - **instalar**: dependencias como root con `sudo -n` (sin sudo sin
     contraseña, `sudo_required` con el comando para copiar); el motor del lock
     según `uname -m`; `install.sh --no-connect` y el drop-in `UMask=0077`.
3. Espera a que el motor conteste, crea el workspace de la ventana con el mismo
   id y guarda la entrada en `guests.json`.

«Crear VM» corre `limactl create --name <nombre> --cpus 4 --memory 4
--mount-none --containerd=none template:ubuntu-lts`, después `limactl start` y
sigue con «Conectar». La VM que crea Danil no ve carpetas de la Mac.

## Pendiente

- El lock no trae `aarch64-unknown-linux-gnu`. En una Mac con Apple Silicon,
  una VM sin motor se detiene en `arch` hasta que se publique ese binario.
  Solo se conecta una VM que ya tenga el motor (`already`).
- Llegar a la VM desde la web y el teléfono, como con WSL.
