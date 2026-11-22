import { invoke } from "../../../../engine-client/src/client.ts";
import { semillaDelAlta, t } from "../../../../../apps/desktop/src/lib/i18n";
import type { SellarWorkspaceFree } from "../model/shell-port";
/** Activa el workspace con la lengua del alta. La ventana entra al Free (F1.2); `add_workspace` solo en la web. */
async function activar(w: { id: string; name: string }) {
  const semilla = semillaDelAlta(); // "sistema" no se guarda: sin lengua sigue al sistema.
  if (semilla !== "sistema") await invoke("set_workspace_language", { id: w.id, lengua: semilla });
  await invoke("set_active_workspace", { id: w.id });
  window.dispatchEvent(new CustomEvent("harness:workspace"));
  return { ...w, nombre: w.name };
}
export const crearWorkspace = async (name: string) => activar({ ...(await invoke<{ id: string }>("add_workspace", { name })), name });
export const entrarAlWorkspaceFree = async (sealFirstFreeWorkspace: SellarWorkspaceFree) => activar(await sealFirstFreeWorkspace(invoke));
export const renombrarWorkspace = (id: string, name: string) =>
  invoke("rename_workspace", { id, name });

/** Antigravity lleva también Gemini, que es como más se le conoce. */
export const nombreDeAgente = (a: { id: string; label: string }) => {
  if (a.id === "antigravity") return t("onboarding.agent.antigravity");
  return a.label;
};
