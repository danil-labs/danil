import Plus from "lucide-solid/icons/plus";
import { createSignal, For, type JSX, onCleanup, onMount, Show } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import { t } from "../../lib/i18n";
import { invoke } from "../../lib/invoke.ts";
import type { AgenteDeMaquina, CatalogoDeAgentes } from "../../lib/model";
import { Button } from "../../ui/Button";
import { Dialog, DialogContent, DialogTitle } from "../../ui/Dialog";
import { EmptyState } from "../../ui/EmptyState";
import { prosaDe } from "../../ui/Failure";
import { AstroAvatar } from "../projects/AstroAvatar";
import NewAgent, { type ModelChoices } from "../projects/NewAgent";
import { displayName, notifyProfiles } from "../projects/profiles";
import { SettingsPanel, SettingsRow, SettingsSection } from "./layout";

export default function Agents(props: {
  modelos: ModelChoices;
  proyecto: string;
  onAgentProfile?: (project: string, name: string) => void;
  after?: JSX.Element;
}) {
  const [agents, setAgents] = createStore<(AgenteDeMaquina & { id: string })[]>([]);
  const [ready, setReady] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [creating, setCreating] = createSignal(false);
  const [deleting, setDeleting] = createSignal<AgenteDeMaquina | null>(null);
  const [busy, setBusy] = createSignal(false);
  let generation = 0;
  async function refresh() {
    const current = ++generation;
    try {
      const catalog = await invoke<CatalogoDeAgentes>("list_machine_agents");
      if (current !== generation) return;
      setAgents(reconcile(catalog.own.filter((row) => row.agent.own_scope?.kind === "workspace").map(row => ({ ...row, id: row.agent.name })), { key: "id" }));
      setError(null);
    } catch (e) { if (current === generation) setError(prosaDe(e)); }
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
  async function remove() {
    const row = deleting();
    if (!row || row.agent.package === "business" || busy()) return;
    setBusy(true);
    try {
      await invoke("delete_agent", { project: "", name: row.agent.name });
      setDeleting(null);
      notifyProfiles();
      window.dispatchEvent(new Event("harness:encargados"));
      await refresh();
    } catch (e) { setError(prosaDe(e)); }
    finally { setBusy(false); }
  }
  return <SettingsPanel>
    <SettingsSection aria-labelledby="agents-own" title={<span id="agents-own">{t("settings.agents.own_title")}</span>} aside={
      <Button variant="secondary" size="sm" onClick={() => setCreating(true)}><Plus size={14} />{t("settings.agents.new")}</Button>
    }>
      <Show when={error()}>{message => <p role="alert" class="text-caption text-error-strong">{message()}</p>}</Show>
      <Show when={ready() && !agents.length && !error()}><EmptyState title={t("settings.agents.own_empty")} /></Show>
      <div role="list">
        <For each={agents}>{row => <SettingsRow role="listitem"
          lead={<AstroAvatar name={row.agent.name} body={row.profile.body} avatar={row.profile.avatar} status="awake" size={36} />}
          label={displayName(row.agent.name, row.profile)}
          description={row.agent.package === "business" ? t("settings.agents.business") : row.agent.description}>
          <Button variant="secondary" size="sm" onClick={() => props.onAgentProfile?.("", row.agent.name)}>{t("settings.agents.open_profile")}</Button>
          <Show when={row.agent.package !== "business" && !row.agent.managed}>
            <Button variant="ghost" size="compact" onClick={() => { setError(null); setDeleting(row); }}>{t("projects.agents.profile_delete")}</Button>
          </Show>
        </SettingsRow>}</For>
      </div>
    </SettingsSection>
    <NewAgent abierto={creating()} onAbrir={setCreating} project="" workspaceOnly modelos={props.modelos} onCreado={() => { void refresh(); }} />
    <Dialog open={deleting() !== null} onOpenChange={open => { if (!open && !busy()) setDeleting(null); }}>
      <Show when={deleting()}>{row => <DialogContent role="alertdialog" aria-describedby="delete-workspace-agent">
        <DialogTitle>{t("projects.agents.profile_delete_title", { name: displayName(row().agent.name, row().profile) })}</DialogTitle>
        <p id="delete-workspace-agent" class="text-ui text-neutral-600">{t("projects.agents.profile_delete_what")}</p>
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
