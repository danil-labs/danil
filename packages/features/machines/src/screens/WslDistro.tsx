import { invoke } from "@tauri-apps/api/core";
import { Show, createSignal } from "solid-js";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { Badge } from "../../../../ui/src/Badge";
import { Button } from "../../../../ui/src/Button";
import { SignalDot } from "../../../../ui/src/SignalDot";
import { type WslDistroRow, type WslDistroUser, type WslJob, wslState } from "../model/wsl";
import { activeWorkspace, stateLabel } from "./wsl-common";
import { DistroBox } from "./WslDistroBox";
import { UserFields } from "./WslFields";

/** Una distribución. Conectada, es la caja de la maqueta: Linux, Danil y sus proveedores de IA. */
export function Distro(props: { row: WslDistroRow; busy: boolean; onStarted: (j: WslJob) => void; onChanged: () => void }) {
  const [asking, setAsking] = createSignal<null | { needsUser: boolean }>(null);
  const [cred, setCred] = createSignal({ user: "", password: "", ok: false });

  async function ask() {
    let needsUser = false;
    try {
      needsUser = (await invoke<WslDistroUser>("wsl_distro_user", { distro: props.row.name })).uid === 0;
    } catch {
      needsUser = false;
    }
    if (!needsUser) return void connect(null, null);
    setAsking({ needsUser });
  }

  async function connect(user: string | null, password: string | null) {
    const ws = await activeWorkspace();
    setAsking(null);
    props.onStarted(await invoke<WslJob>("wsl_connect", { distro: props.row.name, user, password, workspace: ws?.id ?? null, workspaceName: ws?.name ?? null }));
  }

  return (
    <Show
      when={props.row.child}
      fallback={
        <div class="grid gap-2 rounded-sm border border-border p-3" data-wsl-distro={props.row.name}>
          <div class="flex flex-wrap items-center gap-2">
            <SignalDot tone={wslState(props.row.state).tone} />
            <span class="min-w-0 flex-1 truncate text-ui font-[560] text-neutral-950">{props.row.name}</span>
            <span class="text-xs text-neutral-500">{stateLabel(props.row.state)}</span>
            <Show when={props.row.version}>{(v) => <Badge forma="dato" tone="neutral">{t("danil.wsl.version", { version: v() })}</Badge>}</Show>
            <Show
              when={props.row.version !== 1}
              fallback={<span class="text-xs text-neutral-500">{t("danil.wsl.wsl1")}</span>}
            >
              <Button size="sm" disabled={props.busy || !!asking()} onClick={() => void ask()} data-wsl-connect={props.row.name}>
                {t("danil.wsl.connect")}
              </Button>
            </Show>
          </div>
          <Show when={asking()?.needsUser}>
            <p class="m-0 text-xs text-neutral-500">{t("danil.wsl.connect_needs_user", { distro: props.row.name })}</p>
            <UserFields onChange={(user, password, ok) => setCred({ user, password, ok })} />
            <div class="flex gap-2">
              <Button size="sm" disabled={!cred().ok} onClick={() => void connect(cred().user, cred().password)}>{t("danil.wsl.connect")}</Button>
              <Button size="sm" variant="secondary" onClick={() => setAsking(null)}>{t("danil.wsl.cancel")}</Button>
            </div>
          </Show>
        </div>
      }
    >
      {(child) => <DistroBox name={props.row.name} child={child()} onRemoved={props.onChanged} />}
    </Show>
  );
}
