# @danil/feature-composer

## Qué hace
Estado reactivo y lógica de configuración de la caja de composición («¿Qué resolvemos?»).
Gestiona la selección del modo de permisos, modelos disponibles, superficies y opciones de comandos slash.

## Qué expone
Exporta desde `src/index.ts`:
- Store y configuración: `createComposerStore`, `ComposerConfiguration`.

## Qué consume
- SolidJS reactivo puro.
- `@danil/engine-client` (en `queries/store.ts`).
- `apps/desktop`.

## Qué contratos toca
- Rutas `/v1` del borde: ninguna.
- Comandos RPC1 del motor: `list_models`, `list_permission_modes`, `list_providers`, `list_slash_menu`, `list_surfaces`.

## Qué falta según la fase 2 del plan
- Fase 2.3: asegurar que toda llamada al motor viva en `queries.ts` (R12).
- Fase 2.4: componerse directamente en el compositor de `features/chat` mediante props/slots desde `shell` sin acoplamiento interno.
- Fuente y detalle: [INVENTORY.md](./INVENTORY.md).
