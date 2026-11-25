import Plus from "lucide-solid/icons/plus";
import { createEffect, createSignal, For, type JSX, on, onCleanup, onMount, Show } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import { isNoMachines, machineAvailability } from "../../../../host/src/platform";
import { t } from "../../../../ui/src/lib/i18n";
import { deleteAgent, listMachineAgents } from "../queries/engine-agents";
import type { AgenteDeMaquina, CatalogoDeAgentes } from "../../../../ui/src/lib/model";
import { Badge } from "../../../../ui/src/Badge";
import { Button } from "../../../../ui/src/Button";
import { Dialog, DialogContent, DialogTitle } from "../../../../ui/src/Dialog";
import { EmptyState } from "../../../../ui/src/EmptyState";
import { prosaDe } from "../../../../ui/src/Failure";
import type { ModelChoices } from "../../../../ui/src/lib/model-choices";
import { createFreeRouterConsent } from "./free-router-consent";
import type { PiezasDeAjustes } from "../model/features-port";
import { MachineRequiredState } from "./MachineRequiredNotice";
import { SettingsPanel, SettingsRow, SettingsSection } from "../../../../ui/src/SettingsLayout";

export default function Agents(props: {
  modelos: ModelChoices;
  piezas: PiezasDeAjustes;
  proyecto: string;
  onAgentProfile?: (project: string, name: string) => void;
  after?: JSX.Element;
}) {
  const { AstroAvatar, NewAgent, displayName, notifyProfiles } = props.piezas;
  const [agents, setAgents] = createStore<(AgenteDeMaquina & { id: string })[]>([]);
  const [ready, setReady] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [creating, setCreating] = createSignal(false);
  const [deleting, setDeleting] = createSignal<AgenteDeMaquina | null>(null);
  const [busy, setBusy] = createSignal(false);
  let generation = 0;
  async function refresh() {
    const current = ++generation;
    if (isNoMachines()) {
      setAgents(reconcile([], { key: "id" }));
      setError(null);
      setReady(true);
      return;
    }
    try {
      const catalog = await listMachineAgents<CatalogoDeAgentes>();
      if (current !== generation) return;
      setAgents(reconcile(catalog.own.filter((row) => row.agent.own_scope?.kind === "workspace").map(row => ({ ...row, id: row.agent.name })), { key: "id" }));
      setError(null);
    } catch (e) { if (current === generation && !isNoMachines()) setError(prosaDe(e)); }
    finally { if (current === generation) setReady(true); }
  }
  onMount(() => {
    void refresh();
    const reload = () => { void refresh(); };
    for (const event of ["harness:encargados", "harness:profiles", "harness:workspace"]) window.addEventListener(event, reload);
    onCleanup(() => {
      generation++;
      for (const event of ["harness:encargados", "harness:profiles", "harness:workspace"]) window.removeEventListener(event, reload);
    });
  });
  let lastAvailability = machineAvailability().kind;
  createEffect(on(() => machineAvailability().kind, (kind) => {
    const prev = lastAvailability;
    lastAvailability = kind;
    if (kind === prev) return;
    if (kind === "no_machines") {
      setAgents(reconcile([], { key: "id" }));
      setError(null);
      setReady(true);
      return;
    }
    if (prev === "no_machines" && (kind === "ready" || kind === "offline")) void refresh();
  }, { defer: true }));
  async function remove() {
    const row = deleting();
    if (!row || row.agent.package === "business" || busy()) return;
    setBusy(true);
    try {
      await deleteAgent({ project: "", name: row.agent.name });
      setDeleting(null);
      notifyProfiles();
      window.dispatchEvent(new Event("harness:encargados"));
      await refresh();
    } catch (e) { setError(prosaDe(e)); }
    finally { setBusy(false); }
  }
  return <SettingsPanel>
    <SettingsSection aria-labelledby="agents-own" title={<span id="agents-own">{t("settings.agents.own_title")}</span>} aside={
      <Show when={!isNoMachines()}>
        <Button variant="secondary" size="sm" onClick={() => setCreating(true)}><Plus size={14} />{t("settings.agents.new")}</Button>
      </Show>
    }>
      <Show when={!isNoMachines()} fallback={<MachineRequiredState />}>
      <Show when={error()}>{message => <p role="alert" class="text-caption text-error-strong">{message()}</p>}</Show>
      <Show when={ready() && !agents.length && !error()}><EmptyState title={t("settings.agents.own_empty")} /></Show>
      <div role="list">
        <For each={agents}>{row => <SettingsRow role="listitem"
          lead={<AstroAvatar name={row.agent.name} body={row.profile.body} avatar={row.profile.avatar} status="awake" size={36} />}
          label={
            <span class="flex min-w-0 items-center gap-2">
              <span class="truncate">{displayName(row.agent.name, row.profile)}</span>
              <Show when={row.agent.managed}>
                <Badge tone="info" class="shrink-0">{t("settings.scope.organization")}</Badge>
              </Show>
            </span>
          }
          description={row.agent.package === "business" ? t("settings.agents.business") : row.agent.description}>
          <Button variant="secondary" size="sm" onClick={() => props.onAgentProfile?.("", row.agent.name)}>{t("settings.agents.open_profile")}</Button>
          <Show when={row.agent.package !== "business" && !row.agent.managed}>
            <Button variant="ghost" size="compact" onClick={() => { setError(null); setDeleting(row); }}>{t("projects.agents.profile_delete")}</Button>
          </Show>
        </SettingsRow>}</For>
      </div>
      </Show>
    </SettingsSection>
    <NewAgent abierto={creating()} onAbrir={setCreating} project="" workspaceOnly modelos={props.modelos} createFreeRouterConsent={createFreeRouterConsent} onCreado={() => { void refresh(); }} />
    <Dialog open={deleting() !== null} onOpenChange={open => { if (!open && !busy()) setDeleting(null); }}>
      <Show when={deleting()}>{row => <DialogContent role="alertdialog" aria-describedby="delete-workspace-agent">
        <DialogTitle>{t("projects.agents.profile_delete_title", { name: displayName(row().agent.name, row().profile) })}</DialogTitle>
        <p id="delete-workspace-agent" class="text-ui text-neutral-500">{t("projects.agents.profile_delete_what")}</p>
        <Show when={error()}>{message => <p role="alert" class="text-caption text-error-strong">{message()}</p>}</Show>
        <div class="flex justify-end gap-2">
          <Button variant="secondary" disabled={busy()} onClick={() => setDeleting(null)}>{t("projects.agents.profile_delete_cancel")}</Button>
          <Button disabled={busy()} onClick={() => void remove()}>{t("projects.agents.profile_delete_confirm")}</Button>
        </div>
      </DialogContent>}</Show>
    </Dialog>
    {props.after}
  </SettingsPanel>;
}
