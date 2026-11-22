// Solo para apps/mobile, que está fuera del pnpm workspace y enlaza `@terminus/chat`
// con `file:`. El código vive en packages/ui/src/lib/chat y packages/engine-client/src
// (tarea 3.6d); se borra cuando el teléfono importe esos archivos directamente.
export * from "../../engine-client/src/history.ts";
export * from "../../engine-client/src/historyDetail.ts";
export * from "../../ui/src/lib/chat/command.ts";
export * from "../../ui/src/lib/chat/inlineVisual.ts";
export * from "../../ui/src/lib/chat/links.ts";
export * from "../../ui/src/lib/chat/nextSteps.ts";
export * from "../../ui/src/lib/chat/sandbox.ts";
export * from "../../ui/src/lib/chat/slash.ts";
export * from "../../ui/src/lib/chat/steps.ts";
export * from "../../ui/src/lib/chat/table.ts";
export * from "../../ui/src/lib/chat/tools.ts";
export * from "../../ui/src/lib/chat/visual.ts";
