import { invoke } from "../../lib/invoke.ts";
import { semillaDelAlta, t } from "../../lib/i18n";
import { sealFirstFreeWorkspace } from "../shell";

/** Le pone la lengua elegida en el alta y lo activa: lo que se conecte después cuelga del activo. */
async function activar(id: string) {
  // "sistema" no se guarda: un workspace sin lengua es el que sigue al sistema.
  const semilla = semillaDelAlta();
  if (semilla !== "sistema") await invoke("set_workspace_language", { id, lengua: semilla });
  await invoke("set_active_workspace", { id });
  window.dispatchEvent(new CustomEvent("harness:workspace"));
}

/** Crea un workspace local y lo activa. Solo el alta de la web; la ventana nunca crea locales (F1.2). */
export async function crearWorkspace(nombre: string) {
  const w = await invoke<{ id: string }>("add_workspace", { name: nombre });
  await activar(w.id);
  return w;
}

/** El primer arranque de la ventana: entra al workspace de la organización personal Free, sin crear uno local. */
export async function entrarAlWorkspaceFree(): Promise<{ id: string; nombre: string }> {
  const w = await sealFirstFreeWorkspace(invoke);
  await activar(w.id);
  return { id: w.id, nombre: w.name };
}

/** Antigravity lleva también Gemini, que es como más se le conoce. */
export const nombreDeAgente = (a: { id: string; label: string }) => {
  if (a.id === "antigravity") return t("onboarding.agent.antigravity");
  return a.label;
};
