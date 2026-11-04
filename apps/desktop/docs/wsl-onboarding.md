# Alta de WSL en Windows

**Estado:** PROPUESTA · 2026-11-03

**Toca tres repositorios:** `danil-labs/terminus` (ventana y `packages/`),
`danil-labs/computers` (plano de control y relay) y `danil-labs/seldon-host`
(motor e instalador).

**Decisión en una línea:** un distro de WSL es una máquina normal de la cuenta:
se inscribe, abre su relay y se gobierna igual que un VPS. `wsl.exe` hace el
bootstrap y, si el relay no está, sirve de transporte local de respaldo.

Sigue el modelo de [ssh-bootstrap-governance.md](ssh-bootstrap-governance.md):
el acceso al sistema no autoriza nada dentro de Danil; la inscripción y el token
de miembro sí.

## Problema

Windows es un cliente de primera clase, pero sus agentes corren en el motor
nativo (`seldon-runtime.exe`, incluido en el instalador y lanzado aparte de la
ventana). Quien quiere herramientas de Linux —Node, Python, git, los CLIs de los
agentes— termina usando WSL, y hoy Danil no lo ve: la única salida es tratar el
distro como una máquina remota y repetir el flujo de copiar un comando, abrir
una terminal de WSL, aprobar el código y esperar.

Dray demuestra que una línea basta para una máquina remota. En WSL hay menos
excusa todavía: el «otro equipo» está en la misma caja y `wsl.exe` ya es un canal
de ejecución sin puertos, sin SSH y sin llaves.

La trampa sería convertirlo en una máquina local escondida. Si sólo la ve la
ventana de Windows, las tareas que corren ahí desaparecen para la web y el
teléfono, y la gobernanza de una organización se vuelve decorativa. La máquina
tiene que ser normal.

## Principios

1. **Una distro es una máquina.** Identidad, credencial, workspaces y datos
   propios. No se mezcla con la máquina «ventana» (`self`).
2. **Relay primero.** La inscripción y el camino principal son los mismos que
   los de cualquier máquina. El transporte local es un respaldo, no un modelo
   paralelo.
3. **El filesystem es el de Linux.** Repos y datos viven en el FS del distro, no
   en `/mnt/c`.
4. **systemd cuando se pueda.** El motor sobrevive al cierre de la ventana y a
   la suspensión; si el distro no tiene systemd, se dice y se ofrece el camino,
   sin activarlo a escondidas.
5. **Nada de root silencioso.** Instalar paquetes con `wsl.exe -u root` o `sudo`
   se pide; si no se puede, se imprime el comando exacto.

## Detección

Todo empieza en Configuración → Máquinas → **Agregar WSL**, sólo en Windows.
La detección es una acción explícita, no algo que corre en cada arranque.

```
┌──────────────────────────── Windows ────────────────────────────┐
│  ventana Danil (Tauri)                                          │
│    │ wsl.exe: detectar, instalar, arrancar                      │
│    ▼                                                            │
│  ┌──────────────────── WSL 2 (Linux) ────────────────────────┐  │
│  │  seldon-runtime + unidad de systemd + datos del distro    │  │
│  └───────────────────────────┬───────────────────────────────┘  │
│                              │ relay                            │
└──────────────────────────────┼──────────────────────────────────┘
                               ▼
                        computers / relay
```

**Comandos base.** `wsl.exe --status` y `wsl.exe -l -v`. La salida de `wsl.exe`
redirigida es **UTF-16LE**, no UTF-8: el parser tiene que decodificarla o lee
basura. `wsl.exe -l -v` da nombre, estado, versión y cuál es el default.

**Qué se comprueba, y qué bloquea:**

| Comprobación | Cómo | Si falla |
| --- | --- | --- |
| WSL instalado | `wsl.exe --status` | `wsl_missing`: ofrecer `wsl --install` (elevado, reinicio) |
| Distro en WSL 2 | columna `VERSION` de `-l -v` | `wsl1`: modo degradado; `wsl --set-version <distro> 2` sólo si hay virtualización |
| Distro encendida | columna `STATE` | `stopped`: arrancarla con `wsl.exe -d <distro> -- true` |
| Arquitectura | `uname -m` dentro | `arch`: buscar el motor arm64 o x86_64 correcto |
| systemd | `systemctl is-system-running` | `no_systemd`: camino alterno (abajo) |
| Herramientas | `bash`, `curl`, `git`, `ca-certificates` | se ofrecen en la instalación |
| Motor ya presente | `command -v danil`, datos del motor | `already`: ofrecer conectar, no reinstalar |

