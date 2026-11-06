/**
 * Configuración → Secretos: las variables de entorno que el motor da a los
 * agentes (`env_secret`). Solo escritura: se ven nombre, alcance, fecha, los
 * últimos 4 y las máquinas; el valor nunca vuelve a la pantalla.
 *
 * - La ventana lee y escribe por el motor (`env_secrets_list`, `env_secret_set`,
 *   `env_secret_remove`, extensión `secrets_v1`); con el workspace en la cuenta el
 *   motor sube él mismo la copia sellada.
 * - La web escribe sellando en el navegador (`PUT …/credentials`), nunca por el relay.
 *
 * Trozo perezoso: lo carga quien abre la sección.
 */
import "../../locales/danilPhrases";
import { type Credential, type CredentialMachine, credentialMachines, credentialSlot, envSecretNameProblem, envSecretOf } from "@terminus/computers";
import { createEffect, createMemo, createResource, createSignal, For, Match, on, onMount, Show, Switch } from "solid-js";
import { unknownCommand } from "../../lib/errorCode.ts";
import { df } from "../../lib/format";
import { t } from "../../lib/i18n";
import { invoke } from "../../lib/invoke.ts";
import type { Project } from "../../lib/model";
import { capabilities } from "../../lib/platform";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { Dialog, DialogContent, DialogTitle } from "../../ui/Dialog";
import { EmptyState } from "../../ui/EmptyState";
import { type Failure, FailureNote } from "../../ui/Failure";
import { Input } from "../../ui/Input";
import { KeyedList } from "../../ui/KeyedList";
import { Select } from "../../ui/Select";
import { Skeleton } from "../../ui/Skeleton";
import { Spinner } from "../../ui/Spinner";
import { CredentialMachines, LocalKeysBanner } from "./credentials/AccountCredentials";
import { act, credentialsBackend, credentialsView, failureOf, reloadCredentials } from "./credentials/store";
import { SettingsBlock, SettingsPanel, SettingsSection } from "./layout";
import { machines } from "../machines/store";
import { secretsRoute } from "./secrets-support";
import { noSecretRecipients, saveEnvSecret } from "./secrets-save";

const NAME_PROBLEM = {
  empty: () => t("danil.secrets.name_empty"),
  grammar: () => t("danil.secrets.name_grammar"),
  reserved: (name: string) => t("danil.secrets.name_reserved", { name }),
} as const;

const openSettings = (panel: string) => window.dispatchEvent(new CustomEvent("harness:open-settings", { detail: panel }));

/** Lo que el motor de esta máquina tiene en su bóveda (`env_secrets_list`), sin valores. */
type EngineSecret = { slot: string; folder: string; name: string; hint: string | null; in_account: boolean };
type EngineSecrets = { kind: "ready"; secrets: EngineSecret[] } | { kind: "unsupported" } | { kind: "failed"; failure: Failure };

/** Un secreto en pantalla: el de esta máquina, el de la cuenta, o los dos con el mismo slot. */
type SecretRow = { slot: string; folder: string | null; name: string; hint: string | null; local: boolean; credential: Credential | null };

const machineLabel = (m: Pick<CredentialMachine, "computer_id" | "name">) => m.name?.trim() || capabilities().machineName?.(m.computer_id) || m.computer_id;
const viaEngine = () => credentialsBackend().where === "engine";
const route = () => secretsRoute(credentialsBackend().where, machines());

/** Lo que se escribe en el nombre: mayúsculas, y espacio o guion como `_`. */
export const normalizeSecretName = (raw: string) => raw.toUpperCase().replace(/[\s-]/g, "_");

function updatedOf(row: SecretRow): string | null {
  const at = row.credential?.updated_at ?? row.credential?.created_at;
  const date = at ? new Date(at) : null;
  return date && !Number.isNaN(date.getTime()) ? df({ dateStyle: "medium" }).format(date) : null;
}

