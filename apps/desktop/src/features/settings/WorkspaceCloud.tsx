import { createSignal, For, Show } from "solid-js";
import { t } from "../../lib/i18n";
import { Button } from "../../ui/Button";
import { Select } from "../../ui/Select";
import { directoryErrorText } from "../shell/directory-errors";
import { createForActiveWorkspace, directory, linkableAccounts, linkActiveWorkspace } from "../shell/workspace-directory";

/**
 * «En la nube», en la tarjeta del workspace abierto en Configuración: si está
 * sincronizado y con cuál, o, si solo está en esta computadora, subirlo o
 * sincronizarlo con uno que ya tiene. Es lo mismo que ofrece el paso al iniciar
 * sesión (`DanilWorkspaceStep`), sin tener que volver a entrar.
 */
export default function WorkspaceCloud(props: { workspace: string; name: string; onChange: () => void }) {
  const [picked, setPicked] = createSignal<string | null>(null);
  const [busy, setBusy] = createSignal(false);
  const [failure, setFailure] = createSignal<string | null>(null);

  const own = () => directory()?.workspaces.find((e) => e.workspace_id === props.workspace && e.owner && !e.support);
  const synced = () => {
    const entry = own();
    return entry && entry.danil_workspace_id !== null ? entry : null;
  };
  const accounts = () => linkableAccounts(props.workspace);
  const target = () => accounts().find((a) => a.key === picked()) ?? accounts()[0];

  const run = async (action: () => Promise<string | null>) => {
    if (busy()) return;
    setBusy(true);
    setFailure(null);
    const code = await action();
    setBusy(false);
    if (code) return setFailure(code);
    props.onChange();
  };

  return (
    <Show when={own()}>
      <div class="grid gap-1 pl-[27px] text-xs" data-workspace-cloud={synced() ? "synced" : "local"}>
        <span class="text-neutral-500">{t("settings.workspaces.cloud.title")}</span>
        <Show
          when={synced()}
          fallback={
            <>
              <span class="flex items-center gap-1.5 text-neutral-950">
                <span class="size-2 shrink-0 rounded-full bg-neutral-500" aria-hidden="true" />
                {t("settings.workspaces.cloud.local")}
              </span>
              <p class="m-0 text-neutral-500">{t("settings.workspaces.cloud.local_hint")}</p>
              <div class="mt-1 flex flex-wrap items-center gap-2">
                <Button size="sm" disabled={busy()} data-workspace-cloud-upload="" onClick={() => void run(() => createForActiveWorkspace(props.workspace))}>
                  {t("settings.workspaces.cloud.upload", { workspace: props.name })}
                </Button>
                <Show when={accounts().length}>
                  <span class="text-neutral-500">{t("settings.workspaces.cloud.or")}</span>
                  <Select
                    class="min-h-8 w-auto max-w-56"
                    aria-label={t("settings.workspaces.cloud.pick")}
                    value={target()?.key ?? ""}
                    disabled={busy()}
                    onChange={(event) => setPicked(event.currentTarget.value)}
                  >
                    <For each={accounts()}>
                      {(account) => <option value={account.key}>{account.name || t("shell.directory.unnamed")}</option>}
                    </For>
                  </Select>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy() || !target()}
                    data-workspace-cloud-sync=""
                    onClick={() => {
                      const account = target();
                      if (account) void run(() => linkActiveWorkspace(props.workspace, account));
                    }}
                  >
                    {t("settings.workspaces.cloud.sync")}
                  </Button>
                </Show>
              </div>
            </>
          }
        >
          {(entry) => (
            <>
              <span class="flex items-center gap-1.5 text-neutral-950">
                <span class="size-2 shrink-0 rounded-full bg-success-strong" aria-hidden="true" />
                {t("settings.workspaces.cloud.synced", { name: entry().name || t("shell.directory.unnamed") })}
              </span>
              <p class="m-0 text-neutral-500">
                {/* El enlace le pone al workspace el nombre de la nube y renombrar cambia los dos; si aún difieren, se dice. */}
                {entry().name && entry().name !== props.name
                  ? t("settings.workspaces.cloud.other_name", { local: props.name, cloud: entry().name })
                  : t("settings.workspaces.cloud.synced_hint")}
              </p>
            </>
          )}
        </Show>
        <Show when={failure()}>
          {(code) => (
            <p class="m-0 text-error-strong" role="alert">
              {directoryErrorText(code())}
            </p>
          )}
        </Show>
      </div>
    </Show>
  );
}
