import { type Accessor, For, Show, createSignal } from "solid-js";
import { SignalDot } from "../../ui/SignalDot";
import X from "lucide-solid/icons/x";
import { t } from "../../lib/i18n";
import { invoke } from "../../lib/invoke.ts";
import type { AccountMachinesProps } from "../../lib/platform";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../../ui/DropdownMenu";
import type { MachineRow } from "../../web/SyncNote";

/**
 * The machines where one account is signed in, under its card: each chip says
 * whether its machine is on and signs out only there. Signing in on another
 * machine runs the usual login (link and code) on that machine.
 */
export default function AccountMachines(props: AccountMachinesProps & { machines: Accessor<MachineRow[]> }) {
  const [asking, setAsking] = createSignal<string | null>(null);
  const [failed, setFailed] = createSignal(false);
  const row = (id: string) => props.machines().find((m) => m.id === id);
  const others = () =>
    props.machines().filter((m) => m.status !== "outdated" && !(props.account.machines ?? []).some((x) => x.machine === m.id));

  async function signOut(id: string, machine: string) {
    setAsking(null);
    try {
      await invoke("remove_account", { provider: props.provider, id }, { headers: { "x-terminus-machine": machine } });
      setFailed(false);
    } catch {
      setFailed(true);
    }
    props.refresh();
  }

  return (
    <li class="-mt-1 flex flex-wrap items-center gap-1.5 px-3 pb-1 text-xs text-neutral-500" data-account-machines={props.account.id}>
      <For each={props.account.machines ?? []}>
        {(m) => {
          const name = () => row(m.machine)?.name ?? m.machine;
          const on = () => row(m.machine)?.status === "online";
          return (
            <span
              class="flex min-w-0 items-center gap-1 rounded-sm border border-border py-0.5 pr-0.5 pl-1.5"
              data-account-machine={m.machine}
              data-on={on() ? "true" : "false"}
              title={on() ? t("web.computers.state.online") : t("web.computers.state.offline")}
            >
              <SignalDot tone={on() ? "success" : "off"} />
              <span class="max-w-[140px] truncate">{name()}</span>
              <Show
                when={asking() === m.id}
                fallback={
                  <button
                    type="button"
                    class="grid size-4 place-items-center rounded-sm hover:bg-surface-muted hover:text-neutral-950"
                    aria-label={t("web.accounts.sign_out", { name: name() })}
                    title={t("web.accounts.sign_out", { name: name() })}
                    onClick={() => setAsking(m.id)}
                  >
                    <X size={11} aria-hidden="true" />
                  </button>
                }
              >
                <button type="button" class="px-1 text-error-strong" data-sign-out-yes="" onClick={() => void signOut(m.id, m.machine)}>
                  {t("web.accounts.sign_out_yes")}
                </button>
                <button type="button" class="px-1" onClick={() => setAsking(null)}>
                  {t("web.accounts.sign_out_no")}
                </button>
              </Show>
            </span>
          );
        }}
      </For>
      <Show when={others().length > 0}>
        <DropdownMenu>
          <DropdownMenuTrigger class="rounded-sm px-1 py-0.5 hover:text-neutral-950" data-sign-in-elsewhere="">
            {t("web.accounts.sign_in_elsewhere")}
          </DropdownMenuTrigger>
          {/* Configuración es un Dialog en z-[80] que cierra con Esc salvo dentro de data-owns-escape. */}
          <DropdownMenuContent class="z-[90]" data-owns-escape>
            <For each={others()}>
              {(m) => (
                <DropdownMenuItem
                  class="flex items-center gap-2"
                  data-sign-in-on={m.id}
                  onSelect={() => void props.add({ headers: { "x-terminus-machine": m.id } })}
                >
                  <SignalDot tone={m.status === "online" ? "success" : "off"} />
                  <span class="truncate">{m.name}</span>
                </DropdownMenuItem>
              )}
            </For>
          </DropdownMenuContent>
        </DropdownMenu>
      </Show>
      <Show when={failed()}>
        <span>{t("web.accounts.sign_out_failed")}</span>
      </Show>
    </li>
  );
}
