# @danil/shell

Shell de aplicación que orquesta la composición de features, riel de navegación y enrutamiento principal de Danil (Web y Desktop).

## Principios y reglas

- **Regla R3 (Único punto de composición)**: `packages/shell/src/routes.tsx` es el único archivo del shell que importa paquetes `@danil/feature-*`. Ningún otro componente interno (Layout, Rail, router) accede directamente a las features.
- **Borde `/v1`**: Todas las pantallas consumen exclusivamente las APIs del borde `/v1` provistas por `@danil/platform-client` o el motor mediante sus queries y contratos.
- **Estilos del sistema**: No se introducen estilos en línea con colores hexadecimales arbitrarios; se respetan las clases y variables del sistema (`@danil/ui` y `global.css`).

## Riel de navegación

El riel (`Layout.tsx`) aloja la navegación global dentro de un `RailErrorBoundary`:
- **Espacios de trabajo**: Monta `RailGroups` de `@danil/feature-workspaces` vía el slot `RailSlot` exportado por `routes.tsx`. Muestra la agrupación por plan («Personal», «Team», «Enterprise») y el botón «+» que abre `CreateWorkspaceDialog`.
- **Navegación fija**: Mantiene los accesos fijos a Máquinas (`/machines`) y Cuenta (`/account`).

## Rutas y composición de pantallas

| Ruta | Feature montada | Origen de datos | Estado |
|---|---|---|---|
| `machines` (`/machines`) | `MachinesScreen` (`@danil/feature-machines`) | `GET /v1/machines` vía `useMachines()` | Activa |
| `workspace/:id` (`/workspace/:id`) | Vista con pestañas (`Tabs` de `@danil/ui`) componiendo pantallas de espacio: | — | Activa |
| ↳ Pestaña **Proyectos** | `ProjectsScreen` (`@danil/feature-projects`) | `useProjects()` pasando `workspaceId` y conexión de máquina | Activa |
| ↳ Pestaña **Chat** | `ChatScreen` (`@danil/feature-chat`) | `useSessionHistory()` y stream de turnos de agente con `sessionId` / `workspaceId` | Activa |
| ↳ Pestaña **Archivos** | `FilesScreen` (`@danil/feature-files`) | `useTree()` y lector de archivos pasando `workspaceId` | Activa |
| ↳ Pestaña **Terminal** | `TerminalScreen` (`@danil/feature-terminal`) | Pendiente: `@danil/feature-terminal` no exporta aún pantalla en su índice; monta `PlaceholderScreen` | Pendiente |
| `ai-credentials` (`/ai-credentials`) | `AiCredentialsScreen` (`@danil/feature-ai-credentials`) | `useWorkspaceAccounts()` y `useProviders()` con el `workspaceId` activo | Activa |
| `account` (`/account`) | `AccountScreen` (`@danil/feature-account`) | Pendiente: `@danil/feature-account` no exporta aún pantalla en su índice; monta `PlaceholderScreen` | Pendiente |
