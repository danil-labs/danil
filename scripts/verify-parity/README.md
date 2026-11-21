# verify-parity · gate de paridad visual (R13 visual)

La app nueva es la app actual con otra arquitectura por dentro. Este gate lo comprueba con píxeles:
sirve `apps/desktop` (modo web, base `/`) y `apps/workspace` compiladas, con **el mismo borde simulado**
(`edge-fixtures.mjs`), en `es-MX` y tema oscuro, a 1280×800. Captura cada receta en las dos y compara con `pixelmatch`.

```bash
cd scripts/verify-parity && npm install          # una vez (Playwright, pixelmatch, pngjs)
node scripts/verify-parity/run.mjs               # todas las recetas
node scripts/verify-parity/run.mjs inicio        # una
PARITY_BUILD=1 node scripts/verify-parity/run.mjs   # recompila las dos apps antes
```

Sale 1 si una receta falla o pasa su umbral (2 % de píxeles por omisión, `threshold` en la receta).
Capturas y diff en `scripts/verify-parity/out/` (`<receta>-old.png`, `-new.png`, `-diff.png`).

## Recetas (`screens/<pantalla>.mjs`)

Cada escuadra de front es dueña de la receta de su pantalla. Exporta `{ old(page), new(page), threshold? }`:
los pasos que da la persona para llegar a la pantalla en cada app (clics por rol y nombre visible, los mismos en las dos).
Si la app nueva necesita otros pasos, no hay paridad de flujo: se arregla la app, no la receta.
Una ruta del borde que falte se agrega en `edge-fixtures.mjs`, igual para las dos.

**Recetas honestas (el runner las rechaza si no):** cada paso usa el nombre visible exacto (`{ name: "Máquinas", exact: true }`, nunca una regex que acepte otra cosa) y ningún paso se esconde con `.catch(() => {})`: si la app nueva no tiene el botón, la receta falla, y eso es falta de paridad. Umbral de color de `pixelmatch`: 0.05 (con 0.1 dos pantallas distintas en tema oscuro daban menos de 2 %).
