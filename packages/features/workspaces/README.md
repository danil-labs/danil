# @danil/feature-workspaces

Feature de navegación por riel y gestión de workspaces (DS1 v2).

## Qué hace

- **Riel DS1 v2 (`RailGroups`):** Pinta el riel agrupado verticalmente por plan con logo y desplegable hacia abajo.
- **Nombres de plan (B-008):** Usa exclusivamente nombres de plan («Personal», «Team», «Enterprise») y nunca términos de agrupación interna.
- **Selección atómica (B-007):** Primero actualiza la plataforma; si falla, el estado local no cambia. Si tiene éxito, notifica al motor e impacta la señal local.
- **Manejo de errores y estado vacío (B-006):** Los fallos de red se presentan con vista de error y botón de reintento, nunca como listas vacías.
- **Creación de workspaces:** Flujo accesible desde el botón «+» («Agregar workspace»).

## Qué consume

- `@danil/platform-client`: llamadas HTTPS sobre el borde `/v1`.
- `@danil/engine-client`: sincronización con el motor local.
- `@danil/session`: sesiones activas del usuario (en web una cookie; en Desk lista de sesiones).

## Contrato consumido

### Operaciones del OpenAPI (`platform-client`)

- `getOrganizations` (`GET /identity/organizations`)
- `selectOrganization` (`POST /identity/organizations/select`)
- `getWorkspaces` (`GET /workspaces`)
- `createWorkspace` (`POST /workspaces`)
- `selectWorkspace` (`POST /workspaces/select`)

### Comandos RPC1 (`engine-client`)

- `set_active_workspace`: fija el workspace gobernante en el motor local al confirmar la selección en la plataforma.

## Estructura

- `src/index.ts`: única entrada pública para el shell.
- `src/queries.ts`: único punto de interacción con `platform-client` y `engine-client` mediante hooks Solid (`createResource`, `createSignal`).
- `src/model.ts`: tipos de vista derivados de los clientes generados.
- `src/components/`: componentes visuales (`RailGroups`, `WorkspaceItem`, `CreateWorkspaceDialog`, `WorkspaceErrorView`, `WorkspaceEmptyView`).
- `src/screens/`: pantallas exportadas (`WorkspacesScreen`, `WorkspacePickerModal`).
