# @danil/feature-sites

## Qué hace
Integración y gestión de sitios web externos dentro del espacio de trabajo.
Controla el renderizado en vistas web/iframes, navegación, recarga y visibilidad de sitios vinculados a proyectos o tareas.

## Qué expone
Exporta desde `src/index.ts`:
- Pantalla y componentes: `Site` / `Sitio`.
- Reexporta modelos y queries: `model.ts`, `queries.ts`.

## Qué consume
- `@danil/engine-client`, `@danil/ui`, `apps/desktop`.

## Qué contratos toca
- Rutas `/v1` del borde: ninguna.
- Comandos RPC1 del motor: `site_close`, `site_go`, `site_hide`, `site_navigate`, `site_open`, `site_open_external`, `site_place`, `site_reload`.

## Qué falta según la fase 2 del plan
- Fase 2.3: centralizar comandos `site_*` en `queries.ts` (R12).
- Fase 2.4: montarse vía slot de vista desde `shell` sin acoplamiento a otras pantallas.
- Fuente y detalle: [INVENTORY.md](./INVENTORY.md).
