import type { AccountWorkspace, Computer, Connection, ConnectionCapabilities, ConnectionPatch } from "@terminus/computers";
import { PERMISSION_MODES } from "@terminus/computers";
import { createSignal, createUniqueId, For, Show } from "solid-js";
import { t } from "../../lib/i18n";
import { Button } from "../../ui/Button";
import { Select } from "../../ui/Select";

type Access = NonNullable<ConnectionPatch["machines"]>[number];
const key = (m: Access) => JSON.stringify([m.computer_id, m.workspace, m.folder ?? ""]);
type Props = {
  connection: Connection;
  computers: Computer[];
  workspaces: AccountWorkspace[];
  capabilities: ConnectionCapabilities | null;
  busy: boolean;
  onSave: (patch: ConnectionPatch) => Promise<boolean>;
};

export function ConnectionAccess(props: Props) {
  const [editing, setEditing] = createSignal(false);
  const [saved, setSaved] = createSignal(false);
  const id = createUniqueId();
  let trigger: HTMLButtonElement | undefined;
  function close() {
    setEditing(false);
    trigger?.focus();
  }
  return (
    <div class="grid gap-3 pb-4">
      <Button ref={trigger} variant="secondary" size="sm" class="justify-self-start" disabled={props.busy}
        aria-expanded={editing()} aria-controls={id} onClick={() => { setSaved(false); editing() ? close() : setEditing(true); }}>
        {t("settings.connections.edit_access")}
      </Button>
      <Show when={editing()}>
        <div id={id}><AccessEditor {...props} onClose={close} onSave={async patch => {
          const ok = await props.onSave(patch);
          if (ok) setSaved(true);
          return ok;
        }} /></div>
      </Show>
      <Show when={saved()}><p class="m-0 text-ui text-neutral-500" role="status">{t("settings.connections.access_saved")}</p></Show>
    </div>
  );
}

function AccessEditor(props: Props & { onClose: () => void }) {
  const available = (): Access[] => props.computers.flatMap(m =>
    [...new Set(m.workspaces ?? [])].flatMap(workspace => {
      const kept = props.connection.machines.filter(k => k.computer_id === m.computer_id && k.workspace === workspace);
      return kept.length ? kept : [{ computer_id: m.computer_id, workspace }];
    }));
  const [selected, setSelected] = createSignal<Access[]>(props.connection.state === "pending" ? available() : [...props.connection.machines]);
  const [mode, setMode] = createSignal<string>(props.connection.state === "pending" ? "manual" : props.connection.permission_mode ?? "");
  const [failed, setFailed] = createSignal(false);
  const options = () => [...new Map([...available(), ...props.connection.machines].map(m => [key(m), m])).values()];
  const multiple = () => props.capabilities?.features.includes("external_connection_destinations_v1") === true;
  const maximum = () => props.capabilities?.limits.max_destinations ?? 32;
  const conflicts = () => !multiple() && new Set(selected().map(m => m.computer_id)).size !== selected().length;
  const locked = (m: Access) => !multiple() && props.connection.machines.some(k => k.computer_id === m.computer_id && key(k) !== key(m));
  const machines = () => [...new Set(options().map(m => m.computer_id))];
  const name = (id: string) => {
    const w = props.workspaces.find(w => w.id === id);
    return w && props.workspaces.filter(other => other.name === w.name).length === 1 ? w.name : w ? `${w.name} (${id})` : id;
  };
  function toggle(m: Access, checked: boolean) {
    setSelected(rows => checked ? [...rows, m] : rows.filter(row => key(row) !== key(m)));
  }
  async function save() {
    setFailed(false);
    const ok = await props.onSave({
      machines: selected().map(({ computer_id, workspace, folder }) => ({ computer_id, workspace, folder })),
      ...(props.connection.state === "pending" ? { permission_mode: mode() || null } : {}),
      ...(props.connection.state === "pending" ? { state: "active" as const } : {}),
    });
    if (ok) props.onClose();
    else setFailed(true);
  }
  return (
    <div class="grid gap-3">
      <p class="m-0 text-ui text-neutral-500">{t("settings.connections.access_hint")}</p>
      <For each={machines()}>{id => (
        <fieldset class="m-0 grid gap-2 rounded-md border border-border p-3" disabled={props.busy}>
          <legend class="px-1 text-label font-semibold text-neutral-950">{props.computers.find(m => m.computer_id === id)?.name ?? id}</legend>
          <For each={options().filter(m => m.computer_id === id)}>{m => (
            <label class="flex items-center gap-2 text-ui text-neutral-950">
              <input type="checkbox" checked={selected().some(row => key(row) === key(m))} disabled={locked(m)}
                onChange={e => toggle(m, e.currentTarget.checked)} />
              <span>{name(m.workspace)}<Show when={m.folder}> · {m.folder}</Show></span>
            </label>
          )}</For>
        </fieldset>
      )}</For>
      <Show when={options().length === 0}>
        <p class="m-0 text-ui text-neutral-500">{t("settings.connections.no_machines")}</p>
      </Show>
      <label class="grid gap-1 text-label text-neutral-500">
        {t("settings.connections.approval_mode")}
        <Select value={mode()} disabled={props.busy || props.connection.state !== "pending"} onChange={e => setMode(e.currentTarget.value)}>
          <option value="">{t("settings.connections.inherit_mode")}</option>
          <For each={PERMISSION_MODES}>{m => <option value={m}>{t(`settings.connections.mode.${m}`)}</option>}</For>
        </Select>
      </label>
      <Show when={!multiple()}><p class="m-0 text-ui text-neutral-500">{t("settings.connections.service_limit")}</p></Show>
      <Show when={props.connection.state !== "pending"}><p class="m-0 text-ui text-neutral-500">{t("settings.connections.approval_fixed")}</p></Show>
      <Show when={conflicts()}>
        <p class="m-0 text-ui text-error-strong" role="alert">{t("settings.connections.one_workspace")}</p>
      </Show>
      <Show when={selected().length > maximum()}>
        <p class="m-0 text-ui text-error-strong" role="alert">{t("settings.connections.access_limit", { count: String(maximum()) })}</p>
      </Show>
      <Show when={failed()}>
        <p class="m-0 text-ui text-error-strong" role="alert">{t("settings.connections.failed")}</p>
      </Show>
      <div class="flex justify-end gap-2">
        <Button variant="secondary" disabled={props.busy} onClick={props.onClose}>{t("settings.connections.cancel")}</Button>
        <Button disabled={props.busy || (props.connection.state !== "paused" && selected().length === 0) || selected().length > maximum() || conflicts()} onClick={() => void save()}>
          {props.connection.state === "pending" ? t("settings.connections.activate") : t("settings.connections.save_access")}
        </Button>
      </div>
    </div>
  );
}