Los distros de sistema (`docker-desktop`, `docker-desktop-data`,
`rancher-desktop` y similares) se listan aparte y no se ofrecen por defecto.

## Instalación

Se reutiliza el mismo `install.sh` de `danil machines connect`, con el nombre
sugerido `<equipo> (WSL: <distro>)` (`COMPUTER_NAME_MAX` ya limita a 120).

1. La ventana elige distro y nombre.
2. Se pide el código de alta y se corre el instalador dentro del distro:
   `wsl.exe -d <distro> -- bash -s -- <código>`, con el script por **stdin** y el
   código como argumento del script, no en la línea de `wsl.exe` (la línea es
   visible para los procesos de Windows).
3. El instalador baja el motor de Linux para la arquitectura, lo deja en
   `~/.local/bin`, crea el directorio de datos y, si se aceptó, instala las
   herramientas marcadas (git, `gh`, agentes, ffmpeg).
4. La máquina se inscribe y aparece en `GET /v1/computers`.
5. La persona aprueba el código en la ventana o en la web, como hoy.

**Requisito para `seldon-host`:** el instalador necesita un modo no interactivo
(`--code`, `--json` o equivalente) y no debe imprimir el código ni el token en
la salida. Sin ese modo, el respaldo es abrir una terminal de WSL con el comando
ya escrito y dejar que la persona lo pegue; funciona, pero es la fricción que
este diseño quiere quitar.

**Paquetes del sistema.** `apt` necesita `DEBIAN_FRONTEND=noninteractive` y, si
hace falta `sudo`, se intenta `sudo -n` primero. Si no hay sudo sin contraseña,
se ofrece `wsl.exe -u root` **con consentimiento explícito**, o se muestra la
línea para que la persona la corra. En un equipo gobernado por una organización,
la política puede prohibir las dos; ahí se queda en el mensaje.

**Idempotencia.** Si el distro ya tiene motor, no se reinstala: se detecta su
versión y se ofrece «conectar» o «actualizar», nunca las dos a ciegas.

## Servicio y ciclo de vida

**Con systemd (recomendado).** Unidad de usuario `danil-engine.service` con
`Restart=on-failure` y `loginctl enable-linger <usuario>` para que sobreviva a la
sesión. Alternativa: unidad de sistema con `User=<usuario>`; evita depender de
linger, pero mezcla el motor con el arranque del distro. Preferencia: usuario +
linger, como Dray en Linux.

**Sin systemd.** No se activa a escondidas. Se explica el cambio:

```ini
# /etc/wsl.conf
[boot]
systemd=true
```

seguido de `wsl --shutdown` y volver a arrancar. Si la persona no quiere tocar
el distro, el respaldo es una tarea programada de Windows al iniciar sesión que
corra `wsl.exe -d <distro> -- true` y el motor arranque por su cuenta; o, en el
peor caso, un arranque bajo demanda desde la ventana. El diseño dice cuál está
activo en la fila de la máquina.

**Arranque con Windows.** Opcional y explícito: una tarea programada al iniciar
sesión que haga `wsl.exe -d <distro> -- true`. Sin eso, el distro arranca la
primera vez que alguien lo usa, y con él systemd y el motor.

**Se apaga.** `wsl --shutdown`, suspensión o reinicio de Windows matan el distro
y con él los turnos en curso. La máquina se muestra apagada, no como error
(`Power` ya distingue `off`). Al volver, el motor reabre su sesión de relay y
las tareas continúan desde su log; un turno cortado se reconcilia como cualquier
máquina que se apagó.

**Despertar.** Desde el plano de control es una máquina propia
(`kind: self_hosted`, `wakeable: false`): no se enciende desde otra máquina. La
ventana sí puede arrancarla localmente con un «Encender» que corre `wsl.exe`.
Es un `wake` local, no del relay.

## Rutas

