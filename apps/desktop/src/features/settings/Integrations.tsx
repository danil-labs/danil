import { listen } from "../../lib/serviceEvents";
import ChartColumn from "lucide-solid/icons/chart-column";
import FileText from "lucide-solid/icons/file-text";
import FileType from "lucide-solid/icons/file-type";
import MousePointerClick from "lucide-solid/icons/mouse-pointer-click";
import Workflow from "lucide-solid/icons/workflow";
import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { Dynamic } from "solid-js/web";
import { mb } from "../../lib/format";
import { t } from "../../lib/i18n";
import { invoke } from "../../lib/invoke.ts";
import { isMac } from "../../lib/window";
import { Button } from "../../ui/Button";
import { Dialog, DialogContent, DialogTitle } from "../../ui/Dialog";
import { asFailure, type Failure, FailureNote } from "../../ui/Failure";
import { Toggle } from "../../ui/Toggle";
import { SettingsRow, SettingsSection } from "./layout";

type Plugin = "agentsview" | "libreoffice" | "drawio" | "computer-use" | "typst";
type IntegrationStatus = {
  id: Plugin;
  installed: boolean;
  installing: boolean;
  enabled: boolean;
  version: string | null;
  latest: string;
  update_available: boolean;
  bytes: number | null;
  supported: boolean;
};
type Catalog = { workspace: string; plugins: IntegrationStatus[] };
type Readiness = {
  id: Plugin;
  ready: boolean;
  accessibility?: boolean;
  screen_recording?: boolean;
  reset_command?: string | null;
};
type Operation = "install" | "update" | "enable" | "uninstall" | "check";

const ICONOS = {
  agentsview: ChartColumn,
  drawio: Workflow,
  libreoffice: FileText,
  "computer-use": MousePointerClick,
  typst: FileType,
} as const;

function label(id: Plugin) {
  if (id === "agentsview") return t("settings.integrations.agentsview.name");
  if (id === "drawio") return t("settings.integrations.drawio.name");
  if (id === "computer-use") return t("settings.integrations.computer_use.name");
  if (id === "typst") return t("settings.integrations.typst.name");
  return t("settings.integrations.libreoffice.name");
}

function description(id: Plugin) {
  if (id === "agentsview") return t("settings.integrations.agentsview.description");
  if (id === "drawio") return t("settings.integrations.drawio.description");
  if (id === "computer-use") return t("settings.integrations.computer_use.description");
  if (id === "typst") return t("settings.integrations.typst.description");
  return t("settings.integrations.libreoffice.description");
}

function scope(id: Plugin) {
  if (id === "agentsview") return t("settings.integrations.agentsview.scope");
  if (id === "drawio") return t("settings.integrations.drawio.scope");
  if (id === "computer-use") return t("settings.integrations.computer_use.scope");
  if (id === "typst") return t("settings.integrations.typst.scope");
  return t("settings.integrations.libreoffice.scope");
}

function readinessNote(state: Readiness) {
  if (state.ready) return t("settings.integrations.computer_use.ready");
  const missing = [
    state.accessibility === false ? t("settings.integrations.computer_use.accessibility") : null,
    state.screen_recording === false ? t("settings.integrations.computer_use.screen_recording") : null,
  ].filter(Boolean);
  const note = t("settings.integrations.computer_use.missing", { missing: missing.join(", ") });
  return state.reset_command
    ? `${note} ${t("settings.integrations.computer_use.stale", { command: state.reset_command })}`
    : note;
}

// Solo macOS pide permisos al sistema: en Linux y Windows no hay nada que comprobar.
const pidePermisos = (plugin: IntegrationStatus) => plugin.id === "computer-use" && plugin.installed && isMac();

