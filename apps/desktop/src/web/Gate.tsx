import { hasAccountWorkspaces, hasLinkedWorkspaces, listWorkspaces } from "@terminus/computers";
import { type JSX, For, Match, onMount, Show, Switch, createSignal } from "solid-js";
import { t } from "../lib/i18n";
import { startTrialInPage, TerminusLicense } from "../features/settings/TerminusLicense";
import { Button } from "../ui/Button";
import { ConnectMachine } from "../features/machines/ConnectMachine";
import { type Answer, type Computer, listComputers } from "./computers";
import type { WebAccountsSource } from "../lib/platform";
import type { Session } from "./session";
import { BrowserAccount } from "./BrowserAccount";
import { AccessRequest } from "./auth/AccessRequest";

/** What stands between the page and the app: the session, the license, having a computer and a workspace linked to the account. */
export type GateView = { t: "waiting" } | { t: "license" } | { t: "access_required" } | { t: "no_account" } | { t: "not_yours" } | { t: "none" } | { t: "no_workspaces" } | { t: "error" };

/** The list with a token the API accepts: a refused token is refreshed once. */
export async function computersOf(endpoint: string, session: Session): Promise<Answer<Computer[]>> {
  const answer = await listComputers(endpoint, await session.getToken());
  if (answer.kind !== "unauthorized" || !(await session.unauthorized())) return answer;
  return listComputers(endpoint, await session.getToken());
}

/** Whether the account registry has a workspace (of `computer`, if given); a control plane without it says no. */
async function accountHasWorkspaces(endpoint: string, session: Session, computer?: string): Promise<boolean> {
  const answer = await listWorkspaces(endpoint, await session.getToken()).catch(() => null);
  if (answer?.kind !== "ok") return false;
  return hasAccountWorkspaces(computer ? answer.value.filter((w) => w.computers.includes(computer)) : answer.value);
}

/**
 * Opening is not intent to work: every computer of the person mounts as it is,
 * on or off, and wakes with the first action. `?computer=` opens only that one.
 */
export function Gate(props: { session: Session; endpoint: string; initial?: GateView; onOpen?: (computers: Computer[]) => void; accounts?: WebAccountsSource }) {
  const [view, setView] = createSignal<GateView>(props.initial ?? { t: "waiting" });

  async function load() {
    setView({ t: "waiting" });
    const answer = await computersOf(props.endpoint, props.session).catch((): Answer<Computer[]> => ({ kind: "unauthorized" }));
    if (answer.kind === "unauthorized") return;
    if (answer.kind === "license" || answer.kind === "no_account") return setView({ t: answer.kind });
    if (answer.kind === "error" && answer.status === 403 && answer.code === "access_required") return setView({ t: "access_required" });
    if (answer.kind !== "ok") return setView({ t: "error" });
    const computers = answer.value;
    const asked = new URLSearchParams(window.location.search).get("computer");
    if (asked) {
      const one = computers.find((c) => c.computer_id === asked);
      if (!one) return setView({ t: "not_yours" });
      const any = hasLinkedWorkspaces([one]) || (await accountHasWorkspaces(props.endpoint, props.session, asked));
      return any ? props.onOpen?.([one]) : setView({ t: "no_workspaces" });
    }
    if (computers.length === 0) return setView({ t: "none" });
    // Each computer shows only the workspaces linked to the account: with none there nor in the account, the app would be empty.
    if (!hasLinkedWorkspaces(computers) && !(await accountHasWorkspaces(props.endpoint, props.session))) return setView({ t: "no_workspaces" });
    props.onOpen?.(computers);
  }

  onMount(() => {
    if (!props.initial) void load();
  });

  const message = (text: string, action?: JSX.Element) => (
    <>
      <p class="m-0 max-w-[60ch] text-sm text-neutral-950">{text}</p>
      <Show when={action}>
        <div class="mt-6">{action}</div>
      </Show>
    </>
  );
  const retry = () => (
    <Button size="sm" variant="secondary" onClick={() => void load()}>
      {t("web.computers.retry")}
    </Button>
  );

  const openable = () => (props.accounts?.others() ?? []).filter((a) => a.signedIn && a.workspaces.length > 0);

  // Sobre la app ya montada (sin `onOpen`) solo una carga nueva vuelve a abrir las sesiones.
  const retryLicense = () => (props.onOpen ? void load() : window.location.reload());

  return (
    <main class="flex h-full flex-col overflow-y-auto bg-bg px-10 py-10" data-web-gate={view().t}>
      <h1 class="m-0 mb-5 text-3xl leading-tight font-display font-bold tracking-[-0.03em] text-neutral-950">{t("common.brand_name")}</h1>
      <BrowserAccount session={props.session} onChange={props.accounts ? () => props.accounts?.add() : undefined} />
      <Switch>
        <Match when={view().t === "waiting"}>
          <p class="m-0 text-sm text-neutral-500">{t("web.computers.waiting")}</p>
        </Match>
        <Match when={view().t === "license"}>
          <TerminusLicense onStart={startTrialInPage} onRetry={retryLicense} />
        </Match>
        <Match when={view().t === "access_required"}>
          {message(t("web.auth.access_required"))}
          <div class="mt-6 max-w-sm"><AccessRequest /></div>
        </Match>
        <Match when={view().t === "no_account"}>{message(t("web.computers.no_account"), retry())}</Match>
        <Match when={view().t === "not_yours"}>{message(t("web.computers.not_yours"))}</Match>
        <Match when={view().t === "none"}>
          {message(t("web.computers.none"))}
          {/* La primera máquina propia, sin salir de aquí: en línea, la puerta vuelve a leer y abre. */}
          <div class="mt-6 max-w-[60ch]" data-web-connect="">
            <ConnectMachine
              list={() => computersOf(props.endpoint, props.session)}
              onReady={() => void load()}
            />
          </div>
        </Match>
        <Match when={view().t === "no_workspaces"}>{message(t("web.computers.no_workspaces"), retry())}</Match>
        <Match when={view().t === "error"}>{message(t("web.computers.error"), retry())}</Match>
      </Switch>
      {/* Esta cuenta no abre (licencia, sin computadoras): las otras de este navegador sí pueden. */}
      <Show when={view().t !== "waiting" && openable().length > 0}>
        <div class="mt-8 max-w-[60ch]" data-web-gate-accounts="">
          <p class="m-0 mb-3 text-sm text-neutral-700">{t("web.computers.other_accounts")}</p>
          <div class="flex flex-wrap gap-2">
            <For each={openable()}>
              {(a) => (
                <Button size="sm" variant="secondary" onClick={() => props.accounts?.open(a.workspaces[0].id)}>
                  {t("web.computers.open_account", { email: a.email ?? a.user_id })}
                </Button>
              )}
            </For>
          </div>
        </div>
      </Show>
    </main>
  );
}
