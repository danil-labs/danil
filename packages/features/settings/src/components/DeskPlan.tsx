import { createSignal, onCleanup, onMount, Show } from "solid-js";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { openExternal } from "../queries/engine-open";
import { capabilities } from "../../../../host/src/platform";
import { Button } from "../../../../ui/src/Button";
import type { SesionesDeAjustes } from "../model/sessions-port";
import { SettingsPanel } from "../../../../ui/src/SettingsLayout";

const webOrigin = import.meta.env.VITE_DANIL_WEB_ORIGIN || "https://beta.danil.ai";

export default function DeskPlan(props: { workspace: string | null; sesiones: SesionesDeAjustes }) {
  const { sessionRailState } = props.sesiones;
  const [organization, setOrganization] = createSignal<string>();
  const [failed, setFailed] = createSignal(false);
  const activeOrganization = () => {
    const groups = sessionRailState()?.groups();
    if (!groups) return organization();
    return groups.find(group => props.workspace && (group.added?.has(props.workspace) ||
      group.available?.some(row => row.id === props.workspace)))?.org ?? (groups.length === 1 ? groups[0].org : undefined);
  };
  let unsubscribe: (() => void) | undefined;
  let closed = false;
  onMount(async () => {
    if (sessionRailState()?.groups()?.length) return;
    try {
      const selection = await capabilities().organizations?.();
      if (!selection || closed) return;
      const update = () => {
        const current = selection.state();
        setOrganization(current.kind === "ready" && !current.busy ? current.active ?? undefined : undefined);
      };
      unsubscribe = selection.subscribe(update);
      update();
      if (selection.state().kind !== "ready") await selection.load();
    } catch { if (!closed) setFailed(true); }
  });
  onCleanup(() => { closed = true; unsubscribe?.(); });
  async function open() {
    const org = activeOrganization();
    if (!org) return;
    const url = new URL("/billing", webOrigin);
    url.search = new URLSearchParams({ org, return: "desk" }).toString();
    setFailed(false);
    try { await openExternal({ target: url.href }); }
    catch { setFailed(true); }
  }
  return <SettingsPanel>
    <div><Button disabled={!activeOrganization()} onClick={() => void open()}>{t("settings.billing.upgrade_plan")}</Button></div>
    <Show when={failed()}><p role="alert">{t("settings.billing.unavailable")}</p></Show>
  </SettingsPanel>;
}
