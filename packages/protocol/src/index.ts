// Solo para apps/mobile, que está fuera del pnpm workspace y enlaza `@terminus/protocol`
// con `file:`. El protocolo vive en packages/engine-client (tarea 3.6c); se borra cuando el
// teléfono importe packages/engine-client/src/index.ts directamente.
export * from "../../engine-client/src/index.ts";
