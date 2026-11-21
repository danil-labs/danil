/**
 * Las credenciales de la cuenta de Danil en Configuración: en qué máquinas está
 * cada una («En uso en»), quitarla o volver a ponerla por máquina, y el aviso
 * para subir a la cuenta las claves que solo tiene esta máquina.
 *
 * Trozo perezoso: lo cargan Cuentas, MCP y Referencias al abrirse.
 */
import "../../../../../apps/desktop/src/locales/danilPhrases";
import { type Credential, type CredentialKind, type CredentialMachine, credentialMachines } from "@terminus/computers";
import { createMemo, createSignal, For, onMount, Show } from "solid-js";
import { manifiesto, t } from "../../../../../apps/desktop/src/lib/i18n";
import { capabilities } from "../../../../host/src/platform";
import { prosa } from "../../../../../apps/desktop/src/lib/prose";
import { Badge } from "../../../../ui/src/Badge";
import { Button } from "../../../../ui/src/Button";
import { type Failure, FailureNote } from "../../../../ui/src/Failure";
import { Input } from "../../../../ui/src/Input";
import { machineName, machines } from "../../../machines/src/store";
import { SettingsBlock } from "../layout";
import { act, credentialsView, failureOf, reloadCredentials } from "./store";

const nameOf = (m: Pick<CredentialMachine, "computer_id" | "name">) => m.name?.trim() || capabilities().machineName?.(m.computer_id) || m.computer_id;
const PROVIDERS: Record<string, string> = { opencode: "OpenCode", zotero: "Zotero", github: "GitHub" };
/** Dónde se revoca la clave de verdad: el servidor de un MCP, o el proveedor por su nombre. */
function providerName(c: Pick<Credential, "kind" | "provider" | "config">): string {
  if (c.kind === "mcp_secret" && typeof c.config.server === "string" && c.config.server) return c.config.server;
  if (c.provider === "opencode-go") return t("danil.credentials.provider_opencode_go");
  return PROVIDERS[c.provider] ?? c.provider;
}
const list = (names: string[]) => new Intl.ListFormat(manifiesto().formato).format(names);

/** «En uso en: Mac y vm-alberto · pendiente en vm-x»: de un vistazo, sin abrir nada. */
export function usageSummary(credential: Pick<Credential, "machines">): string {
  const ms = credentialMachines(credential);
  const using = ms.filter((m) => m.state === "active" || m.state === "signed_in").map(nameOf);
  const pending = ms.filter((m) => m.state === "pending").map(nameOf);
  const unsupported = ms.filter((m) => m.state === "unsupported").map(nameOf);
  const parts = [using.length ? t("danil.credentials.in_use", { machines: list(using) }) : t("danil.credentials.in_use_none")];
  if (pending.length) parts.push(t("danil.credentials.pending_on", { machines: list(pending) }));
  if (unsupported.length) parts.push(t("danil.credentials.unsupported_on", { machines: list(unsupported) }));
  return parts.join(" · ");
}

/**
 * Las máquinas de una credencial con Quitar y Volver a poner. Sirve para
 * cualquier tipo: con `sealed` quitar no revoca la clave en el proveedor y se
 * avisa antes; con `issued` (GitHub) el Worker sí revoca el token de esa máquina.
 */
