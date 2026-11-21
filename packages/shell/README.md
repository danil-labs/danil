# @danil/shell

Shell de aplicación que orquesta la composición de features, riel de navegación y enrutamiento principal de Danil (Web y Desktop).

## Principios y reglas

- **Regla R3 (Único punto de composición)**: `packages/shell/src/routes.tsx` es el único archivo del shell que importa paquetes `@danil/feature-*`. Ningún otro componente interno (Layout, Rail, router) accede directamente a las features.
- **Carga diferida (Lazy Loading)**: Todas las pantallas de ruta y pestañas se cargan de forma diferida mediante `lazy(() => import(...))` con imports con nombre y contratos de props tipados estrictamente (sin `any`, sin `getFeatureScreen` dinámico y sin pantallas de reemplazo `PlaceholderScreen`).
- **Conexión única de máquina**: `WorkspaceScreen` resuelve la máquina asociada al workspace y obtiene su `MachineConnection` vía `useMachines().connect`, pasando esta conexión tipada única a las cuatro pantallas que interactúan con el motor (`ProjectsScreen`, `ChatScreen`, `FilesScreen` y `TerminalScreen`).
- **Estado de vista del Workspace**: La sesión de chat se enlaza reactivamente a la tarea seleccionada en la pestaña Proyectos (`selectedTaskId`), proveyendo `sessionId` y `project` reales al agente en lugar del id del workspace.
- **Borde `/v1`**: Todas las pantallas consumen exclusivamente las APIs del borde `/v1` provistas por `@danil/platform-client` o el motor mediante sus queries y contratos.
- **Estilos del sistema**: No se introducen estilos en línea con colores hexadecimales arbitrarios; se respetan las clases y variables del sistema (`@danil/ui` y `global.css`).

## Riel de navegación

El riel (`Layout.tsx`) aloja la navegación global dentro de un `RailErrorBoundary`:
- **Espacios de trabajo**: Monta `RailGroups` de `@danil/feature-workspaces` vía el slot `RailSlot` exportado por `routes.tsx`. Muestra la agrupación por plan («Personal», «Team», «Enterprise») y el botón «+» que abre el selector de agregar workspace.
- **Navegación fija**: Mantiene los accesos fijos a Máquinas (`/machines`) y Cuenta (`/account`).

## Rutas y composición de pantallas

| Ruta | Feature montada | Origen de datos y conexión | Estado |
|---|---|---|---|
| `machines` (`/machines`) | `MachinesScreen` (`@danil/feature-machines`) | `GET /v1/machines` vía `useMachines()` | Activa |
| `workspace/:id` (`/workspace/:id`) | Vista con pestañas (`Tabs` de `@danil/ui`) componiendo pantallas de espacio: | — | Activa |
| ↳ Pestaña **Proyectos** | `ProjectsScreen` (`@danil/feature-projects`) | `useProjects()` pasando `workspaceId` y `conn: MachineConnection` único; emite selección de tarea | Activa |
| ↳ Pestaña **Chat** | `ChatScreen` (`@danil/feature-chat`) | Historial y stream de turnos conectado al motor con `sessionId` de la tarea seleccionada en Proyectos | Activa |
| ↳ Pestaña **Archivos** | `FilesScreen` (`@danil/feature-files`) | `useTree()` y lector de archivos pasando `conn: MachineConnection` del espacio | Activa |
| ↳ Pestaña **Terminal** | `TerminalScreen` (`@danil/feature-terminal`) | Consola interactiva PTY por RPC1 (`useShell`) pasando `conn: MachineConnection` | Activa |
| `ai-credentials` (`/ai-credentials`) | `AiCredentialsScreen` (`@danil/feature-ai-credentials`) | `useWorkspaceAccounts()` y `useProviders()` con el `workspaceId` activo | Activa |
| `account` (`/account`) | `AccountScreen` (`@danil/feature-account`) | Perfil de usuario y enlaces externos a facturación y harness vía `useProfile()` | Activa |
