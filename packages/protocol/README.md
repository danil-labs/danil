# @terminus/protocol (solo reexporta)

Los comandos y tipos del motor se fundieron en `packages/engine-client` (tarea 3.6c del plan
front-move). Lo que queda aquí existe solo porque `apps/mobile` está fuera del pnpm
workspace y enlaza `@terminus/protocol` con `file:../../packages/protocol`:

- `src/index.ts` reexporta `packages/engine-client/src/index.ts`.

El paquete no es miembro del pnpm workspace (`!packages/protocol` en `pnpm-workspace.yaml`).
Se borra cuando el teléfono importe `packages/engine-client/src/index.ts` directamente.
Inventario original: [INVENTORY.md](./INVENTORY.md).
