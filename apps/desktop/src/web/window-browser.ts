import type { BrowserHost } from "./transport";

export const browser: BrowserHost = {
  openUrl: url => void window.open(url, "_blank", "noopener,noreferrer"), confirm: message => window.confirm(message),
  alert: message => window.alert(message), reload: () => window.location.reload(),
  writeText: text => navigator.clipboard.writeText(text), readText: () => navigator.clipboard.readText(),
};

/** Paneles que se abren desde la URL (`?settings=`); el parámetro sale de la barra al leerlo. */
const LINKED_SETTINGS = ["cuenta-danil", "emails", "business", "fiscal"];

export function takeSettingsParam(): string | undefined {
  const params = new URLSearchParams(window.location.search);
  const wanted = params.get("settings");
  if (wanted === null) return undefined;
  params.delete("settings");
  const rest = params.toString();
  window.history.replaceState(null, "", `${window.location.pathname}${rest ? `?${rest}` : ""}${window.location.hash}`);
  return LINKED_SETTINGS.includes(wanted) ? wanted : undefined;
}

