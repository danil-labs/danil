# Pin del motor 0.3.0 (borrador)

Estado preparado el 2026-11-02 para `provider_handoff_v1`. **No hay release del
motor todavía**: este lock fija versión, commit y contrato, y deja vacíos el
nombre de la release, sus URLs y los SHA-256. **No se mergea ni se despliega en
este estado.**

## Qué está fijado

| Campo | Valor | Origen |
|---|---|---|
| `engine_version` | `0.3.0` | versión pedida |
| `commit` | `ee736d02cd2baabac906997d0f24e0e929a0afa7` | `seldon-host/dev` |
| `contract` | `5f59d6031b76b0248f09d7e19d184a542259d773c62080a30cb9298e7b5033ca` | `commands.json` copiado |

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

`ee736d02` trae `0.2.73` en `Cargo.toml`, y el motor reporta
`CARGO_PKG_VERSION`. Para publicar 0.3.0 con un binario que diga 0.3.0 hace
falta mergear el bump de `seldon-host` y compilar ese commit. En ese caso el
`commit` del lock será el del bump, no `ee736d02`; se escribe desde el
manifiesto, no a mano.

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

1. Mergear el bump de versión del motor a `dev` (o publicar 0.3.0 sin bump,
   aceptando que el binario diga 0.2.73).
2. Publicar la release del motor (pre-release, `--latest=false`).
3. Mergear este pin a `dev`.
4. Publicar escritorio: **fuera de esta entrega**.
