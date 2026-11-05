import { confirm } from "@tauri-apps/plugin-dialog";
import type { GithubMachine } from "@terminus/computers";
import Ellipsis from "lucide-solid/icons/ellipsis";
import ExternalIcon from "lucide-solid/icons/external-link";
import Plus from "lucide-solid/icons/plus";
import { For, Show, createEffect, createSignal, onCleanup, onMount } from "solid-js";
import { invoke } from "../../../lib/invoke.ts";
import { capabilities } from "../../../lib/platform";
import { Badge } from "../../../ui/Badge";
import { Button } from "../../../ui/Button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "../../../ui/DropdownMenu";
import { FailureNote, type Failure } from "../../../ui/Failure";
import { Skeleton } from "../../../ui/Skeleton";
import { SettingsBlock, SettingsRow } from "../layout";
import { ENLACE } from "../../../ui/ExternalLink";

/**
 * El panel de un proveedor de código en la cuenta de Danil: la conexión es de
 * la persona y Danil refleja lo que el proveedor le deja ver. GitHub, GitLab y
 * Bitbucket lo usan con su adaptador (`GithubAccount.tsx`, `PersonalGitHostAccount.tsx`).
 */

/** `account`: esta tarjeta reemplaza la local. `local`: se ve la de esta máquina (sin sesión, motor viejo, o la local sigue mandando). */
export type GitHostAccountMode = "unknown" | "account" | "local";

/** `session`: esta máquina tiene sesión de Danil para el workspace (`null` mientras se pregunta). */
/** `connect`: el «Conectar» de la cabecera de la sección (Control de código), cuando se puede conectar. */
export type GitHostAccountState = {
  mode: GitHostAccountMode;
  connected: boolean;
  reauthorize: boolean;
  session: boolean | null;
  connect?: () => void;
};

export type AccountCredential = {
  id: string;
  status: "active" | "reauthorize";
  config: { login: string; name: string | null };
  machines: GithubMachine[];
};

/** `addUrl`: dónde se añade un área en el proveedor (GitHub: instalar la App); null si no hay. */
export type AccountStatus = {
  connected: boolean;
  credential: AccountCredential | null;
  addUrl: string | null;
  adoptNotice?: { login: string; account_login: string } | null;
};

/** Una organización, grupo o espacio: `url` abre esa área en el proveedor (null: la de añadir). */
export type AccountArea = { key: string; name: string; round: boolean; scope: () => string; url: string | null };

export type AccountAreas = { areas: AccountArea[]; addUrl: string | null; pending: boolean };

/** Las frases del panel, ya traducidas con el nombre del proveedor. */
export type AccountCopy = {
  more_actions: () => string;
  check: () => string;
  disconnect: () => string;
  disconnect_confirm: () => string;
  reauthorize_badge: () => string;
  reauthorize: () => string;
  reconnect: () => string;
  license_badge: () => string;
  license: () => string;
  plans: () => string;
  unavailable: () => string;
  retry: () => string;
  waiting: () => string;
  open: () => string;
  cancel: () => string;
  migrate: () => string;
  migrate_badge?: () => string;
  migrate_action: () => string;
  connect_row: () => string;
  add: () => string;
  pending_hide: () => string;
  change: () => string;
  change_on: (name: string) => string;
  machine_remove: () => string;
  machine_restore: () => string;
  adopt_kept: (account: string, machine: string) => string;
  pending: () => string;
  pending_admin: () => string;
};

/**
 * Lo propio de cada proveedor. `attr` nombra los `data-*` del panel
 * (`data-github-account`, `data-git-host-account`). Los fallos tienen la forma
 * del motor: `detail` es `credentials.error.<código>`.
 */
export type GitHostAccountAdapter = {
  provider: string;
  attr: string;
  copy: AccountCopy;
  status(scope: string): Promise<AccountStatus>;
  authorize(scope: string): Promise<{ url: string; opened: boolean }>;
  areas(scope: string): Promise<AccountAreas>;
  disconnect(scope: string): Promise<void>;
  machine(scope: string, credential: string, computer: string, restore: boolean): Promise<AccountCredential | null>;
  code(e: unknown): string | null;
  failureOf(e: unknown): unknown;
  notHere(e: unknown): boolean;
  silent(e: unknown): boolean;
};

