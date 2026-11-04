# Pin del motor 0.3.0

Estado final, 2026-11-02. El lock fija `provider_handoff_v1` con la release
publicada. El motor se compiló desde `seldon-host/dev` `3bac20da`, con las cuatro
puertas que faltaban: `machines.danil.ai` por omisión (#311), el renombre
«Danil Machines» / `dn machines` (#315), la compilación en macOS (#316) y las
herramientas incluidas de la línea 0.2.73 (#317).

## Qué está fijado

| Campo | Valor | Origen |
|---|---|---|
| `engine_version` | `0.3.0` | `Cargo.toml` del motor |
| `commit` | `3bac20da7586ad89b6dd8bcf5c95cbb24d165a18` | `seldon-host/dev`, merge de #317 |
| `contract` | `5f59d6031b76b0248f09d7e19d184a542259d773c62080a30cb9298e7b5033ca` | `commands.json` de `3bac20da`, byte a byte el mismo que el de la ventana |
| `release` | `seldon-runtime-v0.3.0-3bac20da` | pre-release, `--latest=false`, canal `dev` |
| `manifest` | `…/download/seldon-runtime-v0.3.0-3bac20da/seldon-runtime.json` | con `seldon-runtime.json.sig` |
| `terms` | `…/download/seldon-runtime-v0.3.0-3bac20da/TERMS.md` | copiado de la release anterior; no cambia |

Las URLs y los SHA-256 de los cuatro targets salen del manifiesto publicado, no
se escribieron a mano.

## El commit de la release

`3bac20da` es el merge de seldon-host #317 en `dev`. Su historia reciente:

- **#311** — `machines.danil.ai` por omisión en `control_plane.rs`,
  `terminal.rs` y `remote-host.py`.
- **#315** — el grupo público del CLI pasa a `machines` (`danil machines`,
  `dn machines`); `computers` queda como alias oculto. No toca `commands.json`.
- **#316** — `env_secrets::inherited` compila fuera de Linux. Sin esto el motor
  no compilaba en macOS desde `44bc5882` (E0425 en `native_driver.rs:529`).
- **#317** — vuelven a `dev` los 32 commits de las herramientas incluidas que
  solo vivían en la línea de la 0.2.73 (`environment/work_tools.rs`,
  `shell_path.rs`, las instantáneas inmutables y los instaladores con recursos).
  Sin ellos la preparación volvía a exigir Node y npm y la verificación del
  AppImage fallaba con `Packaged tools did not prepare independently of
  Node/npm`.

El sello de `build.rs` en los cuatro binarios es
`3bac20da…-extraction-source-96dba061`, sin `-dirty`.

## Comprobaciones

| Target | Sello | SHA-256 del manifiesto |
|---|---|---|
| `x86_64-unknown-linux-gnu` | sí | `0f983173529c14b151de23aebbcdec9a1359c06cf71bb22ac554987c1ca7a264` |
| `aarch64-apple-darwin` | sí | `6063e71721f24a26b54534b0c0077a2962501ce9c3e285f4fdc18a90182099a4` |
| `x86_64-apple-darwin` | sí | `66d993f3b6f5a03ac6493d6d4380c97920adc6abbab1c82ac8a69b70530089e8` |
| `x86_64-pc-windows-msvc` | sí | `4bd73a657d30ec68a26ece5ea593a3f52ab54490905b65a283c83b8fd12d61e1` |

- **Linux** (`ubuntu:22.04`, GLIBC 2.34): `e2e-provider-handoff` **36/36** y
  `e2e-existing-runtime` **382/382**.
- **macOS arm64**: el binario compila y su sello es correcto; la suite E2E se
  detiene en el paso que escribe una llave en el llavero (`A default keychain
  could not be found`), porque una sesión SSH no está en la sesión de seguridad
  de la persona.
- **Windows** (`vm-windows-shared`, MSVC, sin Authenticode): sello correcto; la
  suite se detiene en la bóveda (`ERROR_NO_SUCH_LOGON_SESSION`) por la misma
  razón: SSH con contraseña no tiene credenciales del Administrador de
  credenciales.
- **Descarga y SHA-256**: los cuatro binarios bajados de la URL de su manifiesto
  dan el hash del manifiesto.
- **Firma**: `seldon-runtime.json.sig` verificada contra
  `release-keys/seldon-release-2026-10.pem` del repositorio privado del motor; se firmó
  en `vm-linux-shared` con el rol `seldon-release-signer`.
- `node apps/desktop/scripts/guards/contract.mjs` → verde.

## Humo pendiente

En una máquina con pantalla, desde `apps/desktop`:

```sh
pnpm install
pnpm engine:download
pnpm window:build
pnpm engine:start
```

Recorrido: cambiar de CLI en una tarea normal y confirmar; volver al CLI anterior
y comprobar el delta; ejecutar `!` con un traspaso pendiente; pedir el traspaso a
un modelo local de 32k (`no_budget`); y repetir con el binario 0.2.73 para ver
que la función se esconde y la tarea abre.

## Rollback y apagado

- **Apagar la función:** volver el lock a `0.2.73` / `4e10efc` y restaurar
  `MOTOR_PENDIENTE`. Ese motor no anuncia `provider_handoff_v1` y los clientes
  esconden la función; el contrato no cambia.
- **Quitar la release:** borrar `seldon-runtime-v0.3.0-3bac20da` o su
  `seldon-runtime.json.sig` hace que `engine_update` deje de ofrecerla (exige
  firma y canal `dev`). Una máquina ya actualizada no baja sola: se reinstala
  el 0.2.73 con el lock o con el `swap-release.sh` de la flota.
- **La pre-release `seldon-runtime-v0.3.0-af7a663` hay que borrarla:** se publicó
  antes de recuperar las herramientas incluidas y está firmada como canal `dev`.
  Un agente no puede borrar releases; lo hace la persona desde GitHub.
- **Probado:** nada de esto con esta release. El rollback de flota se ejercitó
  en seldon-host #306, pero no aquí.
