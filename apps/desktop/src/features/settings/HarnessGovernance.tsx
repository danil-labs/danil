import { invoke } from "../../lib/invoke.ts";
import { listen } from "../../lib/serviceEvents";
import { createEffect, createSignal, For, on, onCleanup, Show } from "solid-js";
import {
  adoptGovernance,
  governance,
  type GovernanceStatus,
  type RemoteConnection,
  type Tailscale,
} from "../../lib/governance";
import { df } from "../../lib/format";
import { t } from "../../lib/i18n";
import { type Frase, prosa } from "../../lib/prose";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { asFailure, type Failure, FailureNote } from "../../ui/Failure";
import { Toggle } from "../../ui/Toggle";

const ROW = "flex flex-wrap items-baseline justify-between gap-2 text-sm";

/** Espeja `radiant::usage_report::Status`. */
type UsageReport = {
  state: "active" | "pending" | "off" | "not_chosen" | "unsupported" | "not_governed";
  policy: string | null;
  opted_in: boolean;
  queued: number;
  quarantined: number;
  last_error: string | null;
};

function usageState(state: UsageReport["state"]): string {
  switch (state) {
    case "active":
      return t("harness.usage.state.active");
    case "pending":
      return t("harness.usage.state.pending");
    case "off":
      return t("harness.usage.state.off");
    case "not_chosen":
      return t("harness.usage.state.not_chosen");
    default:
      return t("harness.usage.state.unsupported");
  }
}

/** El reporte de consumo de IA a Harness de este workspace (`radiant/usage_report.rs`). */
function UsageReporting(props: { workspace: string }) {
  const [report, setReport] = createSignal<UsageReport | null>(null);
  const [failure, setFailure] = createSignal<Failure | null>(null);
  let request = 0;

  async function load() {
    const mine = ++request;
    try {
      const next = await invoke<UsageReport>("radiant_usage_status");
      if (mine === request) setReport(next);
    } catch {
      if (mine === request) setReport(null);
    }
  }

  async function choose(enabled: boolean) {
    setFailure(null);
    const mine = ++request;
    try {
      const next = await invoke<UsageReport>("radiant_usage_set_opt_in", { enabled });
      if (mine === request) setReport(next);
    } catch (error) {
      setFailure(asFailure(error));
    }
  }

  createEffect(on(() => props.workspace, () => void load()));
  const stops = [listen("usage", () => void load()), listen("radiant", () => void load())];
  onCleanup(() => stops.forEach((stop) => void stop.then((s) => s())));

  return (
    <Show when={report()}>
      {(r) => (
        <div class="grid gap-1">
          <div class="flex items-center justify-between gap-2">
            <span class="text-sm text-neutral-500">{t("harness.usage.title")}</span>
            <Show
              when={r().policy === "optional"}
              fallback={
                <Show when={r().policy === "required"}>
                  <Badge forma="dato">{t("harness.usage.required")}</Badge>
                </Show>
              }
            >
              <Toggle checked={r().opted_in} label={t("harness.usage.toggle")} onChange={(on) => void choose(on)} />
            </Show>
          </div>
          <span class="text-sm text-neutral-950">{usageState(r().state)}</span>
          <span class="text-xs text-neutral-500">{t("harness.usage.what")}</span>
          <Show when={r().queued > 0}>
            <div class={ROW}>
              <span class="text-neutral-500">{t("harness.usage.queued")}</span>
              <span class="text-neutral-950">{r().queued}</span>
            </div>
          </Show>
          <Show when={r().quarantined > 0}>
            <div class={ROW}>
              <span class="text-neutral-500">{t("harness.usage.quarantined")}</span>
              <span class="text-warning-strong">{r().quarantined}</span>
            </div>
          </Show>
          <Show when={failure()}>{(error) => <FailureNote f={error()} />}</Show>
        </div>
      )}
    </Show>
  );
}