export function CredentialMachines(props: { credential: Credential; onChanged?: () => void }) {
  const [asking, setAsking] = createSignal<string | null>(null);
  const [busy, setBusy] = createSignal<string | null>(null);
  const [failure, setFailure] = createSignal<Failure | null>(null);
  const rows = createMemo(() => credentialMachines(props.credential));
  const sealed = () => props.credential.delivery === "sealed";

  async function run(computer: string, restore: boolean) {
    setBusy(computer);
    setFailure(null);
    const f = await act((b, ws) => (restore ? b.restoreMachine(ws, props.credential.id, computer) : b.removeMachine(ws, props.credential.id, computer)));
    setBusy(null);
    setAsking(null);
    setFailure(f);
    props.onChanged?.();
  }

  return (
    <div class="grid gap-1.5" data-credential-machines={props.credential.id}>
      <p class="m-0 text-xs text-neutral-500" data-credential-usage="">
        {usageSummary(props.credential)}
      </p>
      <ul class="m-0 grid list-none gap-1 p-0">
        <For each={rows()}>
          {(m) => (
            <li class="grid gap-1" data-credential-machine={m.computer_id} data-state={m.state}>
              <div class="flex min-w-0 items-center gap-2">
                <span class="min-w-0 flex-1 truncate text-ui">{nameOf(m)}</span>
                <Show when={m.state === "pending"}>
                  <Badge tone="warning">{t("danil.credentials.state.pending")}</Badge>
                </Show>
                <Show when={m.state === "removed"}>
                  <Badge>{t("danil.credentials.state.removed")}</Badge>
                </Show>
                <Show when={m.state === "unsupported"}>
                  <Badge title={t("danil.credentials.state.unsupported_why")}>{t("danil.credentials.state.unsupported")}</Badge>
                </Show>
                <Show when={m.state !== "unsupported"}>
                <Show
                  when={m.state === "removed"}
                  fallback={
                    <Button
                      variant="ghost"
                      size="compact"
                      class="hover:text-error-strong"
                      disabled={busy() !== null}
                      onClick={() => (sealed() ? setAsking(m.computer_id) : void run(m.computer_id, false))}
                    >
                      {t("danil.credentials.remove")}
                    </Button>
                  }
                >
                  <Button variant="ghost" size="compact" disabled={busy() !== null} onClick={() => void run(m.computer_id, true)}>
                    {t("danil.credentials.restore")}
                  </Button>
                </Show>
                </Show>
              </div>
              <Show when={asking() === m.computer_id}>
                <div class="grid gap-2 rounded-md border border-border bg-surface-muted px-3 py-2" data-remove-warning="">
                  <p class="m-0 text-xs text-neutral-950">{t("danil.credentials.remove_warning", { machine: nameOf(m), provider: providerName(props.credential) })}</p>
                  <div class="flex justify-end gap-2">
                    <Button variant="outline" size="compact" onClick={() => setAsking(null)}>
                      {t("danil.credentials.cancel")}
                    </Button>
                    <Button variant="danger" size="compact" disabled={busy() !== null} onClick={() => void run(m.computer_id, false)}>
                      {t("danil.credentials.remove_from", { machine: nameOf(m) })}
                    </Button>
                  </div>
                </div>
              </Show>
            </li>
          )}
        </For>
      </ul>
      <Show when={failure()}>{(f) => <FailureNote f={f()} />}</Show>
    </div>
  );
}

/** Cambiar el valor desde la web: se sella aquí para cada máquina y el Worker no lo lee. */
function Rotate(props: { credential: Credential; onDone: () => void }) {
  const [value, setValue] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [failure, setFailure] = createSignal<Failure | null>(null);
  async function save(e: Event) {
    e.preventDefault();
    const v = value();
    if (!v.trim() || busy()) return;
    setBusy(true);
    const f = await act(async (b, ws) => {
      const now = credentialsView();
      if (now.kind !== "ready" || !b.rotate) return;
      await b.rotate(ws, props.credential, v, now.listing);
    });
    setBusy(false);
    setFailure(f);
    if (!f) {
      setValue("");
      props.onDone();
    }
  }
  return (
    <form class="grid gap-2" onSubmit={(e) => void save(e)} data-credential-rotate="">
      <div class="flex items-center gap-2">
        <Input
          type="password"
          autocomplete="off"
          class="min-w-0 flex-1"
          aria-label={t("danil.credentials.rotate.label", { name: props.credential.label ?? props.credential.provider })}
          placeholder={t("danil.credentials.rotate.placeholder")}
          value={value()}
          onInput={(e) => setValue(e.currentTarget.value)}
          ref={(el) =>
            // Configuración es un Dialog que cierra con Esc antes que el `onKeyDown` delegado de Solid.
            el.addEventListener("keydown", (e) => {
              if (e.key !== "Escape") return;
              e.stopPropagation();
              props.onDone();
            })
          }
        />
        <Button type="submit" variant="secondary" size="sm" disabled={busy() || !value().trim()}>
          {t("danil.credentials.rotate.save")}
        </Button>
      </div>
      <p class="m-0 text-caption text-neutral-500">{t("danil.credentials.rotate.help")}</p>
      <Show when={failure()}>{(f) => <FailureNote f={f()} />}</Show>
    </form>
  );
}

