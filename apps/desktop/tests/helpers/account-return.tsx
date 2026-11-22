import { elegirLengua } from "../../src/lib/i18n";
import "../../src/locales/catalogs";
import { createSignal } from "solid-js";
import { render } from "solid-js/web";
import { setCapabilities } from "../../src/lib/platform";
import AddWorkspaceMenu from "../../src/features/shell/AddWorkspaceMenu";
import { NewAccountTile } from "../../src/features/shell/NewAccountTile";
import { accountReturn, setNewAccountTiles } from "../../src/features/shell/account-return-state";
import { createSessionContexts } from "../../src/features/shell/session-contexts";
import { ToastStack } from "../../src/ui/Toast";

export function mountReturn(root: HTMLElement, language = "es") {
  elegirLengua(language);
  setCapabilities({ nativeWindow: true } as never);
  accountReturn.clear(); setNewAccountTiles([]);
  let finish: (value: unknown) => void = () => {};
  let reject: (cause: unknown) => void = () => {};
  let status = { state: "connected", sessions: [] as unknown[] };
  let starts = 0;
  const opened: string[] = [];
  const [rev, update] = createSignal(0);
  const sessions = createSessionContexts(async (name: string) => {
    if (name === "danil_session_status") return structuredClone(status) as never;
    if (name === "danil_sign_in") { starts++; return await new Promise((resolve, fail) => { finish = resolve; reject = fail; }) as never; }
    throw new Error(name);
  }, () => update((n) => n + 1));
  const [adoption, setAdoption] = createSignal<unknown>(null);
  let retries = 0;
  const rail = { sessions, groups: () => (rev(), sessions.groups()?.map((g) => ({ ...g, available: [{ id: "first" }, { id: "second" }], added: new Set(["first", "second"]) }))), adoptionReport: adoption, clearAdoptionReport: () => setAdoption(null), retryAdoption: () => { retries++; }, laterContext: () => null, menuNotice: () => false } as never;
  const dispose = render(() => <><ToastStack /><AddWorkspaceMenu sessions={rail} hidden={[]} open={null} tasksOf={() => []} badge={() => null} labelOf={() => ""} onOpen={(id) => opened.push(id)} onShow={() => {}} onRemove={() => {}} /><NewAccountTile id="first"><button data-workspace-tile="first"><span class="danil-mark" data-active="">First</span></button></NewAccountTile></>, root);
  return {
    opened, dispose, starts: () => starts, closes: () => Number(!root.ownerDocument.querySelector("[data-add-danil-step]")), retries: () => retries,
    success: (names = ["Acme"]) => { status = { state: "connected", sessions: [{ family: "new", email: "new@example.com", contexts: names.map((name, index) => ({ context_id: `ctx-${index}`, org: `org-${index}`, org_name: name, plan: "paid" })) }] }; finish(status); },
    fail: (detail: string) => reject({ detail }),
    adopt: (report: unknown) => setAdoption(report),
  };
}
