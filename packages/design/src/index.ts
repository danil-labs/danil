// Solo para apps/mobile, que está fuera del pnpm workspace y enlaza `@terminus/design`
// con `file:`. Los tokens viven en packages/ui (tarea 3.6a); se borra cuando el teléfono
// importe packages/ui/src/index.ts directamente.
export * from "../../ui/src/index.ts";
