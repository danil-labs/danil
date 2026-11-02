# CLI de Danil: notas internas

Lo público está en [danil-cli.md](danil-cli.md). Aquí queda lo que sólo importa
a quien mantiene el cliente y el motor: identidades que no cambian, pin y
evidencia.

## Compatibilidad e integración del motor

La ventana conserva `productName: Terminus`, el binario físico `terminus`,
`ai.danil.terminus`, llavero, `engine.json`, candados, pubkey, updater y nombres
de descarga. Su forwarding es un mecanismo interno de distribución: no se
instala ni anuncia ese ejecutable físico como tercer comando operativo.
El binario físico del motor también permanece en su directorio privado.
Los instaladores del host no deben añadir un wrapper `seldon-runtime` al PATH;
la conexión usa `danil machines connect` y `danil machines status`, del motor
del PR seldon-host #276. El nombre del grupo `computers` está definido sólo en
`COMPUTERS` de `crates/terminus-cli/src/args.rs`.
Con una instalación en una ruta personalizada, pasa `--data` con la carpeta
de datos que muestra el instalador. Este helper no selecciona perfiles de
`engine.json`.
Cambiar la marca visible no mueve datos ni instala otra app.
Los paquetes internos `@terminus/*` también conservan sus nombres.

Se conservan los enlaces `terminus://task`, el historial `::terminus-visual`,
RPC, headers y selectores, storage móvil, esquema `terminus-mobile` y rutas
`/terminus`. Las referencias a Terminus 0.2.74 identifican la versión anterior.

La autoridad del contexto es el motor/CLI, no el launcher. El alcance autorizado
para el motor usa exclusivamente `DANIL_CONNECTION`, `DANIL_WORKSPACE`,
`DANIL_FOLDER`, `DANIL_TASK`, `DANIL_PROFILE`, `DANIL_CLI` y
`DANIL_CREDENTIAL`. El contexto antiguo `TERMINUS_*` se rechaza explícitamente,
incluso al combinarlo con banderas, para impedir que una tarea pierda su caller
y se ejecute como persona. Una carpeta vacía es distinta de una variable ausente.
El entorno de los procesos nuevos debe filtrar también los nombres antiguos.

**La reconciliación conserva el motor de `dev`, `4e10efc24a9be6f8dbf15559f767a50fb109a0a7`.**
El contrato, sus extensiones y el manifiesto se conservan byte por byte respecto
de `dev` (`35847bb732bcf9c3b74430e0143fbc1d4d33c32c`). Los launchers
no acreditan por sí solos la interfaz exclusiva `DANIL_*` del motor del PR
seldon-host #276, que permanece como integración separada. Su adopción requiere
revisión de contrato y artefactos con manifiesto y checksums para las cuatro
plataformas. Esta reconciliación no publica artefactos ni sustituye ese pin.
Se conserva la excepción explícita de `dev`: el cliente declara el contrato
`5f59d603`, mientras el motor fijado declara `93b1c32f`. El guard `contract`
registra `MOTOR_PENDIENTE`; abrir la ventana no acredita los comandos posteriores
al pin ni habilita una publicación.

## Evidencia y límites

Las pruebas del instalador usan directorios temporales y ejecutan su código
real. `cli-path` pasó 6/6 y `cli-forward` 2/2 en Linux; este último comprueba
las órdenes raíz del motor fijado y su checksum. La resolución local de npx
con el paquete de un solo bin mostró la ayuda del instalador sin instalar la app.
`pnpm verify` incluye ambas pruebas; `--no-cargo` no acredita Rust.
La evidencia del motor de compatibilidad anterior no acredita la nueva interfaz
exclusiva. Esta fase requiere sus propias pruebas de autoridad y aislamiento.
Los nombres Windows se comprueban también desde Linux, pero cmd, PowerShell y
Git Bash requieren ejecución nativa. Actualización instalada, firma y reemplazo
de ejecutables en uso requieren su propio recorrido. No se deducen de guards
ni de pruebas de frontend con IPC simulado.

## Adopción del motor de #276

Mover el pin a un motor con `computers` y `DANIL_*` exige, en el mismo PR:
`orchestratorSnippets.ts` con `DANIL_CREDENTIAL`, aviso para reescribir las
configuraciones MCP guardadas, `vm` fuera de `COMMANDS` en `src-tauri/src/cli.rs`,
reservar `DANIL_TASK` y `DANIL_CONNECTION` como nombres de secreto, migrar
`danil-workspace` y comprobar el contrato de cada host con
`remote-host.py run <host> -- status --json`. Detalle en la nota de proyecto
`danil-cli-final-delta-review.md`.

`COMMANDS` ya incluye `computers` y `harness` para que un launcher sobre el
ejecutable físico no abra la ventana; con el pin actual ambos terminan en el error
del motor. Esa rutina sigue sin comprobarse con el motor nuevo.

Los ejemplos de la guía pública se ejecutaron con `seldon-runtime` SHA-256
`22863f0d4456ed53…` de seldon-host `2d6520b`, Linux x86_64, enlazado como `danil`
y `dn`, con `env -i`. `connect` real corre en `e2e-host-install.py` de seldon-host.
