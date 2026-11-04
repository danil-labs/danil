/**
 * El panel de Harness. La copy propia usa `harness.*`; las frases que manda el
 * motor (`radiant.error.*`, `radiant.governance.*`, `radiant.usage.*`) siguen en
 * `radiant.json` porque son el nombre del contrato, no de la pantalla.
 */
import { invoke } from "../../lib/invoke.ts";
import { listen } from "../../lib/serviceEvents";
import { createSignal, For, lazy, onCleanup, onMount, Show, Suspense } from "solid-js";
import { t } from "../../lib/i18n";
import { destinoAbrible } from "../../lib/links";
import { type Frase, prosa } from "../../lib/prose";
import { cn } from "../../lib/utils";
import { Button } from "../../ui/Button";
import { asFailure, type Failure, FailureNote } from "../../ui/Failure";
import { Input } from "../../ui/Input";
import { Select } from "../../ui/Select";
import HarnessGovernance from "./HarnessGovernance";

const HarnessInsights = lazy(() => import("./HarnessInsights"));

type RemoteWorkspace = { id: string; name: string };
type LoginView = {
  server: string;
  running: boolean;
  prompt: { uri: string; code: string } | null;
  failure: Failure | null;
};
type Status = {
  cloud_server: string;
  server: string | null;
  signed_in: boolean;
  workspace: RemoteWorkspace | null;
  login: LoginView | null;
};
type Organization = { id: string; name: string };
type Identity = {
  status: string;
  email: string | null;
  name: string | null;
  organization: string | null;
  organizations: Organization[];
  note: Frase | null;
};
type Mode = "cloud" | "custom";

