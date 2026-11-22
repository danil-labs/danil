# @danil/shell

## Qué hace
Orquestador y marco estructural de la aplicación Danil.
Gestiona el arranque lineal con sesión (`Launcher`, `SessionGate`), composición de layout mediante slots, enrutamiento básico y riel vertical de navegación.

## Qué expone
Exporta desde `src/shell/index.ts`:
- Estado de retorno y sesión: `accountReturn`, `sealFirstFreeWorkspace`, `noteFirstLoginSignedIn`.
- Componentes de arranque y diálogo: `Lanzador` (`Launcher`), `MoveWorkspaceDialog`, `SessionGate`, `WindowControls`, `WorkspaceMarks`.

## Qué consume
- Compone los componentes y pantallas de las features (`@danil/features/*`).
- `@danil/platform-client`, `@danil/engine-client`, `@danil/ui`, `@danil/session`, `@danil/host`.
- Paquetes legados en proceso de retiro (`@terminus/*`).

## Qué contratos toca
- Rutas `/v1` del borde: rutas de identidad y workspaces vía `platform-client`.
- Comandos RPC1 del motor: `sleep_session`, `set_active_workspace`, `list_live_turns`, `tray_update`, `window_to_background`, `quit_completely`, `adoption_candidates`, `adoption_proof`, etc.

## Qué falta según la fase 2 del plan
- Fase 2.4: mover componentes de riel a `features/workspaces` (`OrganizationStack`, `AddWorkspaceMenu`, etc.) y componentes de cuenta a `features/account`.
- Fase 2.5: refactorizar `src/app/App.tsx` para que exclusivamente componga mediante slots y reduzca sus líneas de 7.775 a menos de 300.
- Fuente y detalle: [INVENTORY.md](./INVENTORY.md).
