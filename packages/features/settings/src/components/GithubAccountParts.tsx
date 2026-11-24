import type { GithubMachine } from "../../../../platform-client/src/github.ts";
import Ellipsis from "lucide-solid/icons/ellipsis";
import ExternalIcon from "lucide-solid/icons/external-link";
import { For, Show } from "solid-js";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { Badge } from "../../../../ui/src/Badge";
import { Button } from "../../../../ui/src/Button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "../../../../ui/src/DropdownMenu";
import { PLANS_URL } from "./GithubAccountTypes";
import type { createConexionDeGithub } from "./GithubAccountConnection";

export function createPartesDeGithub(conexion: ReturnType<typeof createConexionDeGithub>) {
  const { reauthorize, license, unavailable, busy, check, disconnect, connect, openUrl, machineName, machine } = conexion;
  const Initial = (p: { name: string; round?: boolean }) => (
    <span
      aria-hidden="true"
      class={`grid size-6 shrink-0 place-items-center bg-neutral-200 text-caption font-semibold text-neutral-700 ${p.round ? "rounded-full" : "rounded-sm"}`}
    >
      {p.name.slice(0, 1).toUpperCase()}
    </span>
  );

  /** Lo que la fila de la cuenta dice en vez del menú: un estado con su acción. */
  const AccountState = () => (
    <Show
      when={reauthorize() || license() || unavailable()}
      fallback={
        <DropdownMenu>
          <DropdownMenuTrigger as={Button} variant="ghost" size="iconCompact" aria-label={t("providers.github.more_actions")} disabled={busy() !== null}>
            <Ellipsis size={16} aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent class="z-[90]" data-owns-escape>
            <DropdownMenuItem disabled={busy() !== null} onSelect={() => void check()}>
              {t("providers.github.check_connection")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem class="text-error-strong" disabled={busy() !== null} onSelect={() => void disconnect()}>
              {t("providers.github.disconnect")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      }
    >
      <Show when={reauthorize()}>
        <span class="inline-flex items-center gap-2 text-ui text-warning-strong">
          <Badge tone="warning">{t("providers.github.account.reauthorize_badge")}</Badge>
          {t("providers.github.account.reauthorize")}
        </span>
        <Button size="sm" disabled={busy() !== null} onClick={() => void connect()}>
          {t("providers.github.account.reconnect")}
        </Button>
      </Show>
      <Show when={!reauthorize() && license()}>
        <span class="inline-flex items-center gap-2 text-ui text-warning-strong">
          <Badge tone="warning">{t("providers.github.account.license_badge")}</Badge>
          {t("providers.github.account.license")}
        </span>
        <Button variant="outline" size="compact" onClick={() => void openUrl(PLANS_URL)}>
          {t("providers.github.account.plans")}
          <ExternalIcon size={12} aria-hidden />
        </Button>
      </Show>
      <Show when={!reauthorize() && !license() && unavailable()}>
        <span class="text-ui text-error-strong" role="alert">{t("providers.github.account.unavailable")}</span>
        <Button variant="outline" size="compact" disabled={busy() !== null} onClick={() => void check()}>
          {t("providers.github.account.retry")}
        </Button>
      </Show>
    </Show>
  );

  /**
   * Las máquinas donde está en uso, como chips junto a la cuenta (el `Badge
   * forma="dato"` de Proveedores de IA): hasta 3 y «+N»; el `title` da todas.
   * Clic en un chip: su única acción, quitar o volver a poner.
   */
  function MachineChips(p: { machines: GithubMachine[] }) {
    const shown = () => p.machines.slice(0, 3);
    const rest = () => p.machines.length - shown().length;
    const all = () => p.machines.map(machineName).join(", ");
    return (
      <Show when={p.machines.length > 0}>
        <span class="inline-flex min-w-0 flex-wrap items-center gap-1" data-github-machines="" title={all()}>
          <For each={shown()}>
            {(m) => (
              <DropdownMenu>
                <DropdownMenuTrigger
                  as="button"
                  type="button"
                  class="rounded-sm"
                  data-github-machine={m.computer_id}
                  aria-label={machineName(m)}
                  disabled={busy() !== null}
                >
                  <Badge forma="dato" class={m.state === "removed" ? "shrink-0 opacity-60" : "shrink-0"}>
                    {machineName(m)}
                  </Badge>
                </DropdownMenuTrigger>
                <DropdownMenuContent class="z-[90]" data-owns-escape>
                  <DropdownMenuItem disabled={busy() !== null} onSelect={() => void machine(m, m.state === "removed")}>
                    {m.state === "removed" ? t("providers.github.account.machine_restore") : t("providers.github.account.machine_remove")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </For>
          <Show when={rest() > 0}>
            <DropdownMenu>
              <DropdownMenuTrigger as="button" type="button" class="rounded-sm" aria-label={all()} disabled={busy() !== null}>
                <Badge forma="dato" class="shrink-0">+{rest()}</Badge>
              </DropdownMenuTrigger>
              <DropdownMenuContent class="z-[90]" data-owns-escape>
                <For each={p.machines.slice(3)}>
                  {(m) => (
                    <DropdownMenuItem disabled={busy() !== null} onSelect={() => void machine(m, m.state === "removed")}>
                      {machineName(m)} · {m.state === "removed" ? t("providers.github.account.machine_restore") : t("providers.github.account.machine_remove")}
                    </DropdownMenuItem>
                  )}
                </For>
              </DropdownMenuContent>
            </DropdownMenu>
          </Show>
        </span>
      </Show>
    );
  }
  return { AccountState, Initial, MachineChips };
}
