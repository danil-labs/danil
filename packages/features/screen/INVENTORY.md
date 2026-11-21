# Inventario: screen

Visor VNC de la pantalla de una máquina. No mueve código.

| Archivo | Exports | Clase | Destino | Motivo |
|---|---|---|---|---|
| src/index.ts | screenInput, Phase, screenConnection, Screen | propio | se queda | Entrada. Shell no la usa: `packages/shell/src/app/App.tsx:92` hace `lazy()` de `screens/Screen`. Sin red en el barrel. |
| src/model.ts | screenInput | propio | se queda | `export *` de `model/input.ts`. `novnc.d.ts` no se reexporta (es un `declare module`). Lo reexporta `index.ts`. |
| src/queries.ts | Phase, screenConnection | propio | se queda | `export *` de `queries/connection.ts`. Lo reexporta `index.ts`. |
| src/model/input.ts | screenInput | propio | se queda | Suelta teclas y el botón del mouse antes de que noVNC pierda el foco. Solo lo usa `screens/Screen.tsx:6`. Sin red y sin otra feature. |
| src/model/novnc.d.ts | — | propio | se queda | `declare module "@novnc/novnc"` con la clase `RFB`. No exporta símbolos del archivo: solo da tipos al `import("@novnc/novnc")` de `screens/Screen.tsx:24`. No es el cliente de red. |
| src/screens/Screen.tsx | default | propio | se queda | Pantalla. La monta `App.tsx:92`. El `WebSocket` lo abre el prop `open` (shell / host); esta pantalla no llama `engine-client` ni `platform-client`. Línea 1: `SCREEN_CONTROL_DESKTOP` de `@terminus/computers` (paquete viejo, tarea 1.9). Carga `@novnc/novnc` (24). El helper `apps/desktop/tests/helpers/screen-control/main.tsx:2` apunta a `src/features/screen/Screen`, ruta que ya no existe. |
| src/queries/connection.ts | Phase, screenConnection | propio | se queda | Dueño del socket y del visor RFB. Lo usa `screens/Screen.tsx:5`. Línea 1: `screenEnd` y `ScreenEnd` de `@terminus/computers`. El `open` del socket llega por argumento. No hay `fetch`, `platform-client` ni `/v1/computers`. El test `apps/desktop/tests/unit/screen-connection.test.ts:3` apunta a `src/features/screen/connection.ts`, ruta que ya no existe. |

## Imports cruzados

Ningún import desde o hacia otra feature.

Paquete viejo (no es feature):

- `src/screens/Screen.tsx:1` → `@terminus/computers` (`SCREEN_CONTROL_DESKTOP`). En su lugar: la constante la trae el cliente que la tarea 1.9 deje en lugar de `packages/computers`, inyectada por shell. Esta pantalla no importa ese paquete.
- `src/queries/connection.ts:1` → `@terminus/computers` (`screenEnd`, `ScreenEnd`). En su lugar: el cierre del socket se clasifica en el cliente de pantalla, no en `packages/computers`.

Shell compone la pantalla en `App.tsx:92` (permitido).
