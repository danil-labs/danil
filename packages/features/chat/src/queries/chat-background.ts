import { fondoPropio } from "../../../../ui/src/lib/chat-background-store";
import { callEngine } from "../../../../engine-client/src/client.ts";
import { createResource } from "solid-js";
import type { Preview } from "../../../../ui/src/lib/preview.ts";


/** Lo que el bloque usaba del cuerpo de App. */
export type ChatBackgroundDeps = { machineOf: (id: string | null | undefined) => { headers: { "x-terminus-machine": string; }; } | undefined; };

/** Movido tal cual de packages/shell/src/app/App.tsx (líneas 6630–6637, tarea 2.5). Lo que usaba del cuerpo de App llega por `deps`. */
export function createChatBackground(deps: ChatBackgroundDeps) {
  const { machineOf } = deps;
  const [fondoPropioUrl] = createResource(fondoPropio, async (ruta) => {
    if (!ruta) return null;
    try {
      return (await callEngine<Preview>("preview_file", { path: ruta, rel: ruta }, machineOf(ruta))).data_url;
    } catch {
      return null;
    }
  });
  return { fondoPropioUrl };
}
