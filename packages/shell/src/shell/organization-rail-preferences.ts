import { getCurrentWindow } from "@tauri-apps/api/window";
import { createSignal } from "solid-js";
import { capabilities } from "../../../host/src/platform";
import { escribirPref, leerPref } from "../../../session/src/prefs";
import { changeOrgPreference, parseOrgPreference } from "./organization-rail-model";

function windowKey() {
  if (capabilities().nativeWindow) { try { return getCurrentWindow().label; } catch { return "main"; } }
  try { const key = "danil.rail.window"; const id = sessionStorage.getItem(key) ?? crypto.randomUUID(); sessionStorage.setItem(key, id); return id; } catch { return "main"; }
}
export function organizationRailPreferences() {
  const key = `rail.organizations.${windowKey()}`;
  const [preference, setPreference] = createSignal(parseOrgPreference(leerPref(key, null)));
  const stored = leerPref<unknown>(`${key}.used`, null);
  const used: Record<string, number> = Object.fromEntries(stored && typeof stored === "object" && !Array.isArray(stored) ? Object.entries(stored).filter(([, value]) => typeof value === "number" && Number.isFinite(value) && value >= 0) : []);
  return {
    preference, used,
    use: (org: string) => { used[org] = Date.now(); escribirPref(`${key}.used`, used); },
    change: (ids: readonly string[], org: string, action: "pin" | "up" | "down") => { const next = changeOrgPreference(preference(), ids, org, action); setPreference(next); escribirPref(key, next); },
  };
}
