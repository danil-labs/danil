import { WslMachineRows } from "./WslMachine";
import {
  type Answer,
  type Computer,
  COMPUTER_NAME_MAX,
  listComputers,
  listWorkspaces,
  orderComputers,
  renameComputer,
  wakes,
} from "@terminus/computers";
import Pencil from "lucide-solid/icons/pencil";
import { createSignal, For, onMount, Show } from "solid-js";
import { df } from "../../lib/format";
import { t } from "../../lib/i18n";
import { invoke } from "../../lib/invoke";
import { capabilities, type AccountComputersSource } from "../../lib/platform";
import { isMac } from "../../lib/window";
import { Button } from "../../ui/Button";
import { Input } from "../../ui/Input";
import { SettingsBlock, SettingsRow, SettingsSection } from "../settings/layout";
import { workspaceComputersSource } from "./workspace-computers";
import { machineNamesChanged } from "./store";

/**
 * Dónde se leen y renombran las computadoras: lo que da la plataforma (la web)
 * o, en el escritorio, el token de cliente de esa cuenta.
 */
export function accountComputersSource(account: string | null = null): AccountComputersSource | null {
  const given = capabilities().accountComputers;
  if (given) return given;
  if (!capabilities().danilAccount) return null;
  const client = () => invoke<{ token: string; endpoint: string }>("account_relay_token", account ? { account } : {}).catch(() => null);
  return {
    workspaces: async () => {
      const c = await client();
      return c ? listWorkspaces(c.endpoint, c.token) : { kind: "error", status: null };
    },
    list: async () => {
      const c = await client();
      return c ? listComputers(c.endpoint, c.token) : { kind: "error", status: null };
    },
    rename: async (id, name) => {
      const c = await client();
      return c ? renameComputer(c.endpoint, c.token, id, name) : { kind: "error", status: null };
    },
    // La flota del escritorio vuelve a leer la cuenta (`account.tsx`) y toma el nombre nuevo.
    onRenamed: () => window.dispatchEvent(new CustomEvent("harness:account-computers")),
  };
}

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

function seenAt(iso: string | null | undefined): string | null {
  const at = iso ? new Date(iso) : null;
  if (!at || Number.isNaN(at.getTime())) return null;
  return sameDay(at, new Date()) ? df({ timeStyle: "short" }).format(at) : df({ dateStyle: "short", timeStyle: "short" }).format(at);
}

/** Por qué no se guardó el nombre, en palabras de la persona. */
function renameFailure(answer: Exclude<Answer<unknown>, { kind: "ok" }>): string {
  if (answer.kind === "missing") return t("danil.computers.rename_failed.not_found");
  if (answer.kind === "unauthorized") return t("danil.computers.rename_failed.unauthorized");
  if (answer.kind === "error" && answer.code === "invalid_name") return t("danil.computers.rename_failed.invalid_name", { max: COMPUTER_NAME_MAX });
  if (answer.kind === "error" && answer.status === null) return t("danil.computers.rename_failed.offline");
  return t("danil.computers.rename_failed.other");
}

/** Por qué no se quitó la máquina, en palabras de la persona. */
function removeFailure(answer: Exclude<Answer<unknown>, { kind: "ok" | "missing" }>): string {
  if (answer.kind === "unauthorized") return t("danil.computers.remove_failed.unauthorized");
  if (answer.kind === "error" && answer.code === "not_self_computer") return t("danil.computers.remove_failed.managed");
  if (answer.kind === "error" && answer.status === null) return t("danil.computers.rename_failed.offline");
  return t("danil.computers.remove_failed.other");
}

export type AccountComputersProps = {
  source: AccountComputersSource;
  empty?: string;
  /** La computadora de esta ventana, si es una de la cuenta. */
  self?: string | null;
  /** El nombre de la de esta ventana cambió aquí. */
  onSelfName?: (name: string) => void;
};

