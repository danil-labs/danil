# Pin del motor 0.3.0

Estado final, 2026-11-02. El lock fija `provider_handoff_v1` con la release
publicada. El motor se compiló desde `seldon-host/dev` `af7a663b`, con las tres
puertas que faltaban: `machines.danil.ai` por omisión (#311), el renombre
«Danil Machines» / `dn machines` (#315) y la compilación en macOS (#316).

## Qué está fijado

| Campo | Valor | Origen |
|---|---|---|
| `engine_version` | `0.3.0` | `Cargo.toml` del motor |
| `commit` | `af7a663b5525760bdb2dd58d7618a66d62a392a1` | `seldon-host/dev`, merge de #316 |
| `contract` | `5f59d6031b76b0248f09d7e19d184a542259d773c62080a30cb9298e7b5033ca` | `commands.json` de `af7a663b`, byte a byte el mismo que el de la ventana |
| `release` | `seldon-runtime-v0.3.0-af7a663` | pre-release, `--latest=false`, canal `dev` |
| `manifest` | `…/download/seldon-runtime-v0.3.0-af7a663/seldon-runtime.json` | con `seldon-runtime.json.sig` |
| `terms` | `…/download/seldon-runtime-v0.3.0-af7a663/TERMS.md` | copiado de la release anterior; no cambia |

Las URLs y los SHA-256 de los cuatro targets salen del manifiesto publicado, no
se escribieron a mano.

## El commit de la release

`af7a663b` es el merge de seldon-host #316 en `dev`. Su historia reciente:

- **#311** — `machines.danil.ai` por omisión en `control_plane.rs`,
  `terminal.rs` y `remote-host.py`.
- **#315** — el grupo público del CLI pasa a `machines` (`danil machines`,
  `dn machines`); `computers` queda como alias oculto. No toca `commands.json`.
- **#316** — `env_secrets::inherited` compila fuera de Linux. Sin esto el motor
  no compilaba en macOS desde `44bc5882` (E0425 en `native_driver.rs:529`).

El sello de `build.rs` en los cuatro binarios es `af7a663b…-extraction-source-96dba061`,
sin `-dirty`.

## Comprobaciones

| Target | Sello | SHA-256 del manifiesto |
|---|---|---|
| `x86_64-unknown-linux-gnu` | sí | `d5a6fffbb994ef7a2afe1ead5ad997e9694bec83561cefb766e665f3e33ef1f8` |
| `aarch64-apple-darwin` | sí | `c3ac692ee4c1ac2ad64ea7aa25ea031dd8ea49dad7a468e0ad26ceda7858c496` |
| `x86_64-apple-darwin` | sí | `0df2ce237e73fe5b37428fd60d6aed6a9bcb29e1ef51a33ec13fc6269b25792a` |
| `x86_64-pc-windows-msvc` | sí | `b04fb9f4da4ba8855805e57692e1e265022cf750c9f9ab8168894f85893b5320` |

- **Linux** (`ubuntu:22.04`, GLIBC 2.34): `e2e-provider-handoff` **36/36** y
  `e2e-existing-runtime` **382/382**.
- **macOS arm64**: `e2e-existing-runtime` pasa **380** comprobaciones y se
  detiene en la que escribe una llave en el llavero; la sesión SSH no puede
  usar el llavero de la persona (`A default keychain could not be found`). El
  E2E de traspaso no arrancó por lo mismo. **No es un fallo del binario**; falta
  correr los dos en una Terminal de la sesión gráfica.
- **Windows** (`vm-windows-shared`, MSVC, sin Authenticode): `e2e-existing-runtime`
  pasa **496** comprobaciones y se detiene en la bóveda por lo mismo
  (`ERROR_NO_SUCH_LOGON_SESSION`): una sesión SSH con contraseña no tiene
  credenciales del Administrador de credenciales.
- **Descarga y SHA-256**: los cuatro binarios bajados de la URL de su manifiesto
  dan el hash del manifiesto.
- **Firma**: `seldon-runtime.json.sig` verificada contra
  `scripts/remote-host/linux/release-keys/seldon-release-2026-10.pem`; se firmó
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
- **Quitar la release:** borrar `seldon-runtime-v0.3.0-af7a663` o su
  `seldon-runtime.json.sig` hace que `engine_update` deje de ofrecerla (exige
  firma y canal `dev`). Una máquina ya actualizada no baja sola: se reinstala
  el 0.2.73 con el lock o con el `swap-release.sh` de la flota.
- **Probado:** nada de esto con esta release. El rollback de flota se ejercitó
  en seldon-host #306, pero no aquí.
