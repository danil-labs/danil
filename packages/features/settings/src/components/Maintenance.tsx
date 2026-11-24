import { getVersion } from "@tauri-apps/api/app";
import { check, type Update } from "@tauri-apps/plugin-updater";
import RefreshCw from "lucide-solid/icons/refresh-cw";
import TriangleAlert from "lucide-solid/icons/triangle-alert";
import { createSignal, Match, onMount, Show, Switch } from "solid-js";
import { lengua, t } from "../../../../../apps/desktop/src/lib/i18n";
import { prosa } from "../../../../../apps/desktop/src/lib/prose";
import { releaseNotes } from "../../../../../apps/desktop/src/lib/releaseNotes";
import type { MachineResources } from "../../../../engine-client/src/index.ts";
import { capabilities } from "../../../../host/src/platform";
import { Button } from "../../../../ui/src/Button";
import { asFailure, type Failure, FailureNote } from "../../../../ui/src/Failure";
import { SettingsBlock, SettingsPanel, SettingsRow, SettingsSection } from "../../../../ui/src/SettingsLayout";
import type { MaquinasDeAjustes } from "../model/machines-port";
import {
  formatEngineVersion,
  normalizeVersion,
  parseEngineVersion,
  pickTargetMachine,
  resourcesFromStartup,
  type StartupWithResources,
} from "../model/maintenance-version";
import { checkEnvironment, restartApp, updateInstall, updatePending } from "../queries/engine-environment";
import { listWorkspaces } from "../queries/engine-workspaces";
import { AppDownloadsSection } from "./AppDownloads";

const NO_RING = "outline-none focus:outline-none focus-visible:outline-none";

/**
 * Estado excluyente de la actualización de escritorio: no poder consultar nunca
 * se muestra como «al día», y un error de descarga conserva la versión hallada.
 */
type UpdateState =
  | { t: "checking" }
  | { t: "uptodate" }
  | { t: "pending" }
  | { t: "unreachable"; raw: string }
  | {
      t: "available";
      update: Update;
      step: "idle" | "downloading" | "ready";
      failure: Failure | null;
    };

function isState<T extends UpdateState["t"]>(
  value: UpdateState,
  kind: T,
): value is Extract<UpdateState, { t: T }> {
  return value.t === kind;
}

function AppUpdatesSection() {
  const [state, setState] = createSignal<UpdateState>({ t: "checking" });

  const available = () => {
    const current = state();
    return isState(current, "available") ? current : null;
  };
  const unreachable = () => {
    const current = state();
    return isState(current, "unreachable") ? current : null;
  };

  async function checkUpdates() {
    const current = available();
    if (current && current.step !== "idle") return;
    setState({ t: "checking" });
    try {
      const pending = await updatePending<boolean>().catch(() => false);
      if (pending) {
        setState({ t: "pending" });
        return;
      }
      const update = await check();
      setState(
        update
          ? { t: "available", update, step: "idle", failure: null }
          : { t: "uptodate" },
      );
    } catch (error) {
      const failure = asFailure(error);
      setState({ t: "unreachable", raw: failure.detail || prosa(failure.what) });
    }
  }

  onMount(() => {
    void checkUpdates();
  });

  async function installUpdate() {
    let current = state();
    if (!isState(current, "available") || current.step !== "idle") return;
    setState({ ...current, step: "downloading", failure: null });
    let checked = false;
    try {
      const latest = await check();
      checked = true;
      if (!latest) {
        setState({ t: "uptodate" });
        return;
      }
      current = { ...current, update: latest };
      setState({ ...current, step: "downloading", failure: null });
      // En Windows `downloadAndInstall` cierra la app; Rust instala sin cerrarla.
      await updateInstall();
      setState({ ...current, step: "ready", failure: null });
    } catch (error) {
      if (!checked) {
        const failure = asFailure(error);
        setState({ t: "unreachable", raw: failure.detail || prosa(failure.what) });
        return;
      }
      setState({
        ...current,
        step: "idle",
        failure: { ...asFailure(error), what: t("settings.update.error_download") },
      });
    }
  }

  return (
    <SettingsSection title={t("settings.maintenance.updates")} data-maintenance-updates="">
      <SettingsRow
        label={t("settings.maintenance.app_updates")}
        description={
          <Switch>
            <Match when={state().t === "checking"}>{t("settings.update.checking")}</Match>
            <Match when={state().t === "uptodate"}>{t("settings.update.uptodate")}</Match>
            <Match when={state().t === "pending"}>{t("settings.update.ready")}</Match>
            <Match when={available()}>
              {(item) => (
                <>
                  {t("settings.update.available")}{" "}
                  <span class="font-mono font-semibold text-neutral-950">
                    v{normalizeVersion(item().update.version)}
                  </span>
                </>
              )}
            </Match>
          </Switch>
        }
      >
        <Switch>
          <Match when={state().t === "pending"}>
            <Button
              variant="primary"
              size="sm"
              class={NO_RING}
              onClick={() => void restartApp()}
            >
              {t("settings.update.relaunch")}
            </Button>
          </Match>
          <Match when={available()}>
            {(item) => (
              <Switch>
                <Match when={item().step === "idle"}>
                  <Button
                    variant="primary"
                    size="sm"
                    class={NO_RING}
                    onClick={() => void installUpdate()}
                  >
                    {t("settings.update.install")}
                  </Button>
                </Match>
                <Match when={item().step === "ready"}>
                  <Button
                    variant="primary"
                    size="sm"
                    class={NO_RING}
                    onClick={() => void restartApp()}
                  >
                    {t("settings.update.relaunch")}
                  </Button>
                </Match>
              </Switch>
            )}
          </Match>
          <Match when={!available()}>
            <Button
              variant="secondary"
              size="sm"
              class={NO_RING}
              disabled={state().t === "checking"}
              onClick={() => void checkUpdates()}
            >
              <RefreshCw size={14} />
              {t("settings.update.check")}
            </Button>
          </Match>
        </Switch>
      </SettingsRow>

      <Show when={unreachable()}>
        {(failure) => (
          <SettingsBlock>
            <div class="grid gap-2 rounded-md border border-warning/30 bg-warning/5 px-3 py-2.5">
              <p class="m-0 flex items-start gap-1.5 text-ui font-semibold text-warning-strong">
                <TriangleAlert size={14} class="mt-0.5 shrink-0" />
                <span>{t("settings.update.unreachable")}</span>
              </p>
              <p class="m-0 text-xs text-neutral-500">
                {t("settings.update.unreachable_retry")}
              </p>
              <details>
                <summary class={`cursor-pointer text-xs text-neutral-500 ${NO_RING}`}>
                  {t("settings.update.detail")}
                </summary>
                <p class="m-0 mt-1 font-mono text-caption break-all whitespace-pre-wrap text-neutral-500">
                  {failure().raw}
                </p>
              </details>
            </div>
          </SettingsBlock>
        )}
      </Show>

      <Show when={available()}>
        {(item) => (
          <Show
            when={
              releaseNotes(item().update, lengua())
              || item().step !== "idle"
              || item().failure
            }
          >
            <SettingsBlock>
              <Show when={releaseNotes(item().update, lengua())}>
                {(notes) => (
                  <p class="m-0 whitespace-pre-wrap text-xs text-neutral-500">{notes()}</p>
                )}
              </Show>

              <Show when={item().step === "downloading"}>
                <p class="m-0 text-xs text-neutral-500">{t("settings.update.downloading")}</p>
              </Show>

              <Show when={item().step === "ready"}>
                <p class="m-0 text-xs text-neutral-500">{t("settings.update.ready")}</p>
              </Show>

              <Show when={item().failure}>{(failure) => <FailureNote f={failure()} />}</Show>
            </SettingsBlock>
          </Show>
        )}
      </Show>
    </SettingsSection>
  );
}

