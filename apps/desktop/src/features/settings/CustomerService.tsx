import ExternalLink from "lucide-solid/icons/external-link";
import { t } from "../../lib/i18n";
import { invoke } from "../../lib/invoke.ts";
import { capabilities } from "../../lib/platform";
import { Button } from "../../ui/Button";
import { SettingsPanel, SettingsRow, SettingsSection } from "./layout";

const WEB_URL = "https://alfa-app.danil.ai";

/** Aquí todavía no hay sesión con la que leer la atención a clientes: lo dice y lleva a la web. */
function Unavailable(props: { rows: string[] }) {
  const open = () => {
    if (capabilities().nativeWindow) void invoke("open_external", { target: WEB_URL }).catch(() => {});
    else window.open(WEB_URL, "_blank", "noopener,noreferrer");
  };
  return (
    <SettingsSection
      data-customers-unavailable=""
      title={t("settings.customers.title")}
      description={t("settings.customers.unavailable")}
      aside={
        <Button size="sm" variant="secondary" onClick={open}>
          {t("settings.customers.open_web")}
          <ExternalLink size={13} />
        </Button>
      }
    >
      {props.rows.map((row) => <SettingsRow label={row} />)}
    </SettingsSection>
  );
}

export function CustomerAgents(props: { workspace: () => string | null }) {
  const inbox = capabilities().inbox;
  return inbox ? inbox.customerAgents(props.workspace) : <Unavailable rows={[]} />;
}

export function CustomerConnections(props: { workspace: () => string | null }) {
  const inbox = capabilities().inbox;
  if (inbox) return inbox.customerConnections(props.workspace);
  return (
    <SettingsPanel>
      <Unavailable rows={[t("web.alpha.channels_title"), t("web.service.http_tools"), t("web.service.variables")]} />
    </SettingsPanel>
  );
}
