import MessageSquare from "lucide-solid/icons/message-square";
import { onCleanup, type Accessor } from "solid-js";
import { t } from "../../../ui/src/lib/i18n";
import { pluginTabId } from "../../../ui/src/lib/tabs";
import { registerRailSection } from "./rail-layout";

export const MESSAGING_PLUGIN_ID = "messaging";
export const MESSAGING_RAIL_SECTION_ID = "plugin:messaging";

const DEFAULT_MESSAGING_URL = "https://messaging.danil.ai";
const ALLOWED_MESSAGING_ORIGINS = new Set([
  "https://messaging.danil.ai",
  "https://messaging-staging.danil.ai",
]);

function resolveMessagingUrl(): string {
  const configured = (import.meta.env?.VITE_DANIL_MESSAGING_URL as string | undefined)?.trim();
  if (!configured) return DEFAULT_MESSAGING_URL;
  try {
    const parsed = new URL(configured);
    if (ALLOWED_MESSAGING_ORIGINS.has(parsed.origin)) return parsed.toString();
  } catch {
    // URL inválida en variable de entorno: vuelve al origen oficial.
  }
  return DEFAULT_MESSAGING_URL;
}

export const MESSAGING_PLUGIN_URL = resolveMessagingUrl();

/**
 * Registra en el riel izquierdo (y en «Organizar barra lateral») los accesos
 * directos de plugins integrados en pestaña.
 */
export function registerBuiltInRailPlugins(deps: {
  openPlugin: (plugin: { pluginId: string; titulo: string; url: string }) => void;
  activeTabId: Accessor<string | null>;
}) {
  const messagingTabId = pluginTabId(MESSAGING_PLUGIN_ID);
  const disposeMessaging = registerRailSection({
    id: MESSAGING_RAIL_SECTION_ID,
    label: () => t("shell.rail.messaging"),
    defaultOrder: 5,
    defaultVisible: true,
    hideable: true,
    source: "plugin",
    kind: "button",
    renderIcon: () => <MessageSquare size={15} aria-hidden="true" />,
    isActive: () => deps.activeTabId() === messagingTabId,
    onActivate: () =>
      deps.openPlugin({
        pluginId: MESSAGING_PLUGIN_ID,
        titulo: t("shell.rail.messaging"),
        url: MESSAGING_PLUGIN_URL,
      }),
  });

  onCleanup(() => {
    disposeMessaging();
  });
}
