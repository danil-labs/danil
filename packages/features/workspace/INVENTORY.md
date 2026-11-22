# Inventario: workspace

Validez del contexto de trabajo del motor (id de workspace del engine, no la cuenta de tenancy). No mueve código.

| Archivo | Exports | Clase | Destino | Motivo |
|---|---|---|---|---|
| src/index.ts | createWorkspaceStore | propio | se queda | Entrada que usa shell: `packages/shell/src/app/App.tsx:66`, y lo construye en `App.tsx:358`. No llama red. |
| src/model.ts | — | propio | se queda | `export type *` de `queries/store.ts`, que no exporta tipos (solo `createWorkspaceStore`). El archivo no reexporta ningún nombre. Nadie lo importa (`grep`). Entrada vacía de model. Sin red. |
| src/queries.ts | createWorkspaceStore | propio | se queda | `export *` de `queries/store.ts`. El index no lo usa: salta a `queries/store.ts`. Entrada de queries. |
| src/queries/store.ts | createWorkspaceStore | propio | se queda | Store local de contexto (activo, modo, raíz, generación). Lo usa `App.tsx:66`. No llama `invoke`, `engine-client` ni `platform-client`. El comentario de la línea 3 dice que estos ids no son las cuentas de `HTTP /v1/workspaces`: este archivo no hace esa llamada. Sin otra feature. El test `apps/desktop/tests/unit/workspace-context.test.ts:4` apunta a `src/features/workspace/index.ts`, ruta que ya no existe. |

## Imports cruzados

Ningún import desde o hacia otra feature.

Shell compone el store en `App.tsx:66` (permitido).
