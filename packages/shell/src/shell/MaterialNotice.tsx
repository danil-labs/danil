import { onCleanup, onMount } from "solid-js";
import { callShellViewEngine } from "../../../session/src/shell-view-queries.ts";

/**
 * Sincronización silenciosa en segundo plano del contexto del workspace.
 * La interfaz de fuentes secundarias fue retirada; este componente no pinta avisos.
 */
const PRIMERA = 60 * 1000;
const CADA = 15 * 60 * 1000;

export default function AvisoDeMaterial() {
  function syncSilently() {
    if (document.visibilityState !== "visible") return;
    void callShellViewEngine("sync_workspace_context", { force: false }).catch(() => {});
  }

  onMount(() => {
    const primera = setTimeout(() => syncSilently(), PRIMERA);
    const cada = setInterval(() => syncSilently(), CADA);
    const alVolver = () => {
      if (document.visibilityState === "visible") syncSilently();
    };
    document.addEventListener("visibilitychange", alVolver);
    const alEmpezar = () => syncSilently();
    window.addEventListener("harness:tarea-nueva", alEmpezar);
    onCleanup(() => {
      clearTimeout(primera);
      clearInterval(cada);
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener("harness:tarea-nueva", alEmpezar);
    });
  });

  return null;
}
