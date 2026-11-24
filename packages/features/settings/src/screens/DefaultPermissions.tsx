import { Show, createSignal, onMount } from "solid-js";
import { listWorkspaces, setWorkspacePermissionMode } from "../queries/engine-workspaces";
import { Select } from "../../../../ui/src/Select";
import { FailureNote, asFailure, type Failure } from "../../../../ui/src/Failure";
import { t } from "../../../../ui/src/lib/i18n";
import type { Startup, Workspace } from "../queries/workspaces-store";
import { SettingsRow } from "../../../../ui/src/SettingsLayout";

/** Avisa a la ventana, que arranca con esto la caja en blanco de este workspace. */
export const DEFAULT_PERMISSION_MODE_EVENT = "harness:default-permission-mode";

import type { DefaultPermissionModeChange } from "../../../../ui/src/lib/default-permission-mode.ts"; export type { DefaultPermissionModeChange };

const DEFAULT_PERMISSION_MODE = "auto";

/**
 * El modo de permisos con que arranca lo nuevo del workspace activo
 * (`workspaces::Workspace::default_permission_mode`). Sin override guardado
 * usa el modo por defecto (`auto`).
 */
export function DefaultPermissions() {
  const [workspace, setWorkspace] = createSignal<string | null>(null);
  const [value, setValue] = createSignal(DEFAULT_PERMISSION_MODE);
  const [failure, setFailure] = createSignal<Failure | null>(null);

  onMount(() => {
    void listWorkspaces<Startup>()
      .then((s) => {
        const active = s.workspaces.find((w) => w.id === s.active);
        if (!active) return;
        setWorkspace(active.id);
        setValue(active.default_permission_mode ?? DEFAULT_PERMISSION_MODE);
      })
      .catch((e) => setFailure(asFailure(e)));
  });

  async function choose(mode: string, control: HTMLSelectElement) {
    const id = workspace();
    if (!id) return;
    try {
      const saved = await setWorkspacePermissionMode<Workspace>({
        id,
        mode: mode || null,
      });
      setValue(saved.default_permission_mode ?? DEFAULT_PERMISSION_MODE);
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
          class="min-h-8 w-auto px-1.5 text-sm"
          aria-label={t("settings.permissions.title")}
          value={value()}
          onChange={(e) => void choose(e.currentTarget.value, e.currentTarget)}
        >
          <option value="auto">{t("agents.mode.auto")}</option>
          <option value="ediciones">{t("agents.mode.edits")}</option>
          <option value="manual">{t("agents.mode.manual")}</option>
        </Select>
      </SettingsRow>
    </Show>
  );
}
