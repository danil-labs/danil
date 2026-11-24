import type { BrowserHost } from "./transport";

export const browser: BrowserHost = {
  openUrl: url => void window.open(url, "_blank", "noopener,noreferrer"), confirm: message => window.confirm(message),
  alert: message => window.alert(message), reload: () => window.location.reload(),
  writeText: text => navigator.clipboard.writeText(text), readText: () => navigator.clipboard.readText(),
};

export { takeSettingsParam } from "./settings-link";