export default function Maintenance(props: { maquinas: MaquinasDeAjustes }) {
  const [appVersion, setAppVersion] = createSignal<string | null>(null);
  const [appLoaded, setAppLoaded] = createSignal(false);
  const [engineResources, setEngineResources] = createSignal<MachineResources | undefined>(undefined);
  const [engineBuildFallback, setEngineBuildFallback] = createSignal<string | null>(null);
  const [engineLoaded, setEngineLoaded] = createSignal(false);

  const targetMachine = () => pickTargetMachine(props.maquinas.machines());
  const engineInfo = () => parseEngineVersion(
    engineResources(),
    targetMachine()?.version,
    engineBuildFallback(),
  );

  onMount(() => {
    void getVersion()
      .then((value) => {
        if (value?.trim()) setAppVersion(normalizeVersion(value));
      })
      .catch(() => {})
      .finally(() => setAppLoaded(true));

    void (async () => {
      try {
        const machine = targetMachine();
        const options = machine ? props.maquinas.machineOf(machine.id) : undefined;
        const startup = await listWorkspaces<Partial<StartupWithResources>>({}, options).catch(() => null);
        const resources = resourcesFromStartup(startup, machine?.id);
        if (resources) setEngineResources(resources);

        const resolved = parseEngineVersion(resources, machine?.version, null);
        if (!resolved && capabilities().nativeWindow) {
          const env = await checkEnvironment<{ engineBuild?: string }>().catch(() => null);
          if (env?.engineBuild?.trim()) setEngineBuildFallback(env.engineBuild.trim());
        }
      } finally {
        setEngineLoaded(true);
      }
    })();
  });

  return (
    <SettingsPanel data-settings-maintenance="">
      <Show when={capabilities().updater}>
        <AppUpdatesSection />
      </Show>

      <Show when={capabilities().appDownloads}>
        <AppDownloadsSection />
      </Show>

      <SettingsSection title={t("settings.maintenance.versions")} data-maintenance-versions="">
        <SettingsRow label={t("settings.maintenance.app_version")} data-maintenance-app-version="">
          <Switch fallback={<span class="font-mono text-ui tabular-nums text-neutral-500">—</span>}>
            <Match when={appVersion()}>
              {(version) => (
                <span class="font-mono text-ui tabular-nums text-neutral-950">
                  {t("settings.maintenance.app_value", { version: version() })}
                </span>
              )}
            </Match>
            <Match when={appLoaded()}>
              <span class="text-ui text-neutral-500">{t("settings.maintenance.unavailable")}</span>
            </Match>
          </Switch>
        </SettingsRow>

        <SettingsRow
          label={t("settings.maintenance.engine_version")}
          description="danil-engine"
          data-maintenance-engine-version=""
        >
          <Switch fallback={<span class="font-mono text-ui tabular-nums text-neutral-500">—</span>}>
            <Match when={engineInfo()}>
              {(info) => (
                <span class="font-mono text-ui tabular-nums text-neutral-950">
                  {formatEngineVersion(info())}
                </span>
              )}
            </Match>
            <Match when={engineLoaded()}>
              <span class="text-ui text-neutral-500">{t("settings.maintenance.unavailable")}</span>
            </Match>
          </Switch>
        </SettingsRow>
      </SettingsSection>
    </SettingsPanel>
  );
}
