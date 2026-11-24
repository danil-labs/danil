import Monitor from "lucide-solid/icons/monitor";
import Moon from "lucide-solid/icons/moon";
import Sun from "lucide-solid/icons/sun";
import { type Component } from "solid-js";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import type { AgentProfile, AgenteDeMaquina } from "../../../../ui/src/lib/model";
import { FONDOS, type FondoDeChat } from "../../../../ui/src/lib/chat-background";
import { type Apariencia, type DarkStyle, type LightStyle } from "../../../../ui/src/lib/theme";

/** Guardar en el workspace va en su propio trozo: la carga inicial solo pinta. */
export const motor = () => import("../../../../../apps/desktop/src/lib/chat-background-engine");

export const IMAGES = ["png", "jpg", "jpeg", "webp"];

export const VISIBILITY_ID = "settings-appearance-background-visibility";

export const TABS_VEIL_ID = "settings-appearance-tabs-veil";

export const PANELS_VEIL_ID = "settings-appearance-panels-veil";

export const temas = (): { id: Apariencia; Icono: Component<{ size?: number }>; label: string }[] => [
  { id: "sistema", Icono: Monitor, label: t("settings.appearance.theme.system") },
  { id: "claro", Icono: Sun, label: t("settings.appearance.theme.light") },
  { id: "oscuro", Icono: Moon, label: t("settings.appearance.theme.dark") },
];

export const darkStyles = (): { id: DarkStyle; label: string }[] => [
  { id: "graphite", label: t("settings.appearance.dark_style.graphite") },
  { id: "navy", label: t("settings.appearance.dark_style.navy") },
];

export const lightStyles = (): { id: LightStyle; label: string }[] => [
  { id: "violet", label: t("settings.appearance.light_style.violet") },
  { id: "graphite", label: t("settings.appearance.light_style.graphite") },
];

export const fondos = (): { id: FondoDeChat; label: string }[] =>
  FONDOS.map((id) => ({ id, label: t(`settings.appearance.background.${id}`) }));

export type Fila = {
  id: string;
  name: string;
  project: string | null;
  profile: AgentProfile;
};

export function proyectoDe(
  abierto: string,
  scope: AgenteDeMaquina["agent"]["own_scope"],
  folders: string[],
): string | null {
  if (scope?.kind === "project") return scope.id;
  return folders[0] || abierto || null;
}

export function filaDe(name: string, profile: AgentProfile, project: string | null, id: string): Fila {
  return { id, name, project, profile };
}
