// Solo para apps/mobile, que está fuera del pnpm workspace y enlaza `@terminus/tasks`
// con `file:`. La lista, la tarjeta y el dock viven en packages/ui/src/lib (tarea 3.6b); se
// borra cuando el teléfono importe packages/ui/src/lib/tasks.ts directamente.
export * from "../../ui/src/lib/tasks.ts";
