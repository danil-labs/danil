# @terminus/carry (solo reexporta)

Llevar trabajo entre máquinas se fundió en `packages/features/machines` (tarea 3.6c del plan
front-move): `src/model/carryTypes.ts`, `src/model/carryPlan.ts` y `src/queries/carryRun.ts`.
Lo que queda aquí existe solo porque `apps/mobile` está fuera del pnpm workspace y enlaza
`@terminus/carry` con `file:../../packages/carry`:

- `src/index.ts` reexporta esos tres archivos.

El paquete no es miembro del pnpm workspace (`!packages/carry` en `pnpm-workspace.yaml`).
Se borra cuando el teléfono importe esos archivos directamente.
Inventario original: [INVENTORY.md](./INVENTORY.md).