export default function Integrations() {
  const [catalog, setCatalog] = createSignal<Catalog | null>(null);
  const [busy, setBusy] = createSignal<{ id: Plugin; operation: Operation } | null>(null);
  const [readiness, setReadiness] = createSignal<Readiness | null>(null);
  const [failure, setFailure] = createSignal<Failure | null>(null);
  const [removing, setRemoving] = createSignal<Plugin | null>(null);
  let request = 0;
  let disposed = false;

  async function refresh(clear = false) {
    const current = ++request;
    if (clear) {
      setCatalog(null);
      setFailure(null);
    }
    try {
      const result = await invoke<Catalog>("list_integrations");
      if (current === request && !disposed) setCatalog(result);
    } catch (error) {
      if (current === request && !disposed) setFailure(asFailure(error));
    }
  }

  async function operate(id: Plugin, operation: Operation, enabled = false) {
    const workspace = catalog()?.workspace;
    if (!workspace || busy()) return;
    setBusy({ id, operation });
    setFailure(null);
    try {
      // Un Tinymist vivo bloquea en Windows la carpeta que actualizar o desinstalar borra.
      if (id === "typst" && (operation === "update" || operation === "uninstall"))
        await invoke("typst_live_stop", { key: null, session: null }).catch(() => {});
      if (operation === "install") await invoke("install_integration", { id });
      else if (operation === "update") await invoke("update_integration", { id });
      else if (operation === "uninstall") await invoke("uninstall_integration", { id });
      else if (operation === "check") setReadiness(await invoke<Readiness>("check_integration", { id }));
      else await invoke("set_integration_enabled", { id, workspace, enabled });
    } catch (error) {
      if (!disposed && catalog()?.workspace === workspace) setFailure(asFailure(error));
    } finally {
      if (!disposed) {
        setBusy(null);
        await refresh();
      }
    }
  }

  const workspaceChanged = () => void refresh(true);
  onMount(() => {
    void refresh();
    window.addEventListener("harness:workspace", workspaceChanged);
  });
  const events = listen("integrations-changed", () => void refresh());
  onCleanup(() => {
    disposed = true;
    request++;
    window.removeEventListener("harness:workspace", workspaceChanged);
    void events.then((unlisten) => unlisten());
  });

  return (
    <>
      <SettingsSection
        title={t("settings.integrations.title")}
        description={t("settings.integrations.description")}
      >
        <For each={catalog()?.plugins}>
          {(plugin) => (
            <SettingsRow
              lead={
                <span
                  class="grid size-10 shrink-0 place-items-center rounded-lg border border-border bg-surface-muted text-neutral-950"
                  aria-hidden="true"
                >
                  <Dynamic component={ICONOS[plugin.id]} size={22} />
                </span>
              }
              label={label(plugin.id)}
              description={
                <>
                  {description(plugin.id)}{" "}
                  <Show when={plugin.installed}>
                    {t("settings.integrations.installed", {
                      version: plugin.version ?? "",
                      size: plugin.bytes === null ? "" : ` · ${mb(plugin.bytes)}`,
                    })}
                  </Show>
                  <Show when={!plugin.installed && plugin.id === "libreoffice"}>
                    {t("settings.integrations.libreoffice.size")}
                  </Show>
                  <Show when={!plugin.installed && plugin.id === "drawio"}>
                    {t("settings.integrations.drawio.size")}
                  </Show>
                  <Show when={!plugin.installed && plugin.id === "computer-use"}>
                    {t("settings.integrations.computer_use.size")}
                  </Show>
                  <Show when={!plugin.installed && plugin.id === "typst"}>
                    {t("settings.integrations.typst.size")}
                  </Show>
                  <Show when={pidePermisos(plugin) && readiness()?.id === plugin.id ? readiness() : null}>
                    {(state) => <span class="mt-1 block">{readinessNote(state())}</span>}
                  </Show>
                  <Show when={!plugin.supported && !plugin.installed}>
                    <span class="block">{t("settings.integrations.unsupported")}</span>
                  </Show>
                  <span class="mt-1 block text-xs leading-5">{scope(plugin.id)}</span>
                </>
              }
            >
              <Show when={!plugin.installing && (plugin.installed || (plugin.bytes ?? 0) > 0)}>
                <Button size="compact" variant="ghost" disabled={!!busy()} onClick={() => setRemoving(plugin.id)}>
                  {busy()?.id === plugin.id && busy()?.operation === "uninstall"
                    ? t("settings.integrations.uninstalling")
                    : t("settings.integrations.uninstall")}
                </Button>
              </Show>
              <Show when={pidePermisos(plugin) && plugin.enabled}>
                <Button size="compact" variant="ghost" disabled={!!busy()} onClick={() => void operate(plugin.id, "check")}>
                  {busy()?.id === plugin.id && busy()?.operation === "check"
                    ? t("settings.integrations.checking")
                    : t("settings.integrations.check")}
                </Button>
              </Show>
              <Show when={plugin.update_available && !plugin.installing}>
                <Button size="sm" variant="secondary" disabled={!!busy()} onClick={() => void operate(plugin.id, "update")}>
                  {busy()?.id === plugin.id && busy()?.operation === "update"
                    ? t("settings.integrations.updating")
                    : t("settings.integrations.update", { version: plugin.latest })}
                </Button>
              </Show>
              <Show when={plugin.installed} fallback={
                <Button size="sm" variant="secondary" disabled={!!busy() || !plugin.supported || plugin.installing} onClick={() => void operate(plugin.id, "install")}>
                  {(busy()?.id === plugin.id && busy()?.operation === "install") || plugin.installing
                    ? t("settings.integrations.installing")
                    : t("settings.integrations.install")}
                </Button>
              }>
                <Toggle
                  checked={plugin.enabled}
                  label={t("settings.integrations.activate")}
                  disabled={!!busy()}
                  onChange={(enabled) =>
                    void operate(plugin.id, "enable", enabled).then(() => {
                      if (enabled && pidePermisos(plugin)) void operate(plugin.id, "check");
                    })
                  }
                />
              </Show>
            </SettingsRow>
          )}
        </For>
        <Show when={failure()}>{(error) => <FailureNote f={error()} />}</Show>
      </SettingsSection>
      <Dialog open={removing() !== null} onOpenChange={(open) => { if (!open) setRemoving(null); }}>
        <DialogContent>
          <DialogTitle class="text-sm font-semibold">{t("settings.integrations.uninstall")}</DialogTitle>
          <Dialog.Description class="my-4 text-sm leading-6 text-neutral-500">
            {t("settings.integrations.uninstall_confirm", { name: removing() ? label(removing()!) : "" })}
          </Dialog.Description>
          <div class="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRemoving(null)}>{t("settings.integrations.cancel")}</Button>
            <Button onClick={() => {
              const id = removing();
              setRemoving(null);
              if (id) void operate(id, "uninstall");
            }}>{t("settings.integrations.uninstall")}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
