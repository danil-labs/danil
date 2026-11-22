# @terminus/chat (solo reexporta)

Los lectores de mensajes se fundieron en otros paquetes (tarea 3.6d del plan front-move):

- `packages/ui/src/lib/chat/`: `command`, `inlineVisual`, `links`, `nextSteps`, `sandbox` (con `sandbox-runtime`),
  `slash`, `steps`, `table`, `tools` y `visual`. Sus pruebas están en `packages/ui/test/`.
- `packages/engine-client/src/`: `history` e `historyDetail` (dependen de los tipos de
  `types.ts`, en el mismo paquete). Su prueba está en `packages/engine-client/test/`.

Lo que queda aquí existe solo porque `apps/mobile` está fuera del pnpm workspace y enlaza
`@terminus/chat` con `file:../../packages/chat`: `src/index.ts` reexporta esos archivos.

El paquete no es miembro del pnpm workspace (`!packages/chat` en `pnpm-workspace.yaml`).
Se borra cuando el teléfono importe esos archivos directamente.
Inventario original: [INVENTORY.md](./INVENTORY.md).
