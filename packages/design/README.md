# @terminus/design (solo reexporta)

Los tokens, marcas, palabras y temas se fundieron en `packages/ui` (tarea 3.6a del plan
front-move). Lo que queda aquí existe solo porque `apps/mobile` está fuera del pnpm
workspace y enlaza `@terminus/design` con `file:../../packages/design`:

- `src/index.ts` reexporta `packages/ui/src/index.ts`.
- `src/toolMarksData.ts` reexporta `packages/ui/src/toolMarksData.ts`.

El paquete no es miembro del pnpm workspace (`!packages/design` en `pnpm-workspace.yaml`).
Se borra cuando el teléfono importe `packages/ui/src/index.ts` directamente.
Inventario original: [INVENTORY.md](./INVENTORY.md).