/** Las computadoras de la cuenta: tipo, estado y el nombre, que se edita en su sitio. */
export function AccountComputers(props: AccountComputersProps) {
  const [list, setList] = createSignal<Computer[] | null>(null);
  const [failed, setFailed] = createSignal<"missing" | "failed" | null>(null);
  const [editing, setEditing] = createSignal<string | null>(null);
  const [draft, setDraft] = createSignal("");
  const [saving, setSaving] = createSignal(false);
  const [problem, setProblem] = createSignal<{ id: string; text: string } | null>(null);
  const [confirming, setConfirming] = createSignal<string | null>(null);
  const [removing, setRemoving] = createSignal(false);

  async function load() {
    setList(null);
    setFailed(null);
    setEditing(null);
    const answer = await props.source.list().catch(() => null);
    if (answer?.kind === "ok") {
      setList(orderComputers(answer.value));
    } else setFailed(answer?.kind === "missing" ? "missing" : "failed");
  }
  onMount(() => void load());

  const nameOf = (c: Computer) => c.name?.trim() || c.computer_id;
  const isSelf = (c: Computer) => !!props.self && c.computer_id === props.self;
  // Una apagada que ya no existe (un clon, una laptop vendida) se queda en la cuenta hasta que alguien la quita.
  const canRemove = (c: Computer) => !!props.source.remove && !isSelf(c) && c.state !== "online" && c.state !== "starting";

  const kind = (c: Computer) =>
    isSelf(c)
      ? isMac()
        ? t("danil.computers.kind.this_mac")
        : t("danil.computers.kind.this_pc")
      : wakes(c)
        ? t("danil.computers.kind.managed")
        : t("danil.computers.kind.own");

  const status = (c: Computer) => {
    if (c.state === "online") return t("danil.computers.state.online");
    if (c.state === "starting") return t("danil.computers.state.starting");
    const seen = seenAt(c.last_seen);
    return seen ? t("danil.computers.state.off_seen", { time: seen }) : t("danil.computers.state.off");
  };

  function edit(c: Computer) {
    setProblem(null);
    setDraft(nameOf(c));
    setEditing(c.computer_id);
  }

  async function save(c: Computer) {
    const name = draft().trim();
    if (saving() || !props.source.rename) return;
    if (name === nameOf(c)) return setEditing(null);
    if (!name || name.length > COMPUTER_NAME_MAX) {
      setProblem({ id: c.computer_id, text: t("danil.computers.rename_failed.invalid_name", { max: COMPUTER_NAME_MAX }) });
      return;
    }
    setSaving(true);
    const answer = await props.source.rename(c.computer_id, name).catch(() => ({ kind: "error", status: null }) as const);
    setSaving(false);
    if (answer.kind !== "ok") {
      setProblem({ id: c.computer_id, text: renameFailure(answer) });
      return;
    }
    setList((rows) => rows?.map((r) => (r.computer_id === c.computer_id ? { ...r, name: answer.value.name } : r)) ?? rows);
    setEditing(null);
    setProblem(null);
    if (isSelf(c)) props.onSelfName?.(answer.value.name);
    props.source.onRenamed(c.computer_id, answer.value.name);
    machineNamesChanged();
  }

  async function remove(c: Computer) {
    const remove = props.source.remove;
    if (!remove || removing()) return;
    setRemoving(true);
    const answer = await remove(c.computer_id).catch(() => ({ kind: "error", status: null }) as const);
    setRemoving(false);
    // `missing`: ya no estaba en la cuenta; el resultado es el mismo.
    if (answer.kind !== "ok" && answer.kind !== "missing") {
      setProblem({ id: c.computer_id, text: removeFailure(answer) });
      return;
    }
    setConfirming(null);
    setProblem(null);
    setList((rows) => rows?.filter((r) => r.computer_id !== c.computer_id) ?? rows);
    props.source.onRemoved?.(c.computer_id);
    machineNamesChanged();
  }

  return (
    <div class="grid min-w-0" data-account-computers={list() === null ? (failed() ?? "loading") : list()?.length}>
      <Show when={list() === null}>
        <SettingsBlock>
          <p class="m-0 text-sm text-neutral-500">{failed() === "missing" ? t("danil.computers.workspace_missing") : failed() ? t("danil.computers.load_failed") : t("danil.computers.loading")}</p>
          <Show when={failed()}>
            <Button size="sm" variant="secondary" class="justify-self-start" onClick={() => void load()}>{t("danil.workspace.retry")}</Button>
          </Show>
        </SettingsBlock>
      </Show>
      <Show when={list()?.length === 0}>
        <SettingsBlock>
          <p class="m-0 text-sm text-neutral-500">{props.empty ?? t("danil.computers.empty")}</p>
        </SettingsBlock>
      </Show>
      <For each={list() ?? []}>
        {(c) => (
          <SettingsRow
            data-account-computer={c.computer_id}
            data-self={isSelf(c) ? "" : undefined}
            label={
              <Show
                when={editing() === c.computer_id}
                fallback={
                  <button
                    type="button"
                    class="group flex max-w-full min-w-0 items-center gap-1.5 rounded-sm text-left hover:text-neutral-950"
                    title={t("danil.computers.rename")}
                    aria-label={t("danil.computers.rename_label", { name: nameOf(c) })}
                    disabled={!props.source.rename}
                    onClick={() => edit(c)}
                    data-computer-name=""
                  >
                    <span class="truncate">{nameOf(c)}</span>
                    <Show when={isSelf(c)}>
                      <span class="shrink-0 text-neutral-500">{t("danil.computers.this_one")}</span>
                    </Show>
                    <Show when={props.source.rename}><Pencil size={12} class="shrink-0 text-neutral-500 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden="true" /></Show>
                  </button>
                }
              >
                <form
                  class="max-w-sm"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void save(c);
                  }}
                >
                  <Input
                    ref={(el) => {
                      // En el elemento y no delegado: el Dialog de Configuración escucha Esc en `document` y se cerraría antes.
                      el.addEventListener("keydown", (e) => {
                        if (e.key !== "Escape") return;
                        e.preventDefault();
                        e.stopPropagation();
                        setEditing(null);
                        setProblem(null);
                      });
                      queueMicrotask(() => (el.focus(), el.select()));
                    }}
                    class="h-7 min-h-7 px-1.5 text-ui"
                    maxlength={COMPUTER_NAME_MAX}
                    value={draft()}
                    disabled={saving()}
                    data-owns-escape
                    data-computer-name-input=""
                    aria-label={t("danil.computers.rename_label", { name: nameOf(c) })}
                    aria-invalid={problem()?.id === c.computer_id ? "true" : undefined}
                    onInput={(e) => setDraft(e.currentTarget.value)}
                  />
                </form>
              </Show>
            }
            description={
              <>
                <span data-computer-kind="">{kind(c)}</span>
                {" · "}
                <span data-computer-state="">{status(c)}</span>
                <Show when={problem()?.id === c.computer_id}>
                  <span class="block text-error-strong" role="alert" data-rename-error="">
                    {problem()?.text}
                  </span>
                </Show>
              </>
            }
          >
            <Show when={canRemove(c)}>
              <Show
                when={confirming() === c.computer_id}
                fallback={
                  <Button
                    size="sm"
                    variant="outline"
                    data-computer-remove=""
                    aria-label={t("danil.computers.remove_label", { name: nameOf(c) })}
                    onClick={() => {
                      setProblem(null);
                      setConfirming(c.computer_id);
                    }}
                  >
                    {t("danil.computers.remove")}
                  </Button>
                }
              >
                <div class="flex shrink-0 items-center gap-2" data-computer-remove-confirm="">
                  <span class="text-sm text-neutral-500">{t("danil.computers.remove_confirm")}</span>
                  <Button size="sm" variant="danger" disabled={removing()} onClick={() => void remove(c)}>
                    {t("danil.computers.remove")}
                  </Button>
                  <Button size="sm" variant="ghost" disabled={removing()} onClick={() => setConfirming(null)}>
                    {t("danil.computers.remove_cancel")}
                  </Button>
                </div>
              </Show>
            </Show>
          </SettingsRow>
        )}
      </For>
    </div>
  );
}

/** Configuración → Cuenta de Danil: las computadoras de la cuenta, con su propia sección. */
export function AccountComputersSection(props: {
  account?: string | null;
  workspace?: string;
  /** Con varias cuentas, de quién son. */
  owner?: string | null;
  self?: string | null;
  onSelfName?: (name: string) => void;
}) {
  const accountSource = accountComputersSource(props.account ?? null);
  const source = accountSource?.workspaces && props.workspace ? workspaceComputersSource(accountSource, props.workspace) : accountSource;
  return (
    <Show when={source}>
      {(s) => (
        <SettingsSection
          title={props.workspace ? t("danil.computers.workspace_title") : props.owner ? t("danil.computers.title_of", { account: props.owner }) : t("danil.computers.title")}
          description={props.workspace ? t("danil.computers.workspace_description") : t("danil.computers.description")}
        >
          <AccountComputers source={s()} self={props.self} onSelfName={props.onSelfName} empty={props.workspace ? t("danil.computers.workspace_empty") : undefined} />
          <WslMachineRows />
        </SettingsSection>
      )}
    </Show>
  );
}