async function readEngineSecrets(): Promise<EngineSecrets> {
  try {
    const answer = await invoke<{ secrets?: EngineSecret[] } | null>("env_secrets_list");
    return { kind: "ready", secrets: Array.isArray(answer?.secrets) ? answer.secrets : [] };
  } catch (e) {
    return unknownCommand(e) ? { kind: "unsupported" } : { kind: "failed", failure: failureOf(e) };
  }
}

/** Una fila: nombre en mono, los últimos 4, fecha, Cambiar y Borrar, y sus máquinas. */
function SecretItem(props: { row: SecretRow; overrides: boolean; onChange: () => void; onChanged: () => void }) {
  const [deleting, setDeleting] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [failure, setFailure] = createSignal<Failure | null>(null);
  const unsupported = createMemo(() => (props.row.credential ? credentialMachines(props.row.credential).filter((m) => m.state === "unsupported") : []));
  const pending = () => !!props.row.credential?.machines.some((m) => m.state === "pending");
  let cancelButton: HTMLButtonElement | undefined;

  async function remove() {
    setBusy(true);
    setFailure(null);
    let f: Failure | null = null;
    if (viaEngine() && props.row.local) {
      try {
        await invoke("env_secret_remove", { folder: props.row.folder ?? "*", name: props.row.name });
      } catch (e) {
        f = failureOf(e);
      }
    }
    const credential = props.row.credential;
    if (!f && credential) f = await act((b, ws) => b.remove(ws, credential.id));
    setBusy(false);
    setFailure(f);
    if (!f) setDeleting(false);
    props.onChanged();
  }

  return (
    <SettingsBlock data-secret={props.row.slot}>
      <div class="flex min-w-0 items-center gap-2">
        <span class="min-w-0 truncate font-mono text-ui text-neutral-950">{props.row.name}</span>
        <Show when={props.row.hint}>{(hint) => <Badge forma="dato">{`••••${hint()}`}</Badge>}</Show>
        <span class="flex-1" />
        <Button variant="ghost" size="compact" onClick={() => props.onChange()}>
          {t("danil.secrets.change")}
        </Button>
        <Button
          variant="ghost"
          size="compact"
          class="hover:text-error-strong"
          onClick={() => {
            setDeleting(true);
            queueMicrotask(() => cancelButton?.focus());
          }}
        >
          {t("danil.secrets.delete")}
        </Button>
      </div>
      <Show when={updatedOf(props.row)}>{(at) => <p class="m-0 text-xs text-neutral-500">{t("danil.secrets.updated", { date: at() })}</p>}</Show>
      <Show when={props.overrides}>
        <p class="m-0 text-xs text-neutral-500">{t("danil.secrets.overrides")}</p>
      </Show>
      <Show when={deleting()}>
        <div class="grid gap-2 rounded-md border border-border bg-surface-muted px-3 py-2" data-delete-warning="">
          <p class="m-0 text-xs text-neutral-950">{props.row.credential ? t("danil.secrets.delete_warning") : t("danil.secrets.delete_warning_local")}</p>
          <div class="flex justify-end gap-2">
            <Button ref={cancelButton} variant="outline" size="compact" disabled={busy()} onClick={() => setDeleting(false)}>
              {t("danil.credentials.cancel")}
            </Button>
            <Button variant="danger" size="compact" disabled={busy()} onClick={() => void remove()}>
              {t("danil.secrets.delete_yes")}
            </Button>
          </div>
        </div>
      </Show>
      <Show when={failure()}>{(f) => <FailureNote f={f()} />}</Show>
      <Show when={props.row.credential}>{(c) => <CredentialMachines credential={c()} />}</Show>
      <Show when={pending()}>
        <p class="m-0 text-xs text-neutral-500" data-secret-pending-help="">{t("danil.secrets.pending_help")}</p>
      </Show>
      <For each={unsupported()}>
        {(m) => (
          <p class="m-0 text-xs text-neutral-500" data-secret-unsupported-help={m.computer_id}>
            {t("danil.secrets.unsupported_help", { machine: machineLabel(m) })}
          </p>
        )}
      </For>
    </SettingsBlock>
  );
}

/**
 * Añadir o cambiar. En la ventana va al motor; en la web se sella aquí para cada
 * máquina con `secrets_v1`. Con un nombre que ya existe, solo «Reemplazar» lo pisa.
 */
