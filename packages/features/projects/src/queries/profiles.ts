import { invoke } from "@tauri-apps/api/core";
import { createSignal, onCleanup } from "solid-js";
import type { AgentProfile } from "../../../../../apps/desktop/src/lib/model";

type Entry = {
  profiles: () => Record<string, AgentProfile>;
  setProfiles: (p: Record<string, AgentProfile>) => void;
  refs: number;
};
const cache = new Map<string, Entry>();
let listening = false;

/** El perfil de quien todavía no eligió nada: la cara sale del nombre. */
export const DEFAULT_PROFILE: AgentProfile = {
  display_name: null,
  body: null,
  background: null,
  avatar: null,
  veil: 0.82,
  provider: null,
  model: null,
  effort: null,
  hidden: false,
};

async function reload(project: string) {
  const entry = cache.get(project);
  if (!entry) return;
  try {
    entry.setProfiles(
      await invoke<Record<string, AgentProfile>>("list_agent_profiles", { project }),
    );
  } catch {
    // Una lectura fallida deja el último perfil conocido: mejor una cara vieja
    // que devolver la del hash mientras se guardaba otra.
  }
}

function ensureListener() {
  if (listening) return;
  listening = true;
  window.addEventListener("harness:profiles", () => {
    for (const project of cache.keys()) void reload(project);
  });
}

/**
 * La apariencia de los encargados de un proyecto. Cuatro vistas miran la misma
 * y comparten una sola lectura: sin el recuento de referencias, cerrar una
 * dejaría a las otras sin recarga.
 */
export function watchProfiles(project: string) {
  ensureListener();
  let entry = cache.get(project);
  if (!entry) {
    const [profiles, setProfiles] = createSignal<Record<string, AgentProfile>>({});
    entry = { profiles, setProfiles, refs: 0 };
    cache.set(project, entry);
    void reload(project);
  }
  entry.refs++;
  const held = entry;
  onCleanup(() => {
    held.refs--;
    if (held.refs <= 0) cache.delete(project);
  });
  return entry.profiles;
}

/** Cómo se nombra a un encargado en la interfaz; la clave sigue siendo `name`. */
export const displayName = (name: string, profile?: AgentProfile) =>
  profile?.display_name?.trim() || name;

/** Que todas las vistas relean la apariencia que se acaba de guardar. */
export function notifyProfiles() {
  window.dispatchEvent(new CustomEvent("harness:profiles"));
}
