import { invoke } from "@tauri-apps/api/core";
import { For, Match, Show, Switch, createMemo, createSignal } from "solid-js";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { Badge } from "../../../../ui/src/Badge";
import { Button } from "../../../../ui/src/Button";
import { Input } from "../../../../ui/src/Input";
import { Spinner } from "../../../../ui/src/Spinner";
import type { WslCatalogItem, WslJob } from "../model/wsl";
import { activeWorkspace, mb } from "./wsl-common";
import { UserFields } from "./WslFields";

export function Installer(props: { installed: string[]; onCancel: () => void; onStarted: (j: WslJob) => void }) {
  const [items, setItems] = createSignal<WslCatalogItem[] | null>(null);
  const [failed, setFailed] = createSignal(false);
  const [query, setQuery] = createSignal("");
  const [picked, setPicked] = createSignal<string | null>(null);
  const [step, setStep] = createSignal<"pick" | "user">("pick");
  const [cred, setCred] = createSignal({ user: "", password: "", ok: false });
  invoke<WslCatalogItem[]>("wsl_catalog")
    .then((list) => {
      setItems(list);
      const first = list.find((i) => i.supported && i.default && !props.installed.includes(i.name)) ?? list.find((i) => i.supported && !props.installed.includes(i.name));
      setPicked(first?.name ?? null);
    })
    .catch(() => setFailed(true));
  const item = () => items()?.find((i) => i.name === picked()) ?? null;
  const shown = createMemo(() => {
    const q = query().trim().toLowerCase();
    return (items() ?? []).filter((i) => !q || i.label.toLowerCase().includes(q) || i.name.toLowerCase().includes(q));
  });
  async function go() {
    const i = item();
    if (!i) return;
    const ws = await activeWorkspace();
    props.onStarted(
      await invoke<WslJob>("wsl_install", {
        name: i.name,
        label: i.label,
        url: i.url,
        sha256: i.sha256,
        user: cred().user,
        password: cred().password,
        workspace: ws?.id ?? null,
        workspaceName: ws?.name ?? null,
      }),
    );
  }
  return (
    <div class="grid gap-3 rounded-sm border border-border p-3" data-wsl-installer={step()}>
      <Switch>
        <Match when={step() === "pick"}>
          <p class="m-0 text-sm font-[560] text-neutral-950">{t("danil.wsl.catalog.title")}</p>
          <Input value={query()} placeholder={t("danil.wsl.catalog.search")} onInput={(e) => setQuery(e.currentTarget.value)} />
          <Switch>
            <Match when={failed()}>
              <p class="m-0 text-xs text-error-strong">{t("danil.wsl.catalog.failed")}</p>
            </Match>
            <Match when={!items()}>
              <p class="m-0 flex items-center gap-2 text-xs text-neutral-500"><Spinner size={12} />{t("danil.wsl.catalog.loading")}</p>
            </Match>
            <Match when={items()}>
              <div class="grid max-h-72 gap-1 overflow-auto">
                <For each={shown()}>
                  {(i) => {
                    const have = props.installed.includes(i.name);
                    const off = have || !i.supported;
                    return (
                      <label class={`flex items-center gap-2 rounded-sm border border-border px-2 py-1.5 text-ui ${off ? "text-neutral-500" : "text-neutral-950"}`} data-wsl-option={i.name}>
                        <input type="radio" name="wsl-distro" disabled={off} checked={picked() === i.name} onChange={() => setPicked(i.name)} />
                        <span class="flex-1">{i.label}</span>
                        <Show when={i.default && !off}><Badge tone="active">{t("danil.wsl.catalog.recommended")}</Badge></Show>
                        <Show when={have}><Badge forma="dato" tone="neutral">{t("danil.wsl.catalog.installed")}</Badge></Show>
                        <Show when={!i.supported && !have}><span class="text-xs">{t("danil.wsl.catalog.not_yet")}</span></Show>
                        <Show when={i.size}>{(s) => <span class="font-mono text-xs text-neutral-500">{t("danil.wsl.mb", { mb: mb(s()) })}</span>}</Show>
                      </label>
                    );
                  }}
                </For>
              </div>
            </Match>
          </Switch>
          <div class="flex gap-2">
            <Button size="sm" disabled={!item()} onClick={() => setStep("user")} data-wsl-pick-next="">{t("danil.wsl.next")}</Button>
            <Button size="sm" variant="secondary" onClick={props.onCancel}>{t("danil.wsl.cancel")}</Button>
          </div>
        </Match>
        <Match when={step() === "user"}>
          <p class="m-0 text-sm font-[560] text-neutral-950">{t("danil.wsl.user_title", { distro: item()?.label ?? "" })}</p>
          <UserFields onChange={(user, password, ok) => setCred({ user, password, ok })} />
          <div class="grid gap-1 rounded-sm bg-surface-muted p-2 text-xs text-neutral-700">
            <span>{t("danil.wsl.summary.distro", { distro: item()?.label ?? "", mb: mb(item()?.size) })}</span>
            <span>{t("danil.wsl.summary.engine")}</span>
          </div>
          <div class="flex gap-2">
            <Button size="sm" disabled={!cred().ok} onClick={() => void go()} data-wsl-install-go="">{t("danil.wsl.install_go")}</Button>
            <Button size="sm" variant="secondary" onClick={() => setStep("pick")}>{t("danil.wsl.back")}</Button>
          </div>
        </Match>
      </Switch>
    </div>
  );
}
