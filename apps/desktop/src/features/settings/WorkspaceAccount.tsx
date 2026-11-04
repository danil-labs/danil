/**
 * «En la nube», dentro de su tarjeta en Workspaces: con qué workspace de la nube se
 * sincroniza, subirlo o sincronizarlo si solo está aquí, cambiar a otro o
 * desvincularlo. Cambiar y desvincular se confirman. Chunk aparte.
 */
import "../../locales/danilPhrases";
import { type DirectoryEntry, groupDirectory } from "@terminus/computers";
import { createEffect, createSignal, For, on, onCleanup, Show } from "solid-js";
import { t } from "../../lib/i18n";
import { capabilities } from "../../lib/platform";
import { Button } from "../../ui/Button";
import { Select } from "../../ui/Select";
import { cn } from "../../lib/utils";
import { createDanilAccounts, type DanilAccounts } from "./danil-accounts";
import { said } from "./danil-session";
import {
  changeProblem,
  connectedSessions,
  defaultSession,
  type DanilSessionInfo,
  newSessionKey,
  sessionForWorkspace,
  sessionKey,
  setWorkspaceAccount,
  syncLine,
} from "./danil-sessions";
import { isTakenByAnother, linkCandidates, linkProblem } from "./workspace-link";
import { LICENSE_REQUIRED, requestAccessInBrowser, TerminusLicense } from "./TerminusLicense";
import { directoryErrorText } from "../shell/directory-errors";
import { cloudOf, linkableAccounts, linkActiveWorkspace, preferredAccount, reloadDirectory, uploadWorkspace } from "../shell/workspace-directory";

type Mode = "idle" | "choose" | "confirm-change" | "confirm-unlink";

const roleText = (role: string | null) => {
  if (role === "owner") return t("danil.workspace.role.owner");
  if (role === "admin") return t("danil.workspace.role.admin");
  if (role === "member") return t("danil.workspace.role.member");
  return role ?? "";
};

/**
 * `placement`: `card` en Workspaces; `section` dentro de Cuenta de Danil.
 */
