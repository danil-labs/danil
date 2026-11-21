# Inventario: tabs

Capa visual de arrastrar una pestaña y el diálogo de cierre con cambios sin guardar. El estado de las pestañas sigue en shell. No mueve código.

| Archivo | Exports | Clase | Destino | Motivo |
|---|---|---|---|---|
| src/index.ts | DragOverlay, UnsavedCloseDialog | propio | se queda | Entrada que usa shell: `packages/shell/src/app/App.tsx:181`. No llama red. |
| src/model.ts | — | propio | se queda | `export {}`. Ni `index.ts` ni nadie más lo importa (`grep`). Es la entrada vacía de model que pide la estructura. Sin red. |
| src/queries.ts | — | propio | se queda | `export {}`. Nadie lo importa. No hay queries: estos componentes no llaman a un cliente. |
| src/components/DragOverlay.tsx | DragOverlay | propio | se queda | Fantasma y marca de split al arrastrar una pestaña. Solo lo importa `App.tsx:181` vía el index. Tipos de `apps/desktop/src/lib/panels` y `pointer-drag`. Sin red y sin otra feature. |
| src/components/UnsavedCloseDialog.tsx | UnsavedCloseDialog | propio | se queda | Diálogo cancelar, descartar o guardar. Solo lo importa `App.tsx:181`. Usa `Button` y `Dialog` de `packages/ui`. Las claves i18n dicen `projects.tabs.unsaved.*`, pero el componente no importa `features/projects`. Sin red. |

## Imports cruzados

Ningún import desde o hacia otra feature.

Shell compone los dos componentes en `App.tsx:181` (permitido).