/** Una credencial: su nombre, los últimos 4 caracteres y sus máquinas. */
function CredentialItem(props: { credential: Credential; showLabel: boolean }) {
  const [rotating, setRotating] = createSignal(false);
  const [deleting, setDeleting] = createSignal(false);
  const [failure, setFailure] = createSignal<Failure | null>(null);
  const backend = () => (capabilities().accountCredentials ? "worker" : "engine");
  const canRotate = () => backend() === "worker" && props.credential.delivery === "sealed";
  return (
    <SettingsBlock data-account-credential={props.credential.slot}>
      <div class="flex min-w-0 items-center gap-2">
        <Show when={props.showLabel}>
          <span class="min-w-0 truncate text-sm">{props.credential.label ?? props.credential.slot}</span>
        </Show>
        <Show when={props.credential.hint}>{(hint) => <Badge forma="dato">{`••••${hint()}`}</Badge>}</Show>
        <span class="flex-1" />
        <Show when={canRotate()}>
          <Button variant="ghost" size="compact" onClick={() => setRotating((r) => !r)} aria-expanded={rotating()}>
            {t("danil.credentials.rotate.open")}
          </Button>
        </Show>
        <Button variant="ghost" size="compact" class="hover:text-error-strong" onClick={() => setDeleting(true)}>
          {t("danil.credentials.delete")}
        </Button>
      </div>
      <Show when={deleting()}>
        <div class="grid gap-2 rounded-md border border-border bg-surface-muted px-3 py-2" data-delete-warning="">
          <p class="m-0 text-xs text-neutral-950">{t("danil.credentials.delete_warning", { provider: providerName(props.credential) })}</p>
          <div class="flex justify-end gap-2">
            <Button variant="outline" size="compact" onClick={() => setDeleting(false)}>
              {t("danil.credentials.cancel")}
            </Button>
            <Button
              variant="danger"
              size="compact"
              onClick={async () => {
                setFailure(await act((b, ws) => b.remove(ws, props.credential.id)));
                setDeleting(false);
              }}
            >
              {t("danil.credentials.delete_yes")}
            </Button>
          </div>
        </div>
      </Show>
      <Show when={failure()}>{(f) => <FailureNote f={f()} />}</Show>
      <Show when={rotating()}>
        <Rotate credential={props.credential} onDone={() => setRotating(false)} />
      </Show>
      <CredentialMachines credential={props.credential} />
    </SettingsBlock>
  );
}

/**
 * Las credenciales de la cuenta que cumplen `match` (o son de `kinds`), cada una
 * con sus máquinas. Sin cuenta de Danil en el workspace no pinta nada.
 */
export function CredentialsInUse(props: { kinds?: CredentialKind[]; match?: (c: Credential) => boolean; title?: string; showLabel?: boolean }) {
  onMount(() => void reloadCredentials(false));
  const matching = () => {
    const v = credentialsView();
    if (v.kind !== "ready") return [];
    return v.listing.credentials.filter((c) => (props.match ? props.match(c) : props.kinds ? props.kinds.includes(c.kind) : true));
  };
  return (
    <>
      <Show when={matching().length > 0}>
        <div class="grid min-w-0" data-account-credentials="">
          <Show when={props.title}>
            <p class="m-0 pt-3 text-ui font-semibold">{props.title}</p>
          </Show>
          <For each={matching()}>{(c) => <CredentialItem credential={c} showLabel={props.showLabel ?? true} />}</For>
        </div>
      </Show>
      <Show when={(() => { const v = credentialsView(); return v.kind === "failed" && props.title ? v.failure : null; })()}>
        {(f) => <FailureNote f={f()} />}
      </Show>
    </>
  );
}