export default function WorkspaceAccount(props: { workspace: string; name: string; placement?: "card" | "section"; onChanged?: (problem: string | null) => void; state?: DanilAccounts }) {
  const accounts = props.state ?? createDanilAccounts({ workspace: () => props.workspace });
  let generation = 0;
  let chooser = 0;
  onCleanup(() => {
    generation++;
    chooser++;
  });

  const [mode, setMode] = createSignal<Mode>("idle");
  const [entries, setEntries] = createSignal<DirectoryEntry[] | null>(null);
  const [chosen, setChosen] = createSignal<DirectoryEntry | null>(null);
  const [session, setSession] = createSignal<DanilSessionInfo | null>(null);
  const [saving, setSaving] = createSignal(false);
  const [problem, setProblem] = createSignal<string | null>(null);
  const [awaiting, setAwaiting] = createSignal(false);
  const [picked, setPicked] = createSignal<string | null>(null);
  const [cloudFailure, setCloudFailure] = createSignal<string | null>(null);
  let known: string[] = [];

  createEffect(on(() => props.workspace, () => {
    generation++;
    chooser++;
    reset();
  }, { defer: true }));

  function reset() {
    setMode("idle");
    setEntries(null);
    setChosen(null);
    setSession(null);
    setProblem(null);
    setPicked(null);
    setCloudFailure(null);
  }

  const source = () => capabilities().workspaceDirectory;
  const line = () => syncLine(accounts.of(), accounts.sessions());
  const hasAccount = () => Boolean(accounts.of()?.account);
  const adding = () => accounts.pending()?.status === "pending";
  const signedIn = () => connectedSessions(accounts.sessions());
  const message = () => problem() ?? accounts.problem();

  const lineText = () => {
    const l = line();
    if (l.kind === "synced") return t("danil.workspace.synced", { email: l.email });
    if (l.kind === "unlinked") return t("danil.workspace.unlinked", { email: l.email });
    if (l.kind === "none") return t("danil.workspace.no_account");
    return l.email ? t("danil.workspace.unsynced_account", { email: l.email }) : t("danil.workspace.unsynced");
  };

  /** Un código que el catálogo no conoce dice que no se pudo cambiar, no que falló iniciar sesión. */
  const problemText = (code: string) => {
    if (code === "taken") return t("danil.workspace.taken_error");
    if (code === "not_admin") return t("danil.workspace.not_admin");
    if (code === "directory_failed") return t("danil.workspace.directory_failed");
    if (code === "no_session") return t("danil.workspace.sign_in_to_link");
    const text = said(code);
    return code === "failed" || text === t("danil.account.failed") ? t("danil.workspace.failed") : text;
  };

  /** La sesión con la que se lee el directorio y se enlaza. */
  const currentSession = () => sessionForWorkspace(accounts.sessions(), accounts.of()) ?? defaultSession(accounts.sessions());

  async function signIn() {
    known = signedIn().map(sessionKey).filter((key): key is string => Boolean(key));
    setAwaiting(true);
    setProblem(null);
    await accounts.add();
  }

  // Lo que entra por el navegador no liga nada solo: abre la lista una vez.
  createEffect(on(accounts.sessions, (list) => {
    if (!awaiting() || !Array.isArray(list)) return;
    const key = newSessionKey(known, list);
    const next = key ? connectedSessions(list).find((s) => sessionKey(s) === key) ?? null : null;
    if (!next) return;
    setAwaiting(false);
    void openChooser(next);
  }, { defer: true }));

  async function openChooser(next: DanilSessionInfo) {
    const mine = ++chooser;
    setSession(next);
    setChosen(null);
    setEntries(null);
    setProblem(null);
    setMode("choose");
    const directory = source();
    if (!directory) return setEntries([]);
    try {
      const listing = await directory.list(sessionKey(next));
      if (mine === chooser && mode() === "choose") setEntries(listing.workspaces);
    } catch {
      if (mine !== chooser) return;
      setEntries([]);
      setProblem("directory_failed");
    }
  }

  function pick(entry: DirectoryEntry) {
    if (isTakenByAnother(entry, props.workspace)) {
      setProblem("taken");
      return;
    }
    setProblem(null);
    setChosen(entry);
    if (hasAccount()) {
      setMode("confirm-change");
      return;
    }
    void applyLink(entry);
  }

  async function applyLink(entry: DirectoryEntry) {
    const directory = source();
    const who = session();
    const key = who ? sessionKey(who) : null;
    if (!directory || entry.danil_workspace_id === null || !key) {
      setProblem("link_failed");
      return;
    }
    const mine = ++generation;
    setSaving(true);
    setProblem(null);
    try {
      await directory.link(props.workspace, entry.danil_workspace_id, key);
      const result = await setWorkspaceAccount(props.workspace, key);
      if (mine !== generation) return;
      accounts.setOf(result);
      if (result.error) {
        setProblem(linkProblem(result.error));
        setMode("choose");
        return;
      }
      props.onChanged?.(null);
      reset();
      reloadDirectory();
      void accounts.reload();
    } catch (e) {
      if (mine !== generation) return;
      setProblem(linkProblem(changeProblem(null, e)));
      setMode("choose");
    } finally {
      if (mine === generation) setSaving(false);
    }
  }

  async function change() {
    const entry = chosen();
    if (entry) await applyLink(entry);
  }

  async function unlink() {
    const mine = ++generation;
    setSaving(true);
    setProblem(null);
    try {
      // Primero en el plano de control, con la sesión de la persona; si falla, el motor no cambia.
      await source()?.unlink?.(props.workspace, accounts.of()?.account ?? null);
      const result = await setWorkspaceAccount(props.workspace, null);
      if (mine !== generation) return;
      accounts.setOf(result);
      props.onChanged?.(null);
      reset();
      reloadDirectory();
      void accounts.reload();
    } catch (e) {
      if (mine !== generation) return;
      setProblem(changeProblem(null, e));
    } finally {
      if (mine === generation) setSaving(false);
    }
  }

  // Con la cuenta del workspace con sesión aquí; `undefined` si el directorio no lo trae.
  const cloud = () => (line().kind === "synced" ? cloudOf(props.workspace) : undefined);
  const syncable = () => linkableAccounts(props.workspace);
  const target = () => preferredAccount(syncable(), picked());

  async function cloudAction(action: (who: string | null) => Promise<string | null>) {
    if (saving()) return;
    const mine = ++generation;
    setSaving(true);
    setCloudFailure(null);
    const code = await action(accounts.of()?.account ?? null);
    if (mine !== generation) return;
    setSaving(false);
    if (code) {
      setCloudFailure(code);
      if (code === "personal_workspace_exists") setPicked(null);
      return;
    }
    props.onChanged?.(null);
    void accounts.reload();
  }

  const title = (group: ReturnType<typeof groupDirectory>[number]) => {
    if (group.kind === "organization") return group.name;
    if (group.kind === "personal") return t("shell.directory.personal");
    return group.kind === "support" ? t("shell.directory.support") : t("shell.directory.unlinked");
  };

  const candidates = () => linkCandidates(entries() ?? [], props.workspace);

  return (
    <Show when={accounts.sessions() && accounts.of()}>
      <div
        class={cn("grid gap-1 text-xs", props.placement !== "section" && "pl-[27px]")}
        data-workspace-account={line().kind}
        data-workspace-cloud={cloud() === undefined ? undefined : cloud() ? "synced" : "local"}
      >
        <Show when={props.placement !== "section"}>
          <span class="text-neutral-500">{t("danil.workspace.title")}</span>
        </Show>
        <Show
          when={cloud() !== undefined}
          fallback={
            <p class="m-0 text-neutral-500" data-workspace-sync="">
              {lineText()}
            </p>
          }
        >
          <span class="flex items-center gap-1.5 text-neutral-950" data-workspace-sync="">
            <span class={cn("size-2 shrink-0 rounded-full", cloud() ? "bg-success-strong" : "bg-neutral-500")} aria-hidden="true" />
            {cloud() ? t("danil.workspace.cloud.synced", { name: cloud()?.name || t("shell.directory.unnamed") }) : t("danil.workspace.cloud.local")}
          </span>
          <Show when={cloud()}>
            {(entry) => (
              <p class="m-0 text-neutral-500">
                {/* El nombre de la nube manda al sincronizar; si aún difieren, se dice. */}
                {entry().name && entry().name !== props.name
                  ? t("danil.workspace.cloud.other_name", { local: props.name, cloud: entry().name })
                  : lineText()}
              </p>
            )}
          </Show>
        </Show>
        <Show when={cloud() === null}>
          <div class="mt-1 flex flex-wrap items-center gap-2">
            <Button size="sm" disabled={saving() || !source()?.create} data-workspace-cloud-upload="" onClick={() => void cloudAction((who) => uploadWorkspace(props.workspace, who))}>
              {t("danil.workspace.cloud.upload", { workspace: props.name })}
            </Button>
            <Show when={syncable().length}>
              <span class="text-neutral-500">{t("danil.workspace.cloud.or")}</span>
              <Select
                class="min-h-8 w-auto max-w-56"
                aria-label={t("danil.workspace.cloud.pick")}
                value={target()?.key ?? ""}
                disabled={saving()}
                data-workspace-cloud-pick=""
                onChange={(event) => setPicked(event.currentTarget.value)}
              >
                <For each={syncable()}>
                  {(entry) => (
                    <option value={entry.key} selected={entry.key === target()?.key}>
                      {entry.name || t("shell.directory.unnamed")}
                    </option>
                  )}
                </For>
              </Select>
              <Button
                size="sm"
                variant="outline"
                disabled={saving() || !target()}
                data-workspace-cloud-sync=""
                onClick={() => {
                  const entry = target();
                  if (entry) void cloudAction((who) => linkActiveWorkspace(props.workspace, entry, who));
                }}
              >
                {t("danil.workspace.cloud.sync")}
              </Button>
            </Show>
          </div>
          <Show when={cloudFailure()}>
            {(code) => (
              <p class="m-0 text-error-strong" role="alert">
                {directoryErrorText(code(), syncable().some((entry) => entry.kind === "personal"))}
              </p>
            )}
          </Show>
        </Show>
        <Show
          when={hasAccount()}
          fallback={
            <div class="flex flex-wrap items-center gap-2">
              <Show
                when={signedIn().length}
                fallback={
                  <Button size="sm" variant="outline" disabled={accounts.busy() || adding()} onClick={() => void signIn()}>
                    {t("danil.account.sign_in")}
                  </Button>
                }
              >
                <Button
                  size="sm"
                  variant="outline"
                  disabled={saving() || accounts.busy() || adding() || !source()}
                  onClick={() => {
                    const who = currentSession();
                    if (who) void openChooser(who);
                  }}
                  data-workspace-link-open=""
                >
                  {t("danil.workspace.link")}
                </Button>
              </Show>
            </div>
          }
        >
          <div class="flex flex-wrap items-center gap-2">
            {/* Solo aquí no hay con qué cambiar, pero el motor aún tiene la cuenta: desvincular sigue disponible. */}
            <Show when={cloud() !== null}>
              <Button
                size="sm"
                variant="outline"
                disabled={saving() || accounts.busy() || !source()}
                onClick={() => {
                  const who = currentSession();
                  if (who) void openChooser(who);
                }}
                data-workspace-change=""
              >
                {t("danil.workspace.change")}
              </Button>
            </Show>
            <Button
              size="sm"
              variant="ghost"
              disabled={saving() || accounts.busy()}
              onClick={() => {
                setProblem(null);
                setMode("confirm-unlink");
              }}
              data-workspace-unlink=""
            >
              {t("danil.workspace.unlink")}
            </Button>
          </div>
        </Show>

        <Show when={mode() === "choose" || mode() === "confirm-change"}>
          <div class="grid gap-1 rounded-md border border-border bg-surface p-2" data-workspace-link-chooser="">
            <p class="m-0 font-medium text-neutral-950">{t("danil.workspace.choose_title")}</p>
            <p class="m-0 text-neutral-500">{t("danil.workspace.choose_hint")}</p>
            <Show when={entries() === null}>
              <p class="m-0 text-neutral-500">{t("danil.account.loading")}</p>
            </Show>
            <Show when={entries() !== null && candidates().length === 0}>
              <p class="m-0 text-neutral-500">{t("danil.workspace.no_candidates")}</p>
            </Show>
            <For each={groupDirectory(candidates())}>
              {(group) => (
                <>
                  <p class="m-0 truncate text-caption text-neutral-500">{title(group)}</p>
                  <For each={group.entries}>
                    {(entry) => (
                      <button
                        type="button"
                        class="flex min-w-0 items-center gap-2 rounded-sm px-2 py-1 text-left outline-none hover:bg-surface-muted focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50"
                        data-workspace-link-option={entry.key}
                        data-taken={isTakenByAnother(entry, props.workspace) ? "" : undefined}
                        disabled={saving()}
                        onClick={() => pick(entry)}
                      >
                        <span class="min-w-0 flex-1 truncate">{entry.name || t("shell.directory.unnamed")}</span>
                        <span class="shrink-0 text-caption text-neutral-500">
                          {isTakenByAnother(entry, props.workspace)
                            ? t("danil.workspace.taken")
                            : roleText(entry.role)}
                        </span>
                      </button>
                    )}
                  </For>
                </>
              )}
            </For>
            <Button size="sm" variant="ghost" class="justify-self-start" onClick={() => reset()}>
              {t("danil.workspace.leave_no")}
            </Button>
          </div>
        </Show>

        <Show when={mode() === "confirm-change" && chosen()}>
          {(entry) => (
            <div class="grid gap-1 rounded-md border border-border bg-surface p-2" data-workspace-change-confirm="">
              <p class="m-0 text-neutral-950">{t("danil.workspace.change_confirm", { name: entry().name })}</p>
              <div class="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="secondary" disabled={saving()} onClick={() => void change()} data-workspace-change-yes="">
                  {t("danil.workspace.change_yes")}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setMode("choose")}>
                  {t("danil.workspace.leave_no")}
                </Button>
              </div>
            </div>
          )}
        </Show>

        <Show when={mode() === "confirm-unlink"}>
          <div class="flex flex-wrap items-center gap-2" data-workspace-leave="">
            <span class="text-neutral-500">{t("danil.workspace.leave_confirm", { email: accounts.of()?.email || "" })}</span>
            <Button size="sm" variant="secondary" disabled={saving()} onClick={() => void unlink()} data-workspace-leave-yes="">
              {t("danil.workspace.unlink")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setMode("idle")}>
              {t("danil.workspace.leave_no")}
            </Button>
          </div>
        </Show>

        <Show when={adding()}>
          <p class="m-0 text-neutral-500" data-workspace-adding="">
            {t("danil.account.pending", { code: accounts.pending()?.user_code ?? "" })}{" "}
            <button type="button" class="cursor-pointer border-0 bg-transparent p-0 text-xs text-primary underline" onClick={accounts.reopen}>
              {t("danil.account.open_again")}
            </button>
          </p>
        </Show>
        <Show when={message() === LICENSE_REQUIRED}>
          <TerminusLicense onRequest={requestAccessInBrowser} onRetry={() => void signIn()} busy={accounts.busy()} compact />
        </Show>
        <Show when={message() !== LICENSE_REQUIRED && message()}>
          {(code) => (
            <p class="m-0 text-error-strong" role="alert">
              {problemText(code())}
            </p>
          )}
        </Show>
      </div>
    </Show>
  );
}