/** Un servidor gobernado cuyo login hace la CLI de cada agente. Espeja `mcp::LoginGobernado`. */
type GovernedLogin = { id: string; name: string; sesiones: string[] };
/** Espeja `mcp::AgenteMcp`. */
type McpAgent = { id: string; label: string; recibe: boolean; login: boolean; sin_login?: Frase | null };

function connectionStatus(status: string): string {
  switch (status) {
    case "connected":
      return t("harness.governance.connection.connected");
    case "not_connected":
      return t("harness.governance.connection.not_connected");
    case "needs_reauthorization":
      return t("harness.governance.connection.needs_reauthorization");
    default:
      return t("harness.governance.connection.unknown");
  }
}

function tailscaleState(state: Tailscale, tailnet: string): string {
  switch (state.kind) {
    case "missing":
      return t("harness.governance.tailscale.state_missing");
    case "stopped":
      return t("harness.governance.tailscale.state_stopped");
    default:
      return state.tailnet === tailnet || state.suffix.replace(/\.$/, "") === tailnet
        ? t("harness.governance.tailscale.state_on", { tailnet })
        : t("harness.governance.tailscale.state_other", { tailnet: state.tailnet || state.suffix });
  }
}

/**
 * Gobernar este workspace con el workspace de Radiant elegido, y lo que eso
 * instaló. La desactivación retira lo gestionado (`governed::retire`).
 */
