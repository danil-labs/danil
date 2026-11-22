# @terminus/tasks (solo reexporta)

La lista plana, el filtro y la agrupación, la tarjeta de dos líneas, el dock de agentes y los
ids de agente se fundieron en `packages/ui/src/lib/tasks/`
(tarea 3.6b del plan front-move); sus pruebas están en `packages/ui/test/tasks/`. Lo que queda aquí
existe solo porque `apps/mobile` está fuera del pnpm workspace y enlaza `@terminus/tasks` con
`file:../../packages/tasks`:

- `src/index.ts` reexporta `packages/ui/src/lib/tasks/index.ts`.

Se borra cuando el teléfono importe `packages/ui/src/lib/tasks/index.ts` directamente.
