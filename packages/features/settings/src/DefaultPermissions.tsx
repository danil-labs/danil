import { Show, createSignal, onMount } from "solid-js";
import { invoke } from "../../../engine-client/src/client.ts";
import { Select } from "../../../ui/src/Select";
import { FailureNote, asFailure, type Failure } from "../../../ui/src/Failure";
import { t } from "../../../../apps/desktop/src/lib/i18n";
import type { Startup, Workspace } from "./workspaces-store";
import { SettingsRow } from "./layout";

/** Avisa a la ventana, que arranca con esto la caja en blanco de este workspace. */
export const DEFAULT_PERMISSION_MODE_EVENT = "harness:default-permission-mode";

export type DefaultPermissionModeChange = { workspace: string; mode: string | null };

/**
 * El modo de permisos con que arranca lo nuevo del workspace activo
 * (`workspaces::Workspace::default_permission_mode`). Vacío deja el arranque
 * de siempre: el último modo elegido a mano.
 */
export function DefaultPermissions() {
  const [workspace, setWorkspace] = createSignal<string | null>(null);
  const [value, setValue] = createSignal("");
  const [failure, setFailure] = createSignal<Failure | null>(null);

  onMount(() => {
    void invoke<Startup>("list_workspaces")
      .then((s) => {
        const active = s.workspaces.find((w) => w.id === s.active);
        if (!active) return;
        setWorkspace(active.id);
        setValue(active.default_permission_mode ?? "");
      })
      .catch((e) => setFailure(asFailure(e)));
  });

  async function choose(mode: string, control: HTMLSelectElement) {
    const id = workspace();
    if (!id) return;
    try {
      const saved = await invoke<Workspace>("set_workspace_permission_mode", {
        id,
        mode: mode || null,
      });
      setValue(saved.default_permission_mode ?? "");
      setFailure(null);
      window.dispatchEvent(
        new CustomEvent<DefaultPermissionModeChange>(DEFAULT_PERMISSION_MODE_EVENT, {
          detail: { workspace: id, mode: saved.default_permission_mode },
        }),
      );
    } catch (e) {
      control.value = value();
      setFailure(asFailure(e));
    }
  }

  return (
    <Show when={workspace()}>
      <SettingsRow
        data-setting="default-permissions"
        label={t("settings.permissions.title")}
        description={
          <>
            {t("settings.permissions.hint")}
            <Show when={failure()}>{(f) => <FailureNote f={f()} />}</Show>
          </>
        }
      >
        <Select
          variant="ghost"
          class="min-h-8 w-auto px-1.5 text-sm focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-primary"
          aria-label={t("settings.permissions.title")}
          value={value()}
          onChange={(e) => void choose(e.currentTarget.value, e.currentTarget)}
        >
          <option value="">{t("settings.permissions.last_chosen")}</option>
          <option value="manual">{t("agents.mode.manual")}</option>
          <option value="ediciones">{t("agents.mode.edits")}</option>
          <option value="auto">{t("agents.mode.auto")}</option>
        </Select>
      </SettingsRow>
    </Show>
  );
}