/** Cada cuánto se pregunta tras abrir el proveedor, y hasta cuándo. */
const POLL_MS = 3_000;
const POLL_FOR_MS = 10 * 60_000;
const PLANS_URL = "https://danil.ai/planes";

type WorkspaceAccountOf = { signed_in?: boolean };

export default function GitHostAccount(props: {
  adapter: GitHostAccountAdapter;
  scope: string;
  /** Hay una conexión local en este workspace que se puede pasar: con la cuenta vacía, se ofrece. */
  local: boolean;
  onState: (state: GitHostAccountState) => void;
}) {
  const a = props.adapter;
  const copy = a.copy;
  const data = (name: string, value: string = "") => ({ [`data-${a.attr}-${name}`]: value });
  const [status, setStatus] = createSignal<AccountStatus | null>(null);
  /** `null` mientras se pregunta; `false` si aquí no hay conexión de la cuenta. */
  const [available, setAvailable] = createSignal<boolean | null>(null);
  const [session, setSession] = createSignal<boolean | null>(null);
  const [busy, setBusy] = createSignal<string | null>(null);
  /** «Ocultar» la fila de «Pendiente» en esta pantalla. */
  const [pendingHidden, setPendingHidden] = createSignal(false);
  const [failure, setFailure] = createSignal<Failure | null>(null);
  /** El código del último fallo: algunos se dicen en la fila de la cuenta y no abajo. */
  const [code, setCode] = createSignal<string | null>(null);
  const [waiting, setWaiting] = createSignal<string | null>(null);
  const [areas, setAreas] = createSignal<AccountAreas | null>(null);
  const [addUrl, setAddUrl] = createSignal<string | null>(null);
  let poll: ReturnType<typeof setInterval> | undefined;
  let disposed = false;

  const reauthorizeCode = `${a.provider}_reauthorize`;
  const unavailableCode = `${a.provider}_unavailable`;
  const credential = () => status()?.credential ?? null;
  const connected = () => !!status()?.connected;
  const reauthorize = () => credential()?.status === "reauthorize" || code() === reauthorizeCode;
  const license = () => code() === "license_required";
  const unavailable = () => code() === unavailableCode;
  // Con la cuenta vacía y una conexión local, la local sigue siendo la que usan las tareas.
  const mode = (): GitHostAccountMode => {
    const ok = available();
    if (ok === null) return "unknown";
    return ok && (connected() || !props.local) ? "account" : "local";
  };
  createEffect(() =>
    props.onState({
      mode: mode(),
      connected: connected(),
      reauthorize: reauthorize(),
      session: session(),
      connect: mode() === "account" && !connected() && !waiting() && !license() && !unavailable() && busy() === null ? () => void connect() : undefined,
    }),
  );
  const fail = (e: unknown) => {
    const c = a.code(e);
    setCode(c);
    // Estos tres se dicen en la fila de la cuenta, con su acción.
    setFailure(c === unavailableCode || c === reauthorizeCode || c === "license_required" ? null : (a.failureOf(e) as Failure));
  };
  const clearFailure = () => {
    setFailure(null);
    setCode(null);
  };

  function applyStatus(next: AccountStatus) {
    setStatus(next);
    if (next.addUrl) setAddUrl(next.addUrl);
    setAvailable(true);
  }

  async function read(): Promise<AccountStatus | null> {
    if (capabilities().danilAccount) {
      const of = await invoke<WorkspaceAccountOf>("danil_workspace_account", { workspace: props.scope }).catch(() => null);
      setSession(!!of?.signed_in);
      if (!of?.signed_in) {
        setAvailable(false);
        return null;
      }
    } else {
      setSession(true);
    }
    try {
      const next = await a.status(props.scope);
      if (!disposed) applyStatus(next);
      return next;
    } catch (e) {
      if (disposed) return null;
      // Sin la conexión de la cuenta aquí manda la de esta máquina; un fallo al releer no la cambia.
      if (a.notHere(e) || available() !== true) setAvailable(false);
      if (!a.silent(e)) fail(e);
      return null;
    }
  }

  async function readAreas(): Promise<AccountAreas | null> {
    try {
      const listed = await a.areas(props.scope);
      if (disposed) return null;
      setAreas(listed);
      if (listed.addUrl) setAddUrl(listed.addUrl);
      return listed;
    } catch (e) {
      if (!disposed) fail(e);
      return null;
    }
  }

  async function refresh() {
    clearFailure();
    const next = await read();
    if (next?.connected) await readAreas();
  }

  onMount(() => {
    void refresh();
    // Al volver del proveedor aparece lo recién instalado o autorizado.
    const onFocus = () => {
      if (mode() !== "unknown" && !busy() && !poll) void refresh();
    };
    window.addEventListener("focus", onFocus);
    onCleanup(() => window.removeEventListener("focus", onFocus));
  });
  onCleanup(() => {
    disposed = true;
    stopPolling();
  });

  function stopPolling() {
    if (poll) clearInterval(poll);
    poll = undefined;
  }

  async function connect() {
    setBusy("authorize");
    clearFailure();
    try {
      const { url, opened } = await a.authorize(props.scope);
      if (disposed) return;
      setWaiting(url);
      // Si el motor no la abrió (la web, un motor sin pantalla), se abre aquí; si algo la bloquea, queda el enlace.
      if (!opened) void openUrl(url);
      const until = Date.now() + POLL_FOR_MS;
      const reauthorizing = credential()?.status === "reauthorize";
      stopPolling();
      poll = setInterval(async () => {
        if (Date.now() > until) return finishWaiting();
        const next = await read();
        if (next?.connected && !(reauthorizing && next.credential?.status === "reauthorize")) {
          finishWaiting();
          const listed = await readAreas();
          // Sin ningún área no hay nada que ver: se abre la página de añadir, una vez.
          const add = listed?.addUrl ?? addUrl();
          if (listed && listed.areas.length === 0 && !listed.pending && add) void openUrl(add);
        }
      }, POLL_MS);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  }

  function finishWaiting() {
    stopPolling();
    setWaiting(null);
  }

  async function disconnect() {
    if (!(await confirm(copy.disconnect_confirm(), { kind: "warning" }))) return;
    setBusy("disconnect");
    clearFailure();
    try {
      await a.disconnect(props.scope);
      if (disposed) return;
      setAreas(null);
      applyStatus({ connected: false, credential: null, addUrl: addUrl() });
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  }

  async function check() {
    setBusy("check");
    try {
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  async function machine(m: GithubMachine, restore: boolean) {
    const c = credential();
    if (!c) return;
    setBusy(`machine:${m.computer_id}`);
    clearFailure();
    try {
      const next = await a.machine(props.scope, c.id, m.computer_id, restore);
      if (next && !disposed) applyStatus({ ...(status() as AccountStatus), credential: next });
      else await read();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  }

  const machineName = (m: GithubMachine) => m.name || capabilities().machineName?.(m.computer_id) || m.computer_id;
  const openUrl = (url: string) => invoke("open_external", { target: url }).catch(() => {});
  const changeUrl = (i: AccountArea) => i.url ?? addUrl();

  const Initial = (p: { name: string; round?: boolean }) => (
    <span
      aria-hidden="true"
      class={`grid size-6 shrink-0 place-items-center bg-neutral-200 text-caption font-semibold text-neutral-700 ${p.round ? "rounded-full" : "rounded-sm"}`}
    >
      {p.name.slice(0, 1).toUpperCase()}
    </span>
  );

  /** Lo que la fila de la cuenta dice en vez del menú: un estado con su acción. */
  const AccountState = () => (
    <Show
      when={reauthorize() || license() || unavailable()}
      fallback={
        <DropdownMenu>
          <DropdownMenuTrigger as={Button} variant="ghost" size="iconCompact" aria-label={copy.more_actions()} disabled={busy() !== null}>
            <Ellipsis size={16} aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent class="z-[90]" data-owns-escape>
            <DropdownMenuItem disabled={busy() !== null} onSelect={() => void check()}>
              {copy.check()}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem class="text-error-strong" disabled={busy() !== null} onSelect={() => void disconnect()}>
              {copy.disconnect()}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      }
    >
      <Show when={reauthorize()}>
        <span class="inline-flex items-center gap-2 text-ui text-warning-strong">
          <Badge tone="warning">{copy.reauthorize_badge()}</Badge>
          {copy.reauthorize()}
        </span>
        <Button size="sm" disabled={busy() !== null} onClick={() => void connect()}>
          {copy.reconnect()}
        </Button>
      </Show>
      <Show when={!reauthorize() && license()}>
        <span class="inline-flex items-center gap-2 text-ui text-warning-strong">
          <Badge tone="warning">{copy.license_badge()}</Badge>
          {copy.license()}
        </span>
        <Button variant="outline" size="compact" onClick={() => void openUrl(PLANS_URL)}>
          {copy.plans()}
          <ExternalIcon size={12} aria-hidden />
        </Button>
      </Show>
      <Show when={!reauthorize() && !license() && unavailable()}>
        <span class="text-ui text-error-strong" role="alert">{copy.unavailable()}</span>
        <Button variant="outline" size="compact" disabled={busy() !== null} onClick={() => void check()}>
          {copy.retry()}
        </Button>
      </Show>
    </Show>
  );

  /**
   * Las máquinas donde está en uso, como chips junto a la cuenta (el `Badge
   * forma="dato"` de Proveedores de IA): hasta 3 y «+N»; el `title` da todas.
   * Clic en un chip: su única acción, quitar o volver a poner.
   */
  function MachineChips(p: { machines: GithubMachine[] }) {
    const shown = () => p.machines.slice(0, 3);
    const rest = () => p.machines.length - shown().length;
    const all = () => p.machines.map(machineName).join(", ");
    const action = (m: GithubMachine) => (m.state === "removed" ? copy.machine_restore() : copy.machine_remove());
    return (
      <Show when={p.machines.length > 0}>
        <span class="inline-flex min-w-0 flex-wrap items-center gap-1" {...data("machines")} title={all()}>
          <For each={shown()}>
            {(m) => (
              <DropdownMenu>
                <DropdownMenuTrigger
                  as="button"
                  type="button"
                  class="rounded-sm"
                  {...data("machine", m.computer_id)}
                  aria-label={machineName(m)}
                  disabled={busy() !== null}
                >
                  <Badge forma="dato" class={m.state === "removed" ? "shrink-0 opacity-60" : "shrink-0"}>
                    {machineName(m)}
                  </Badge>
                </DropdownMenuTrigger>
                <DropdownMenuContent class="z-[90]" data-owns-escape>
                  <DropdownMenuItem disabled={busy() !== null} onSelect={() => void machine(m, m.state === "removed")}>
                    {action(m)}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </For>
          <Show when={rest() > 0}>
            <DropdownMenu>
              <DropdownMenuTrigger as="button" type="button" class="rounded-sm" aria-label={all()} disabled={busy() !== null}>
                <Badge forma="dato" class="shrink-0">+{rest()}</Badge>
              </DropdownMenuTrigger>
              <DropdownMenuContent class="z-[90]" data-owns-escape>
                <For each={p.machines.slice(3)}>
                  {(m) => (
                    <DropdownMenuItem disabled={busy() !== null} onSelect={() => void machine(m, m.state === "removed")}>
                      {machineName(m)} · {action(m)}
                    </DropdownMenuItem>
                  )}
                </For>
              </DropdownMenuContent>
            </DropdownMenu>
          </Show>
        </span>
      </Show>
    );
  }

  return (
    <div {...data("account", mode())} class="contents">
      <Show when={waiting()}>
        {(url) => (
          <SettingsRow
            label={copy.waiting()}
            description={
              <a class={ENLACE} href={url()} target="_blank" rel="noopener noreferrer" onClick={(ev) => { ev.preventDefault(); void openUrl(url()); }}>
                {copy.open()}
              </a>
            }
          >
            <Button variant="outline" size="compact" onClick={finishWaiting}>
              {copy.cancel()}
            </Button>
          </SettingsRow>
        )}
      </Show>

      {/* Hay conexión local y la cuenta aún no tiene: pasarla es autorizar una vez. */}
      <Show when={available() && !connected() && props.local && !waiting()}>
        <SettingsRow
          {...data("migrate")}
          label={
            <Show when={copy.migrate_badge} fallback={copy.migrate()}>
              {(badge) => (
                <span class="inline-flex items-center gap-2 text-warning-strong">
                  <Badge tone="warning">{badge()()}</Badge>
                  {copy.migrate()}
                </span>
              )}
            </Show>
          }
        >
          <Button size="compact" disabled={busy() !== null} onClick={() => void connect()}>
            {copy.migrate_action()}
          </Button>
        </SettingsRow>
      </Show>

      {/* Sin licencia el Worker no da la conexión de la cuenta; la de esta máquina, si hay, sigue. */}
      <Show when={mode() === "local" && license() && !props.local}>
        <SettingsRow label={copy.connect_row()}>
          <AccountState />
        </SettingsRow>
      </Show>

      {/* Sin conectar, «Conectar» va en la cabecera de la sección (`onState().connect`); aquí solo lo que lo impide. */}
      <Show when={mode() === "account" && !connected() && !waiting() && (license() || unavailable())}>
        <SettingsRow label={copy.connect_row()}>
          <AccountState />
        </SettingsRow>
      </Show>

      <Show when={mode() === "account" && connected() ? credential() : null}>
        {(c) => (
          <>
            <SettingsRow
              {...data("login", c().config.login)}
              lead={<Initial name={c().config.name ?? c().config.login} round />}
              label={
                <span class="inline-flex min-w-0 items-baseline gap-2">
                  <Show when={c().config.name}>{(name) => <strong class="truncate font-semibold">{name()}</strong>}</Show>
                  <span class={c().config.name ? "truncate font-mono text-xs text-neutral-500" : "truncate font-semibold"}>@{c().config.login}</span>
                  <MachineChips machines={c().machines} />
                </span>
              }
              description={
                <Show when={status()?.adoptNotice}>
                  {(n) => copy.adopt_kept(n().account_login, n().login)}
                </Show>
              }
            >
              <Show when={!waiting()}>
                <AccountState />
              </Show>
            </SettingsRow>

            <Show when={!unavailable() && !reauthorize()}>
              <Show when={areas()} fallback={<SettingsBlock><Skeleton filas={2} class="h-6" /></SettingsBlock>}>
                {(list) => (
                  <div class="contents" {...data("installations")}>
                    <For each={list().areas}>
                      {(i) => (
                        <SettingsRow
                          class={license() ? "pl-6 opacity-60" : "pl-6"}
                          {...data("installation", i.key)}
                          lead={<Initial name={i.name} round={i.round} />}
                          label={i.name}
                        >
                          <span class="text-ui text-neutral-500">{i.scope()}</span>
                          <Show when={!license() ? changeUrl(i) : null}>
                            {(url) => (
                              <Button
                                variant="outline"
                                size="compact"
                                aria-label={copy.change_on(i.name)}
                                disabled={busy() !== null}
                                onClick={() => void openUrl(url())}
                              >
                                {copy.change()}
                                <ExternalIcon size={12} aria-hidden />
                              </Button>
                            )}
                          </Show>
                        </SettingsRow>
                      )}
                    </For>
                    <Show when={list().pending && !pendingHidden()}>
                      <SettingsRow class="pl-6" {...data("installation-pending")} label={<Badge tone="warning">{copy.pending()}</Badge>}>
                        <span class="text-ui text-neutral-500">{copy.pending_admin()}</span>
                        <Button variant="ghost" size="compact" onClick={() => setPendingHidden(true)}>
                          {copy.pending_hide()}
                        </Button>
                      </SettingsRow>
                    </Show>
                    <Show when={!license() ? addUrl() : null}>
                      {(url) => (
                        <SettingsRow
                          class="pl-6"
                          label={
                            <Button variant="ghost" size="compact" class="-ml-2" disabled={busy() !== null} onClick={() => void openUrl(url())}>
                              <Plus size={12} aria-hidden />
                              {copy.add()}
                            </Button>
                          }
                        />
                      )}
                    </Show>
                  </div>
                )}
              </Show>
            </Show>

          </>
        )}
      </Show>

      <Show when={failure()}>
        {(f) => (
          <SettingsBlock>
            <FailureNote f={f()} />
          </SettingsBlock>
        )}
      </Show>
    </div>
  );
}
