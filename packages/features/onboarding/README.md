# @danil/feature-onboarding

## Qué hace
Flujo de bienvenida y configuración inicial de Danil.
Guía la conexión de cuenta Danil, elección y consentimiento de proveedores de IA y vinculación con la máquina local o remota.

## Qué expone
Exporta desde `src/index.ts`:
- Pantallas y componentes: `Setup`, `ConnectAI`, `ConnectAccount`, `CabeceraDelAlta`.

## Qué consume
- `@danil/engine-client`, `@danil/ui`, `features/settings`, `apps/desktop`.

## Qué contratos toca
- Rutas `/v1` del borde: ninguna directa.
- Comandos RPC1 del motor: `check_environment`, `install_tool`, `list_dependencies`, `open_external`, `restart_app`, etc.

## Qué falta según la fase 2 del plan
- Fase 2.4: eliminar 52 imports cruzados hacia `features/settings` (`Prepare`, `Repair`, `ConnectAI`); los diálogos se proveen mediante slots desde `shell` (R3).
- Fuente y detalle: [INVENTORY.md](./INVENTORY.md).