const [dismissed, setDismissed] = createSignal<ReadonlySet<string>>(new Set());

/** Dónde corre el motor que contesta: esta máquina, salvo que el workspace viva en otra. */
function whereName(): string | null {
  const lead = machines().find((m) => m.active);
  return lead && !lead.local ? machineName(lead.id, false) : null;
}

/**
 * «Tienes N claves solo en esta máquina. ¿Subirlas a tu cuenta?». La persona
 * elige cuáles; nada se sube sin que lo pida.
 */
export function LocalKeysBanner(props: { kinds: CredentialKind[] }) {
  onMount(() => void reloadCredentials(false));
  const local = () => {
    const v = credentialsView();
    if (v.kind !== "ready") return [];
    return (v.listing.local_only ?? []).filter((l) => props.kinds.includes(l.kind) && !dismissed().has(l.slot));
  };
  const [chosen, setChosen] = createSignal<ReadonlySet<string> | null>(null);
  const picked = () => chosen() ?? new Set(local().map((l) => l.slot));
  const [busy, setBusy] = createSignal(false);
  const [failure, setFailure] = createSignal<Failure | null>(null);
  const toggle = (slot: string, on: boolean) => {
    const next = new Set(picked());
    if (on) next.add(slot);
    else next.delete(slot);
    setChosen(next);
  };
  async function upload() {
    const slots = local().map((l) => l.slot).filter((s) => picked().has(s));
    if (!slots.length) return;
    setBusy(true);
    setFailure(await act(async (b, ws) => b.upload?.(ws, slots)));
    setBusy(false);
    setChosen(null);
  }
  return (
    <Show when={local().length > 0}>
      <div class="grid gap-2 rounded-md border border-border bg-surface-raised px-3 py-2.5" data-local-keys-banner="">
        <p class="m-0 text-ui font-semibold">
          {whereName()
            ? t("danil.credentials.local.title_on", { count: local().length, machine: whereName()! })
            : t("danil.credentials.local.title", { count: local().length })}
        </p>
        <p class="m-0 text-xs text-neutral-500">{t("danil.credentials.local.help")}</p>
        <ul class="m-0 grid list-none gap-1 p-0">
          <For each={local()}>
            {(l) => (
              <li>
                <label class="flex items-center gap-2 text-ui">
                  <input type="checkbox" checked={picked().has(l.slot)} onChange={(e) => toggle(l.slot, e.currentTarget.checked)} data-local-key={l.slot} />
                  <span class="min-w-0 truncate">{l.label ?? l.slot}</span>
                  <Show when={l.hint}>{(hint) => <Badge forma="dato">{`••••${hint()}`}</Badge>}</Show>
                </label>
                <Show when={l.upload_error}>
                  {(code) => (
                    <p class="m-0 pl-6 text-caption text-warning-strong" data-upload-error={l.slot}>
                      {prosa(failureOf({ what: { clave: code() }, detail: "" }).what)}
                    </p>
                  )}
                </Show>
              </li>
            )}
          </For>
        </ul>
        <div class="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setDismissed(new Set([...dismissed(), ...local().map((l) => l.slot)]))}>
            {t("danil.credentials.local.later")}
          </Button>
          <Button variant="secondary" size="sm" disabled={busy() || picked().size === 0} onClick={() => void upload()}>
            {t("danil.credentials.local.upload", { count: local().filter((l) => picked().has(l.slot)).length })}
          </Button>
        </div>
        <Show when={failure()}>{(f) => <FailureNote f={f()} />}</Show>
      </div>
    </Show>
  );
}
