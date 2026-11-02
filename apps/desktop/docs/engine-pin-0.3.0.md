# Pin del motor 0.3.0 (borrador)

Estado preparado el 2026-11-02 para `provider_handoff_v1`. **No hay release del
motor todavía**: este lock fija versión, commit y contrato, y deja vacíos el
nombre de la release, sus URLs y los SHA-256. **No se mergea ni se despliega en
este estado.**

## Qué está fijado

| Campo | Valor | Origen |
|---|---|---|
| `engine_version` | `0.3.0` | versión pedida |
| `commit` | `9e130e9b7907200ecb10034fea0bbc20d6369efb` | `seldon-host/dev`, merge de #311; commit de la release |
| `contract` | `5f59d6031b76b0248f09d7e19d184a542259d773c62080a30cb9298e7b5033ca` | `commands.json` de `9e130e9b`, confirmado |

`MOTOR_PENDIENTE` se retira de `scripts/guards/contract.mjs`: el lock ya habla
el contrato de la ventana y el guarda falla si la entrada sigue con él.

## Qué falta

- `release`, `manifest` y `terms`: el tag publicado y sus URLs.
- `platforms.*.url` y `platforms.*.sha256` de los cuatro targets.

Mientras estén vacíos, `scripts/engine.mjs` dice que no hay motor publicado para
la plataforma y se detiene; no inventa ni descarga nada. `pnpm verify` **falla**
en el paso del motor por eso, y es lo esperado en un borrador. El guarda
`contract` sí pasa.

### El commit de la release

El commit de la release es `9e130e9b7907200ecb10034fea0bbc20d6369efb` (merge
de seldon-host #311 en `dev`). Trae 0.3.0, `machines.danil.ai` en
`control_plane.rs`, `terminal.rs` y `remote-host.py`, y el contrato sigue en
`5f59d603…`.

No se compila desde `9d02329` (la rama del PR) ni desde `7aa96927` (no trae
`machines.danil.ai`); el motor se publica solo desde `dev` y el sello de
`build.rs` debe ser el merge. `ee736d02` tampoco sirve: todavía decía `0.2.73`.

El renombre «Danil Machines» / `dn machines` **no está en `9e130e9b`**. Si tenía
que viajar en el motor 0.3.0, este commit no lo cumple: habría que mergearlo
antes y compilar el `dev` posterior. El pin sigue el commit que dio la persona.

El comando de abajo escribe el `commit` y el `contract` que diga el manifiesto,
no uno a mano.

## Cómo se completa

Con la release publicada y `seldon-runtime.json` descargado:

```sh
T=seldon-runtime-v0.3.0-<7 del commit>
gh release download "$T" -R danil-labs/terminus -p seldon-runtime.json -D /tmp/pin
T="$T" node - <<'JS'
const fs = require("fs");
const tag = process.env.T;
const base = `https://github.com/danil-labs/terminus/releases/download/${tag}`;
const m = JSON.parse(fs.readFileSync("/tmp/pin/seldon-runtime.json", "utf8"));
const lock = {
  version: 1, name: "seldon-runtime", engine_version: m.version, commit: m.commit,
  release: tag, manifest: `${base}/seldon-runtime.json`, terms: `${base}/TERMS.md`,
  contract: m.contract, platforms: {},
};
for (const [target, p] of Object.entries(m.platforms))
  lock.platforms[target] = { url: p.url, sha256: p.sha256 };
fs.writeFileSync("apps/desktop/seldon-runtime.lock", JSON.stringify(lock, null, 2) + "\n");
JS
node scripts/guards/contract.mjs
git add apps/desktop/seldon-runtime.lock apps/desktop/scripts/guards/contract.mjs
git commit -s -m "chore(engine): fija seldon-runtime 0.3.0"
pnpm verify --remote --commit HEAD
```

`--remote` corre la cadena de Linux, **sin `--no-cargo`**, y nunca cuenta para
macOS ni Windows.

## Cuándo deja de ser borrador

- La release existe como *pre-release* con `--latest=false` y su
  `seldon-runtime.json.sig` de canal `dev`.
- El manifiesto sale de `9e130e9b` y su `contract` es el mismo que el
  `commands.json` copiado en la ventana.
- Cada binario bajado de la URL de su manifiesto da el SHA-256 del manifiesto.
- `pnpm verify --remote` sobre el commit del pin termina en verde, sin
  `SKIPPED` inesperados.
- El humo con el sidecar descargado está medido: traspaso, fila al reabrir,
  regreso con delta, `!` con traspaso pendiente, `no_budget` en 32k y motor
  viejo (0.2.73) sin error de contrato.

## Humo

En una máquina con pantalla, desde `apps/desktop`:

```sh
pnpm install
pnpm engine:download
pnpm window:build
pnpm engine:start
```

Después: cambiar de CLI en una tarea normal y confirmar; volver al CLI
anterior y comprobar el delta; ejecutar `!` con un traspaso pendiente; pedir el
traspaso a un modelo local de 32k (`no_budget`); y repetir con el binario
0.2.73 para ver que la función se esconde y la tarea abre.

## Rollback y apagado

- **Apagar la función:** volver el lock a `0.2.73` / `4e10efc` y restaurar
  `MOTOR_PENDIENTE`. Ese motor no anuncia `provider_handoff_v1` y los clientes
  esconden la función; el contrato no cambia.
- **Quitar la release:** borrar `seldon-runtime-v0.3.0-<commit>` o su
  `seldon-runtime.json.sig` hace que `engine_update` deje de ofrecerla (exige
  firma y canal `dev`). Una máquina ya actualizada no baja sola: se reinstala
  el 0.2.73 con el lock o con el `swap-release.sh` de la flota.
- **Probado:** nada de este pin. El rollback de flota se ejercitó en
  seldon-host #306, pero no con esta release.

## Lo que necesita el sí explícito

1. Publicar la release del motor desde `9e130e9b` (pre-release,
   `--latest=false`).
2. Mergear este pin a `dev` con los artefactos ya escritos.
3. Publicar escritorio: **fuera de esta entrega**.