export default function HarnessGovernance(props: { remote: { id: string; name: string } | null }) {
  const [busy, setBusy] = createSignal(false);
  const [failure, setFailure] = createSignal<Failure | null>(null);
  const [connections, setConnections] = createSignal<RemoteConnection[] | null>(null);
  let connectionsRequest = 0;

  const state = () => governance();
  const governed = () => state()?.governed ?? null;
  const summary = () => state()?.summary ?? null;

  async function loadConnections() {
    const mine = ++connectionsRequest;
    try {
      const list = await invoke<RemoteConnection[]>("list_radiant_connections");
      if (mine === connectionsRequest) setConnections(list);
    } catch {
      // Sin respuesta en vivo queda el estado que trajo el gobierno.
      if (mine === connectionsRequest) setConnections(null);
    }
  }

  const [logins, setLogins] = createSignal<GovernedLogin[]>([]);
  const [agents, setAgents] = createSignal<McpAgent[]>([]);
  const [loginNote, setLoginNote] = createSignal<string | null>(null);
  let loginsRequest = 0;

  async function loadLogins() {
    const mine = ++loginsRequest;
    try {
      const [targets, list] = await Promise.all([
        invoke<GovernedLogin[]>("list_governed_mcp_logins"),
        invoke<McpAgent[]>("list_mcp_providers"),
      ]);
      if (mine !== loginsRequest) return;
      setLogins(targets);
      setAgents(list.filter((a) => a.recibe));
    } catch (error) {
      if (mine === loginsRequest) setFailure(asFailure(error));
    }
  }

  async function signIn(agent: string, id: string) {
    setFailure(null);
    setLoginNote(null);
    try {
      setLoginNote(prosa(await invoke<Frase>("mcp_login", { provider: agent, id })));
    } catch (error) {
      setFailure(asFailure(error));
    }
  }

  // El login termina en la CLI del agente; el evento `mcp` dice que hay que releer las sesiones.
  const ended = listen("mcp", () => {
    if (governed()) void loadLogins();
  });
  onCleanup(() => void ended.then((stop) => stop()));

  createEffect(
    on(
      () => [governed()?.workspace_id, governed()?.policy_revision] as const,
      ([id]) => {
        connectionsRequest++;
        loginsRequest++;
        setConnections(null);
        setLogins([]);
        setLoginNote(null);
        if (id) {
          void loadConnections();
          void loadLogins();
        }
      },
    ),
  );

  async function act(call: () => Promise<GovernanceStatus>) {
    if (busy()) return;
    setBusy(true);
    setFailure(null);
    try {
      adoptGovernance(await call());
    } catch (error) {
      setFailure(asFailure(error));
    } finally {
      setBusy(false);
    }
  }

  function toggle(enabled: boolean) {
    if (enabled) void act(() => invoke<GovernanceStatus>("radiant_govern_enable"));
    else void act(() => invoke<GovernanceStatus>("radiant_govern_disable"));
  }

  async function connect(id: string) {
    setFailure(null);
    try {
      await invoke("radiant_connect_account", { id });
    } catch (error) {
      setFailure(asFailure(error));
    }
  }

  const shownConnections = () => connections() ?? summary()?.connections ?? [];
  const until = () => {
    const g = governed();
    return g ? df({ dateStyle: "medium", timeStyle: "short" }).format(new Date(g.expires_at * 1000)) : "";
  };

  return (
    <div class="grid gap-3 rounded-lg border border-border bg-surface-raised p-4">
      <div class="flex items-center justify-between gap-2">
        <h3 class="m-0 text-sm font-semibold text-neutral-950">{t("harness.governance.title")}</h3>
        <Toggle
          checked={governed() !== null}
          disabled={busy() || (governed() === null && !props.remote)}
          label={t("harness.governance.toggle")}
          onChange={toggle}
        />
      </div>
      <span class="text-sm text-neutral-700">
        <Show
          when={governed()}
          fallback={
            props.remote
              ? t("harness.governance.off", { workspace: props.remote.name })
              : t("harness.governance.choose_workspace")
          }
        >
          {(g) => t("harness.governance.on", { workspace: g().workspace_name })}
        </Show>
      </span>

      <Show when={state()?.notice === "radiant.governance.notice.denied"}>
        <p role="status" class="m-0 text-sm text-warning-strong">
          {t("radiant.governance.notice.denied")}
        </p>
      </Show>

      <Show when={governed()}>
        {(g) => (
          <>
            <div class={ROW}>
              <span class="text-neutral-500">{t("harness.governance.validity")}</span>
              <span class="flex items-center gap-2">
                <Show when={state()?.stale}>
                  <Badge tone="warning">{t("harness.governance.stale")}</Badge>
                </Show>
                <span class="text-neutral-950">{until()}</span>
                <Button
                  size="compact"
                  variant="ghost"
                  disabled={busy()}
                  onClick={() => void act(() => invoke<GovernanceStatus>("radiant_govern_refresh"))}
                >
                  {t("harness.governance.refresh")}
                </Button>
              </span>
            </div>
            <Show when={g().last_error}>
              <p class="m-0 text-xs text-neutral-500">{t("harness.governance.kept")}</p>
            </Show>
            <Show when={g().mode === "managed" && g().locked.length > 0}>
              <p class="m-0 text-xs text-neutral-500">{t("harness.governance.locked_note")}</p>
            </Show>
          </>
        )}
      </Show>

      <Show when={summary()}>
        {(s) => (
          <div class="grid gap-2">
            <div class={ROW}>
              <span class="text-neutral-500">{t("harness.governance.sources")}</span>
              <span class="text-right text-neutral-950">
                {s()
                  .sources.map((source) =>
                    source.role === "governance_root"
                      ? t("harness.governance.root_source", { name: source.name })
                      : source.name,
                  )
                  .join(" · ") || t("harness.governance.none")}
              </span>
            </div>
            <div class={ROW}>
              <span class="text-neutral-500">{t("harness.governance.skills")}</span>
              <span class="text-right text-neutral-950">{s().skills.join(" · ") || t("harness.governance.none")}</span>
            </div>
            <div class={ROW}>
              <span class="text-neutral-500">{t("harness.governance.agents")}</span>
              <span class="text-right text-neutral-950">{s().agents.join(" · ") || t("harness.governance.none")}</span>
            </div>
            <div class={ROW}>
              <span class="text-neutral-500">{t("harness.governance.models")}</span>
              <span class="text-right text-neutral-950">
                {(s().models.allowed.length > 0 ? s().models.allowed : s().models.providers).join(" · ") ||
                  t("harness.governance.none")}
                <Show when={s().models.default}>
                  {(d) => <> · {t("harness.governance.default_model", { model: d() })}</>}
                </Show>
              </span>
            </div>
            <div class="grid gap-1">
              <span class="text-sm text-neutral-500">{t("harness.governance.mcp")}</span>
              <Show when={s().mcp.length > 0} fallback={<span class="text-sm text-neutral-950">{t("harness.governance.none")}</span>}>
                <ul class="m-0 grid list-none gap-1 p-0">
                  <For each={s().mcp}>
                    {(server) => (
                      <li class="flex flex-wrap items-center justify-between gap-2 text-sm">
                        <span class="text-neutral-950">{server.name}</span>
                        <Show
                          when={server.active}
                          fallback={
                            <span class="text-xs text-warning-strong">
                              {server.reason ? t(server.reason) : t("harness.governance.mcp_inactive")}
                            </span>
                          }
                        >
                          <Badge forma="dato">{t("harness.governance.mcp_active")}</Badge>
                        </Show>
                      </li>
                    )}
                  </For>
                </ul>
              </Show>
            </div>
            <Show when={s().tailnet}>
              {(net) => (
                <div class={ROW}>
                  <span class="text-neutral-500">{t("harness.governance.tailscale.title")}</span>
                  <span class="text-right text-neutral-950">{tailscaleState(net().state, net().tailnet)}</span>
                </div>
              )}
            </Show>
          </div>
        )}
      </Show>

      <Show when={governed()}>{(g) => <UsageReporting workspace={g().workspace_id} />}</Show>

      <Show when={governed() && logins().length > 0}>
        <div class="grid gap-1">
          <span class="text-sm text-neutral-500">{t("harness.governance.login.title")}</span>
          <ul class="m-0 grid list-none gap-2 p-0">
            <For each={logins()}>
              {(server) => (
                <li class="grid gap-1 text-sm">
                  <span class="text-neutral-950">{server.name}</span>
                  <Show
                    when={agents().length > 0}
                    fallback={<span class="text-xs text-neutral-500">{t("harness.governance.login.no_agents")}</span>}
                  >
                    <For each={agents()}>
                      {(agent) => (
                        <span class="flex flex-wrap items-center justify-between gap-2">
                          <span class="text-xs text-neutral-700">{agent.label}</span>
                          <Show
                            when={!server.sesiones.includes(agent.id)}
                            fallback={<Badge forma="dato">{t("harness.governance.login.signed_in")}</Badge>}
                          >
                            <Show
                              when={agent.login}
                              fallback={
                                <span class="text-xs text-warning-strong">
                                  {t("harness.governance.login.unsupported")}
                                  <Show when={agent.sin_login}>{(why) => <> · {prosa(why())}</>}</Show>
                                </span>
                              }
                            >
                              <Button size="compact" variant="secondary" onClick={() => void signIn(agent.id, server.id)}>
                                {t("harness.governance.login.sign_in", { agent: agent.label })}
                              </Button>
                            </Show>
                          </Show>
                        </span>
                      )}
                    </For>
                  </Show>
                </li>
              )}
            </For>
          </ul>
          <Show when={loginNote()}>
            {(note) => (
              <p role="status" class="m-0 text-xs text-neutral-500">
                {note()}
              </p>
            )}
          </Show>
        </div>
      </Show>

      <Show when={governed() && shownConnections().length > 0}>
        <div class="grid gap-1">
          <span class="text-sm text-neutral-500">{t("harness.governance.connections")}</span>
          <ul class="m-0 grid list-none gap-1 p-0">
            <For each={shownConnections()}>
              {(c) => (
                <li class="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span class="text-neutral-950">{c.name}</span>
                  <span class="flex items-center gap-2">
                    <span class="text-xs text-neutral-500">{connectionStatus(c.status)}</span>
                    <Show when={c.status !== "connected"}>
                      <Button size="compact" variant="secondary" onClick={() => void connect(c.id)}>
                        {t("harness.governance.connect")}
                      </Button>
                    </Show>
                  </span>
                </li>
              )}
            </For>
          </ul>
        </div>
      </Show>

      <Show when={failure()}>{(error) => <FailureNote f={error()} />}</Show>
    </div>
  );
}
