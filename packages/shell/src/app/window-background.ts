import { createEffect, on, type Accessor } from "solid-js";
import { VELO_DE_FONDO } from "../../../ui/src/lib/chat-background";
import { fondoDeChat, imagenDelWorkspace, veloDeFondo } from "../../../../apps/desktop/src/lib/chat-background-store";
import { createChatBackground } from "../../../features/chat/src";
import type { machineOf as T_machineOf } from "../../../features/machines/src/queries/store";

export type WindowBackgroundDeps = {
  fondoDelAgente: Accessor<{ url: string; veil?: number } | null>;
  machineOf: typeof T_machineOf;
  workspaceActivo: Accessor<string | null>;
};

export function createWindowBackground(deps: WindowBackgroundDeps) {
  const { fondoDelAgente, machineOf, workspaceActivo } = deps;

  /* La imagen propia del fondo global, leída como `data:` URI: la
     política de la ventana no deja pintar un `file://`. Sin imagen —o si
     no se puede leer— la sección cae al atardecer. El fondo propio de un
     agente se pinta encima, dentro de su chat. */
  const { fondoPropioUrl } = createChatBackground({ machineOf });

  /* El fondo, la imagen y los velos son del workspace: su motor los recuerda
     y se leen al abrirlo, aquí y en la web. */
  createEffect(on(workspaceActivo, (workspace) => void import("../../../../apps/desktop/src/lib/chat-background-engine").then((m) => m.cargarFondoDelWorkspace(workspace))));

  /* El fondo de Estilo cubre la ventana entera, detrás de las columnas de
     vidrio (`.glass-panel`): así se ve también tras el historial, el árbol y
     las barras. Cada chat solo pinta encima el fondo propio de su agente. */
  const imagenDeVentana = () =>
    fondoDelAgente()?.url ?? (fondoDeChat() === "propia" ? (imagenDelWorkspace() ?? fondoPropioUrl()) : null) ?? null;
  const veloDeVentana = () => (fondoDelAgente() ? (fondoDelAgente()?.veil ?? VELO_DE_FONDO) : veloDeFondo());

  return { fondoPropioUrl, imagenDeVentana, veloDeVentana };
}