export default function Harness() {
  const [status, setStatus] = createSignal<Status | null>(null);
  const [mode, setMode] = createSignal<Mode>("cloud");
  const [url, setUrl] = createSignal("");
  const [workspaces, setWorkspaces] = createSignal<RemoteWorkspace[] | null>(null);
  const [identity, setIdentity] = createSignal<Identity | null>(null);
  const [busy, setBusy] = createSignal(false);
  const [failure, setFailure] = createSignal<Failure | null>(null);
  let request = 0;
  // El workspace de Terminus que pidió cada respuesta: una que llega tras cambiarlo es de otro.
  let epoch = 0;
  // Una verificación por servidor: listar también emite `radiant` y volvería a entrar aquí.
  let verified: string | null = null;
  // La última petición de cuenta y de lista: una respuesta anterior, o de otra cuenta, no entra.
  let identityRequest = 0;
  let workspacesRequest = 0;

  const forget = () => {
    identityRequest++;
    workspacesRequest++;
    verified = null;
    setIdentity(null);
    setWorkspaces(null);
  };

  const adopt = (next: Status) => {
    const before = status();
    setStatus(next);
    // Otro servidor u otra sesión pueden ser de otra cuenta: de la anterior no queda nada.
    const moved = before?.server !== next.server || before?.signed_in !== next.signed_in;
    if (moved || !next.signed_in) forget();
    if (next.signed_in && next.server && verified !== next.server) {
      verified = next.server;
      void verify();
    }
    if (next.server && next.server !== next.cloud_server) {
      setMode("custom");
      if (!url()) setUrl(next.server);
    }
  };

  async function refresh() {
    const current = ++request;
    try {
      const next = await invoke<Status>("radiant_status");
      if (current === request) adopt(next);
    } catch (error) {
      if (current === request) setFailure(asFailure(error));
    }
  }

  async function verify() {
    if (!status()?.signed_in) return;
    const current = ++identityRequest;
    try {
      const who = await invoke<Identity>("get_radiant_identity");
      if (current !== identityRequest) return;
      setIdentity(who);
      if (who.status === "ok") await loadWorkspaces();
    } catch (error) {
      if (current !== identityRequest) return;
      setIdentity(null);
      setFailure(asFailure(error));
    }
  }

  async function loadWorkspaces() {
    const current = ++workspacesRequest;
    try {
      const list = await invoke<RemoteWorkspace[]>("list_radiant_workspaces");
      if (current === workspacesRequest) setWorkspaces(list);
    } catch (error) {
      if (current !== workspacesRequest) return;
      setWorkspaces(null);
      setFailure(asFailure(error));
    }
  }

  async function act(call: () => Promise<Status>, accountChanges = false) {
    if (busy()) return;
    const mine = epoch;
    setBusy(true);
    setFailure(null);
    // Al empezar: lo que la cuenta anterior tenga en camino ya no entra, conteste o falle.
    if (accountChanges) forget();
    try {
      const next = await call();
      if (mine !== epoch) return;
      if (accountChanges) forget();
      adopt(next);
    } catch (error) {
      if (mine === epoch) setFailure(asFailure(error));
    } finally {
      if (mine === epoch) {
        setBusy(false);
        await refresh();
      }
    }
  }

  const chooseServer = (next: Mode) => {
    setMode(next);
    const cloud = status()?.cloud_server;
    if (next === "cloud" && cloud && status()?.server !== cloud) {
      void act(() => invoke<Status>("radiant_set_server", { server: cloud }), true);
    }
  };

  const workspaceChanged = () => {
    epoch++;
    request++;
    forget();
    setStatus(null);
    setUrl("");
    setMode("cloud");
    setFailure(null);
    setBusy(false);
    void refresh();
  };
  onMount(() => {
    void refresh();
    window.addEventListener("harness:workspace", workspaceChanged);
  });
  const events = listen("radiant", () => void refresh());
  onCleanup(() => {
    epoch++;
    request++;
    forget();
    window.removeEventListener("harness:workspace", workspaceChanged);
    void events.then((unlisten) => unlisten());
  });

  const login = () => status()?.login ?? null;
  const running = () => login()?.running ?? false;
  const server = () => status()?.server ?? "";
  const account = () => {
    const who = identity();
    if (!who?.email) return "";
    return who.organization ? `${who.email} · ${who.organization}` : who.email;
  };

  return (
    <section class="grid max-w-2xl gap-4">
      <header class="grid gap-1">
        <h2 class="m-0 text-lg font-display font-bold tracking-tight text-neutral-950">
          {t("harness.title")}
        </h2>
        <p class="m-0 text-sm text-neutral-500">{t("harness.description")}</p>
      </header>

      <div class="grid gap-3 rounded-lg border border-border bg-surface-raised p-4">
        <h3 class="m-0 text-sm font-semibold text-neutral-950">{t("harness.server.title")}</h3>
        <div
          role="radiogroup"
          aria-label={t("harness.server.label")}
          class="inline-flex w-fit gap-0.5 rounded-md border border-border bg-surface p-0.5"
        >
          <For each={["cloud", "custom"] as Mode[]}>
            {(id) => (
              <button
                type="button"
                role="radio"
                aria-checked={mode() === id}
                disabled={busy() || running()}
                class={cn(
                  "min-h-8 rounded-sm px-3 text-ui text-neutral-500 disabled:opacity-60",
                  mode() === id ? ["bg-neutral-200", "text-neutral-950", "shadow-sm"] : "hover:bg-surface-muted",
                )}
                onClick={() => chooseServer(id)}
              >
                {id === "cloud" ? t("harness.server.cloud") : t("harness.server.custom")}
              </button>
            )}
          </For>
        </div>
        <Show
          when={mode() === "custom"}
          fallback={
            <div class="flex flex-wrap items-center gap-2">
              <span class="font-mono text-xs text-neutral-500">{status()?.cloud_server}</span>
              <Show when={status() && status()?.server !== status()?.cloud_server}>
                <Button
                  size="sm"
                  disabled={busy() || running()}
                  onClick={() => {
                    const cloud = status()?.cloud_server;
                    if (cloud) void act(() => invoke<Status>("radiant_set_server", { server: cloud }), true);
                  }}
                >
                  {t("harness.server.use")}
                </Button>
              </Show>
            </div>
          }
        >
          <form
            class="flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void act(() => invoke<Status>("radiant_set_server", { server: url() }), true);
            }}
          >
            <Input
              class="max-w-sm flex-1 font-mono"
              aria-label={t("harness.server.url_label")}
              placeholder={t("harness.server.url_placeholder")}
              value={url()}
              spellcheck={false}
              autocomplete="off"
              disabled={busy() || running()}
              onInput={(e) => setUrl(e.currentTarget.value)}
            />
            <Button size="sm" type="submit" disabled={busy() || running() || !url().trim()}>
              {t("harness.server.use")}
            </Button>
          </form>
        </Show>
      </div>

      <Show when={status()?.server}>
        <div class="grid gap-3 rounded-lg border border-border bg-surface-raised p-4">
          <h3 class="m-0 text-sm font-semibold text-neutral-950">{t("harness.session.title")}</h3>
          <Show
            when={running()}
            fallback={
              <div class="flex flex-wrap items-center justify-between gap-2">
                <span class="text-sm text-neutral-700">
                  {!status()?.signed_in
                    ? t("harness.session.signed_out", { server: server() })
                    : account()
                      ? t("harness.session.signed_in_as", { account: account(), server: server() })
                      : t("harness.session.signed_in", { server: server() })}
                </span>
                <Show
                  when={status()?.signed_in}
                  fallback={
                    <Button size="sm" disabled={busy()} onClick={() => void act(() => invoke<Status>("radiant_login"), true)}>
                      {t("harness.session.login")}
                    </Button>
                  }
                >
                  <Button size="sm" variant="outline" disabled={busy()} onClick={() => void act(() => invoke<Status>("radiant_logout"), true)}>
                    {busy() ? t("harness.session.logging_out") : t("harness.session.logout")}
                  </Button>
                </Show>
              </div>
            }
          >
            <Show
              when={login()?.prompt}
              fallback={<p class="m-0 text-sm text-neutral-500">{t("harness.session.starting")}</p>}
            >
              {(prompt) => (
                <div class="grid gap-2">
                  <span class="text-sm text-neutral-700">{t("harness.session.code")}</span>
                  <span class="font-mono text-2xl font-semibold tracking-widest text-neutral-950">
                    {prompt().code}
                  </span>
                  <span class="font-mono text-xs break-all text-neutral-500">{prompt().uri}</span>
                </div>
              )}
            </Show>
            <div class="flex flex-wrap gap-2">
              <Show when={destinoAbrible(login()?.prompt?.uri)?.startsWith("https://")}>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    const uri = login()?.prompt?.uri;
                    if (uri) void invoke("open_external", { target: uri }).catch((e) => setFailure(asFailure(e)));
                  }}
                >
                  {t("harness.session.open_browser")}
                </Button>
              </Show>
              <Button size="sm" variant="outline" onClick={() => void act(() => invoke<Status>("radiant_cancel_login"))}>
                {t("harness.session.cancel")}
              </Button>
            </div>
          </Show>
          <Show when={status()?.signed_in && identity()?.note}>
            {(note) => <p class="m-0 text-sm text-neutral-500">{prosa(note())}</p>}
          </Show>
          <Show when={status()?.signed_in && identity()?.status === "organization_selection_required"}>
            <Select
              class="max-w-sm"
              aria-label={t("harness.organization.label")}
              disabled={busy()}
              value=""
              onChange={(e) => {
                const id = e.currentTarget.value;
                void act(() => invoke<Status>("radiant_select_organization", { id }), true);
              }}
            >
              <option value="" disabled>
                {t("harness.organization.choose")}
              </option>
              <For each={identity()?.organizations ?? []}>{(o) => <option value={o.id}>{o.name}</option>}</For>
            </Select>
          </Show>
          <Show when={login()?.failure}>{(error) => <FailureNote f={error()} />}</Show>
        </div>
      </Show>

      <Show when={status()?.server && status()?.signed_in}>
        <div class="grid gap-3 rounded-lg border border-border bg-surface-raised p-4">
          <div class="flex items-center justify-between gap-2">
            <h3 class="m-0 text-sm font-semibold text-neutral-950">{t("harness.workspace.title")}</h3>
            <Button size="compact" variant="ghost" disabled={busy()} onClick={() => void loadWorkspaces()}>
              {t("harness.workspace.refresh")}
            </Button>
          </div>
          <Show
            when={workspaces()}
            fallback={
              <Show when={status()?.workspace}>
                {(chosen) => <span class="text-sm text-neutral-700">{chosen().name}</span>}
              </Show>
            }
          >
            {(list) => (
              <Show
                when={list().length > 0}
                fallback={<p class="m-0 text-sm text-neutral-500">{t("harness.workspace.empty")}</p>}
              >
                <Select
                  class="max-w-sm"
                  aria-label={t("harness.workspace.title")}
                  disabled={busy()}
                  value={status()?.workspace?.id ?? ""}
                  onChange={(e) => {
                    const id = e.currentTarget.value;
                    // Elegir un workspace pasa la sesión a su organización: la cuenta se relee.
                    void act(() => invoke<Status>("radiant_select_workspace", { id })).then(verify);
                  }}
                >
                  <option value="" disabled>
                    {t("harness.workspace.choose")}
                  </option>
                  {/* `selected` por fila: cada lista trae objetos nuevos, el navegador marca
                      la primera opción recreada y `value`, que no cambió, no se reaplica. */}
                  <For each={list()}>
                    {(w) => (
                      <option value={w.id} selected={w.id === status()?.workspace?.id}>
                        {w.name}
                      </option>
                    )}
                  </For>
                </Select>
              </Show>
            )}
          </Show>
        </div>
      </Show>

      <Show when={status()?.server && status()?.signed_in}>
        <HarnessGovernance remote={status()?.workspace ?? null} />
      </Show>

      <Show when={status()?.workspace}>
        <Suspense fallback={null}>
          <HarnessInsights />
        </Suspense>
      </Show>

      <Show when={failure()}>{(error) => <FailureNote f={error()} />}</Show>
    </section>
  );
}