function SecretDialog(props: { rows: SecretRow[]; folders: Project[]; initial: { name: string; folder: string | null } | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = createSignal(props.initial?.name ?? "");
  const [value, setValue] = createSignal("");
  const [folder, setFolder] = createSignal<string | null>(props.initial?.folder ?? null);
  const [busy, setBusy] = createSignal(false);
  const [failure, setFailure] = createSignal<Failure | null>(null);
  const problem = () => (name() ? envSecretNameProblem(name()) : null);
  const slot = () => credentialSlot.envSecret(folder(), name());
  const existing = () => props.rows.find((r) => r.slot === slot());
  const valid = () => route() !== "unsupported" && !!value() && !envSecretNameProblem(name()) && !noSecretRecipients();

  async function save(e: Event) {
    e.preventDefault();
    if (busy() || !valid()) return;
    setBusy(true);
    setFailure(null);
    const f = await saveEnvSecret({ folder: folder(), name: name(), value: value(), replace: !!existing() });
    setBusy(false);
    setFailure(f);
    if (!f) {
      setValue("");
      props.onSaved();
      props.onClose();
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !busy() && props.onClose()}>
      <DialogContent class="w-[min(460px,100%)] max-w-[460px] p-4" aria-label={props.initial ? t("danil.secrets.change_title") : t("danil.secrets.add_title")}>
        <form class="grid gap-3" onSubmit={(e) => void save(e)} data-secret-add="">
          <DialogTitle>{props.initial ? t("danil.secrets.change_title") : t("danil.secrets.add_title")}</DialogTitle>
          <div class="grid gap-1">
            <label for="secret-name" class="text-xs font-semibold">
              {t("danil.secrets.name")}
            </label>
            <Input
              id="secret-name"
              class="font-mono"
              autocomplete="off"
              spellcheck={false}
              autofocus={!props.initial}
              disabled={busy() || !!props.initial}
              placeholder={t("danil.secrets.name_placeholder")}
              aria-invalid={!!problem()}
              aria-describedby={problem() ? "secret-name-problem" : undefined}
              value={name()}
              onInput={(e) => setName(normalizeSecretName(e.currentTarget.value))}
            />
            <Show when={problem()}>
              {(p) => (
                <div id="secret-name-problem" class="flex flex-wrap items-center gap-x-2 text-xs text-error-strong" data-secret-name-problem={p()}>
                  <span>{NAME_PROBLEM[p()](name())}</span>
                  <Show when={p() === "reserved"}>
                    <Button
                      type="button"
                      variant="ghost"
                      size="compact"
                      onClick={() => {
                        props.onClose();
                        openSettings("proveedores-ia");
                      }}
                    >
                      {t("danil.secrets.go_ai_providers")}
                    </Button>
                  </Show>
                </div>
              )}
            </Show>
            <Show when={!problem() && existing()}>
              {(r) => (
                <p class="m-0 text-xs text-warning-strong" data-secret-exists="">
                  {t("danil.secrets.exists", { name: name(), hint: r().hint ? `••••${r().hint}` : "••••", date: updatedOf(r()) ?? "—" })}
                </p>
              )}
            </Show>
          </div>
          <div class="grid gap-1">
            <label for="secret-value" class="text-xs font-semibold">
              {t("danil.secrets.value")}
            </label>
            <Input
              id="secret-value"
              type="password"
              autocomplete="off"
              spellcheck={false}
              autocapitalize="off"
              autofocus={!!props.initial}
              disabled={busy()}
              placeholder={t("danil.secrets.value_placeholder")}
              value={value()}
              onInput={(e) => setValue(e.currentTarget.value)}
            />
          </div>
          <div class="grid gap-1">
            <label for="secret-scope" class="text-xs font-semibold">
              {t("danil.secrets.scope")}
            </label>
            <Select
              id="secret-scope"
              disabled={busy() || !!props.initial}
              value={folder() ?? "*"}
              onChange={(e) => setFolder(e.currentTarget.value === "*" ? null : e.currentTarget.value)}
            >
              <option value="*">{t("danil.secrets.scope_workspace")}</option>
              <For each={props.folders}>{(p) => <option value={p.id}>{t("danil.secrets.scope_folder", { folder: p.name })}</option>}</For>
            </Select>
            <p class="m-0 text-xs text-neutral-500">{t("danil.secrets.scope_help")}</p>
          </div>
          <p class="m-0 border-t border-border pt-3 text-xs text-neutral-500">{t("danil.secrets.add_help")}</p>
          <Show when={noSecretRecipients()}>
            <p class="m-0 text-xs text-warning-strong" data-secret-no-recipients="">
              {t("danil.secrets.no_recipients")}
            </p>
          </Show>
          <Show when={failure()}>{(f) => <FailureNote f={f()} />}</Show>
          <div class="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={busy()} onClick={props.onClose}>
              {t("danil.credentials.cancel")}
            </Button>
            <Button type="submit" disabled={busy() || !valid()}>
              <Show when={busy()} fallback={existing() ? t("danil.secrets.replace") : t("danil.secrets.save")}>
                <Spinner size={12} />
                {t("danil.secrets.saving")}
              </Show>
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** «Solo en esta máquina»: el workspace no está en una cuenta de Danil. */
function ModeLine() {
  return (
    <div class="flex items-center gap-2 py-2" data-secrets-mode="no_session">
      <Badge>{t("danil.secrets.mode_local")}</Badge>
      <p class="m-0 min-w-0 flex-1 text-xs text-neutral-500">{t("danil.secrets.mode_no_session")}</p>
      <Show when={capabilities().danilAccount || capabilities().accountProfile}>
        <Button variant="ghost" size="compact" onClick={() => openSettings("cuenta-danil")}>
          {t("danil.secrets.sign_in")}
        </Button>
      </Show>
    </div>
  );
}

export default function Secrets() {
  onMount(() => void reloadCredentials(false));
  const [editing, setEditing] = createSignal<{ name: string; folder: string | null } | null | undefined>(undefined);
  // El foco vuelve a quien abrió el diálogo: «Añadir secreto» o el «Cambiar» de su fila.
  let opener: HTMLElement | null = null;
  const edit = (what: { name: string; folder: string | null } | null) => {
    opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setEditing(what);
  };
  // Las carpetas del workspace, para elegir alcance y nombrar los grupos; sin lista se ve el id.
  const [folders] = createResource(() => invoke<Project[]>("list_projects").catch(() => [] as Project[]), { initialValue: [] });
  const folderName = (id: string) => folders().find((p) => p.id === id)?.name ?? id;
  const [engine, { refetch: rereadEngine }] = createResource(route, (target) => target === "worker"
    ? Promise.resolve(null)
    : target === "unsupported" ? Promise.resolve<EngineSecrets>({ kind: "unsupported" }) : readEngineSecrets());
  createEffect(on(route, () => setEditing(undefined), { defer: true }));

  const rows = createMemo((): SecretRow[] => {
    const v = credentialsView();
    const account = v.kind === "ready" ? v.listing.credentials.filter((c) => c.kind === "env_secret" && envSecretOf(c.slot)) : [];
    const by = new Map<string, SecretRow>();
    const local = engine();
    if (local?.kind === "ready")
      for (const s of local.secrets) by.set(s.slot, { slot: s.slot, folder: s.folder === "*" ? null : s.folder, name: s.name, hint: s.hint, local: true, credential: null });
    for (const c of account) {
      const parsed = envSecretOf(c.slot)!;
      const mine = by.get(c.slot);
      by.set(c.slot, { slot: c.slot, folder: parsed.folder, name: parsed.name, hint: mine?.hint ?? c.hint, local: !!mine, credential: c });
    }
    return [...by.values()];
  });
  /** El workspace primero; luego cada carpeta por nombre, y dentro, por nombre de variable. */
  const groups = createMemo(() => {
    const by = new Map<string | null, SecretRow[]>();
    for (const r of rows()) by.set(r.folder, [...(by.get(r.folder) ?? []), r]);
    return [...by.entries()]
      .sort(([a], [b]) => (a === null ? -1 : b === null ? 1 : folderName(a).localeCompare(folderName(b))))
      .map(([folder, items]) => ({ folder, items: items.sort((x, y) => x.name.localeCompare(y.name)) }));
  });
  const workspaceNames = createMemo(() => new Set(groups().find((g) => g.folder === null)?.items.map((r) => r.name) ?? []));
  const failure = () => {
    const e = engine();
    if (e?.kind === "failed") return e.failure;
    const v = credentialsView();
    return v.kind === "failed" ? v.failure : null;
  };
  const engineState = () => engine()?.kind ?? null;
  const loading = () => (viaEngine() ? engine.loading : credentialsView().kind === "loading");
  const canWrite = () => (viaEngine() ? route() !== "unsupported" && !engine.loading && engineState() === "ready" : credentialsView().kind === "ready" && !!credentialsBackend().create);
  const reread = () => {
    void reloadCredentials();
    if (viaEngine()) void rereadEngine();
  };

  return (
    <SettingsPanel data-settings-secrets="">
      <SettingsSection
        title={t("danil.secrets.title")}
        description={t("danil.secrets.description")}
        aside={
          <Show when={canWrite()}>
            <Button variant="secondary" size="sm" onClick={() => edit(null)}>
              {t("danil.secrets.add")}
            </Button>
          </Show>
        }
      >
        <Switch>
          <Match when={loading()}>
            <Skeleton filas={3} class="h-[52px]" />
          </Match>
          <Match when={engineState() === "unsupported"}>
            <div class="mt-2 grid gap-1 rounded-md border border-border bg-surface-raised px-3 py-2.5" data-secrets-unsupported="">
              <p class="m-0 text-ui font-semibold">{t("danil.secrets.engine_unsupported")}</p>
              <p class="m-0 text-xs text-neutral-500">{t("danil.secrets.engine_unsupported_help")}</p>
            </div>
          </Match>
          <Match when={true}>
            <div class="grid min-w-0 gap-1 pt-2">
              <Show when={credentialsView().kind === "none"}>
                <ModeLine />
              </Show>
              <Show when={failure()}>
                {(f) => (
                  <div class="grid gap-2">
                    <FailureNote f={f()} />
                    <div>
                      <Button variant="ghost" size="compact" onClick={reread}>
                        {t("danil.secrets.retry")}
                      </Button>
                    </div>
                  </div>
                )}
              </Show>
              <Show when={credentialsView().kind === "ready"}>
                <LocalKeysBanner kinds={["env_secret"]} />
              </Show>
              <Show
                when={rows().length > 0}
                fallback={
                  <Show when={canWrite()}>
                    <EmptyState class="mt-2" title={t("danil.secrets.empty_title")} description={t("danil.secrets.empty_help")} data-secrets-empty="" />
                  </Show>
                }
              >
                <KeyedList each={groups()} by={(g) => g.folder ?? "*"}>
                  {(g) => (
                    <div class="grid min-w-0" data-secrets-group={g().folder ?? "*"}>
                      <p class="m-0 pt-3 text-ui font-semibold">
                        {g().folder === null ? t("danil.secrets.scope_workspace") : t("danil.secrets.scope_folder", { folder: folderName(g().folder!) })}
                      </p>
                      <KeyedList each={g().items} by={(r) => r.slot}>
                        {(r) => (
                          <SecretItem
                            row={r()}
                            overrides={g().folder !== null && workspaceNames().has(r().name)}
                            onChange={() => edit({ name: r().name, folder: r().folder })}
                            onChanged={reread}
                          />
                        )}
                      </KeyedList>
                    </div>
                  )}
                </KeyedList>
              </Show>
            </div>
          </Match>
        </Switch>
      </SettingsSection>
      <Show when={canWrite() && editing() !== undefined}>
        <SecretDialog
          rows={rows()}
          folders={folders()}
          initial={editing() ?? null}
          onSaved={reread}
          onClose={() => {
            setEditing(undefined);
            opener?.focus();
          }}
        />
      </Show>
    </SettingsPanel>
  );
}