- **Repos en el FS de Linux:** `~/danil/<repo>` o `~/code/<repo>`. Nunca
  `/mnt/c/...` por defecto: 9p es lento, `inotify` no se comporta igual y los
  permisos y finales de línea mueren ahí.
- **Datos del motor** en el directorio del distro
  (`~/.local/share/ai.danil.terminus`, tentativo), con adjuntos y artefactos.
  Nada de datos del motor en `%LOCALAPPDATA%`.
- **La UI muestra rutas de Linux.** El cliente nunca traduce a `C:\`; los
  archivos se leen y se sirven por el motor, como en una máquina remota. Para
  «abrir en» una app nativa, `\\wsl.localhost\<distro>\home\...` es la salida,
  no el camino principal.
- **Git dentro del distro:** `core.autocrlf=false`, `core.filemode=true` y
  `safe.directory` cuando haga falta. Si un repo vive en `/mnt/c`, se avisa y se
  ofrece clonarlo en Linux.
- **Adjuntos y portapapeles:** los bytes van de Windows al motor
  (`guardar_adjunto` ya existe); no hay rutas cruzadas.
- **Mayúsculas y enlaces:** el FS de Linux es sensible a mayúsculas y soporta
  symlinks; lo que se pruebe en `/mnt/c` no cuenta.

## Visibilidad y transporte

1. La máquina se inscribe y aparece en `GET /v1/computers`.
2. El plano de control la vincula a los workspaces que correspondan (`linked`),
   igual que a cualquier máquina. **No se auto-vincula a un workspace de
   organización por estar en el mismo equipo.**
3. Abre su sesión de relay y manda `hello` con contrato, versión y `features`.
4. La ventana, la web y el teléfono la ven por el relay. Ese es el camino
   principal, y es lo que mantiene la promesa de «una cuenta, la misma app».
5. **Respaldo local (fase 2):** si el relay no está disponible, la ventana puede
   hablar con el motor del distro por su endpoint TCP en `127.0.0.1` (WSL2 lo
   reenvía a Windows). Ese enlace presenta el mismo sobre
   `{machine, workspace, command, args}` y se usa **uno a la vez**: relay
   mientras esté; local sólo cuando el relay falle, con resincronización al
   volver. Si el relay está caído, la máquina se ve sólo en ese equipo y la UI
   lo dice.

**Datos propuestos en `MachineInfo`** (nombres tentativos):

- `os: "linux"` (ya existe `SystemId`).
- `wakes: false` y `kind: "self_hosted"` (ya existen).
- `transport?: "relay" | "local"` y `local?: boolean`, para que la fila y la
  barra digan por dónde va.
- El registro local de la ventana (`wsl.json`, tentativo) guarda
  `distro ↔ computer_id`, la versión instalada y si el servicio es systemd o
  tarea programada. No es una fuente de verdad: la máquina vive en el plano de
  control.

**Duplicados.** Si el distro ya está conectado (por esta ventana o por otra), se
detecta por `computer_id` y se ofrece «ya está conectada», no una segunda alta.
Dos clientes pueden mirar la misma máquina; lo que no puede haber es dos
identidades para el mismo motor.

## Flujo de la ventana

| Paso | Qué hace | Si falla |
| --- | --- | --- |
| 1. Detectar | lista distros, estado, versión, arch, systemd | `wsl_missing`, `wsl1`, `arch` |
| 2. Elegir | distro, nombre, herramientas | — |
| 3. Instalar | corre `install.sh` por `wsl.exe` | `sudo_required`, `install_failed` |
| 4. Inscribir | código de alta y aprobación | `enroll` (código vencido o sin permiso) |
| 5. Servicio | unidad systemd o tarea programada | `no_systemd`, `service_failed` |
| 6. En línea | espera el `hello` del relay | `relay` (90 s), `version` |
| 7. Listo | abre la máquina o crea una tarea ahí | — |

Los hops son los mismos nombres que ya usa `ConnectProgress` (`account`,
`approval`, `relay`, `version`) más los propios de WSL. Cada fallo trae el
comando exacto para copiar, como hace hoy la fila de un servidor de Dray.

## Seguridad

- El motor escucha en `127.0.0.1` con token, nunca en `0.0.0.0`. El reenvío de
  localhost de WSL2 hace que cualquier proceso de Windows pueda alcanzarlo, así
  que el token no es opcional.
- El código de alta es corto, de un solo uso y acotado a los workspaces donde la
  persona puede inscribir. No se registra en logs ni se muestra en la línea de
  comandos de Windows.
- Las credenciales de los agentes viven en el distro. No se copian las de
  Windows, y la ventana ofrece el paso de login dentro de WSL.
- En organización aplica el mismo techo que el ADR de SSH: inscripción en la
  cuenta, vínculo explícito al workspace y token de miembro. Una conexión local
  sin plano de control no acepta tareas de organización.
- Cada usuario de Windows tiene sus propios distros. La máquina es de ese
  usuario, no del equipo.

## Límites y fallos conocidos

- **WSL 2 es el modo completo; WSL 1 es degradado.** WSL 1 no tiene systemd ni
  reenvío de localhost y cambia el comportamiento del FS, así que el servicio y
  el transporte local no aplican. Se detecta y se puede listar, pero el alta
  debe decirlo antes de instalar. Medido el 2026-11-03 en `vm-windows-shared`
  (EC2 sin virtualización anidada): WSL 2 falla con
  `HCS_E_HYPERV_NOT_INSTALLED` y la distro queda en WSL 1.
- **ARM64:** el motor de Linux tiene que existir para arm64; si el release no lo
  trae, se dice antes de instalar.
- **Red:** NAT o «mirrored» cambian cómo se ve `localhost`; el camino principal
  es el relay, así que la red de WSL no decide la arquitectura.
- **Reloj:** el reloj del distro puede desviarse tras suspender; los tokens
  cortos y TLS pueden fallar. La ventana vuelve a pedir token y lo trata como
  sesión vencida, no como error de la máquina.
- **Disco:** el VHDX del distro crece en el perfil de Windows y no se encoge
  solo. Conviene mostrar el uso, aunque sea informativo.
- **Antivirus:** escanear `\\wsl.localhost` es lento; otra razón para servir los
  archivos por el motor.
- **`wsl --shutdown`:** corta todo. No hay forma de despertar el distro desde
  otra máquina; sólo desde la ventana en ese equipo.

## Mapa de implementación

- `apps/desktop/src-tauri/src/extracted/wsl.rs` (nuevo): detección, ejecución
  con argv seguro, decodificación UTF-16LE, timeouts y cancelación.
- Una pantalla nueva en `src/features/machines/` y su estado local: pasos,
  errores y registro.
- `packages/computers/src/connect.ts`: reutilizar `watchNewComputer`; agregar el
  destino WSL y los hops nuevos, sin duplicar el sondeo.
- `packages/computers/src/machine.ts`: `kind`/`os`/`wakeable` para WSL.
- `packages/fleet`: `transport`/`local` en `MachineInfo` y el enlace local de la
  fase 2.
- `danil-labs/seldon-host`: modo no interactivo del instalador, unidad systemd y
  soporte arm64.
- `danil-labs/computers`: sin cambios de esquema más allá de lo que ya expone
  `kind`/`os`/`wakeable`; sí conviene exponer el transporte para la UI.

## Pruebas

- Unitarias: parser UTF-16LE de `wsl.exe`, armado de argv y stdin, detección de
  systemd, traducción de rutas y rechazo de `/mnt/c` por defecto.
- Integración en Windows 11 real: distro nuevo, instalación completa, sin
  systemd, relay caído, `wsl --shutdown` a mitad de turno, y distro ya conectado
  en otra ventana.
- En la ventana: crear una tarea en WSL, verla desde la web y el teléfono, y
  comprobar que al cerrar la ventana el turno sigue.

## Decisiones abiertas

- ¿Unidad de usuario con linger o unidad de sistema con `User=`? Preferencia:
  usuario + linger.
- ¿La tarea programada de arranque con Windows es opt-in por máquina o una
  preferencia global?
- ¿El respaldo local entra en la fase 1 o se deja para la fase 2? Preferencia:
  fase 2, con relay primero y un mensaje claro cuando no hay relay.
- ¿La detección corre al abrir Configuración o sólo al pulsar «Agregar WSL»?
  Preferencia: sólo al pulsar, para no arrancar distros sin querer.
- Nombre por omisión: `<equipo> (WSL: <distro>)`, editable.
