import { SignalDot } from "../../ui/SignalDot";
import {
  type Answer,
  type Computer,
  type ConnectProgress,
  installCommand,
  listComputers,
  watchNewComputer,
} from "@terminus/computers";
import Check from "lucide-solid/icons/check";
import Copy from "lucide-solid/icons/copy";
import { createSignal, For, Match, onCleanup, onMount, Show, Switch } from "solid-js";
import { t } from "../../lib/i18n";
import { createCopied } from "../../lib/clipboard";
import { invoke } from "../../lib/invoke";
import { capabilities } from "../../lib/platform";
import { Button } from "../../ui/Button";
import { Input } from "../../ui/Input";
import { Spinner } from "../../ui/Spinner";
import { SettingsBlock, SettingsSection } from "../settings/layout";

export type ConnectMachineProps = {
  /** `GET /v1/computers` con la sesión de la cuenta. */
  list: () => Promise<Answer<Computer[]>>;
  /** La nueva ya está en línea: abrirla o volver a leer la flota. */
  onReady: (computer: Computer) => void;
};

/**
 * «Conectar otra máquina»: el comando para la terminal de un VPS, otra laptop
 * o una Raspberry Pi, y la espera a que aparezca en la cuenta. Si se queda en
 * un tramo, dice cuál y cómo arreglarlo (la referencia es `t3 connect`).
 */
export function ConnectMachine(props: ConnectMachineProps) {
  const [name, setName] = createSignal("");
  const { copied, copy: copyCommand } = createCopied(2000);
  const [progress, setProgress] = createSignal<ConnectProgress>({ stage: "waiting" });
  let stop: AbortController | null = null;
  const command = () => installCommand({ name: name() });

  async function start() {
    stop?.abort();
    const mine = new AbortController();
    stop = mine;
    setProgress({ stage: "waiting" });
    // Lo que ya había al abrir no es la máquina nueva.
    const before = await props.list().catch(() => null);
    if (mine.signal.aborted) return;
    const known = before?.kind === "ok" ? before.value.map((c) => c.computer_id) : [];
    await watchNewComputer({ list: props.list, known, onProgress: setProgress, signal: mine.signal });
  }

  onMount(() => void start());
  onCleanup(() => stop?.abort());

  const copy = () => copyCommand(command());

  const failed = () => {
    const p = progress();
    return p.stage === "failed" ? p : null;
  };
  const machine = () => {
    const p = progress();
    return "computer" in p && p.computer ? p.computer.name?.trim() || p.computer.computer_id : "";
  };
  const steps = () => {
    const stage = progress().stage;
    const enrolled = stage === "enrolled" || stage === "online" || failed()?.hop === "relay" || failed()?.hop === "version";
    return [
      { key: "install", done: enrolled, text: t("danil.connect_machine.step_install") },
      { key: "approve", done: enrolled, text: t("danil.connect_machine.step_approve") },
      { key: "online", done: stage === "online", text: t("danil.connect_machine.step_online") },
    ];
  };

  return (
    <div class="grid gap-3 text-sm" data-connect-machine={progress().stage}>
      <p class="m-0 text-neutral-500">{t("danil.connect_machine.intro")}</p>
      <label class="grid gap-1 text-xs text-neutral-500">
        {t("danil.connect_machine.name")}
        <Input
          value={name()}
          maxLength={120}
          placeholder={t("danil.connect_machine.name_placeholder")}
          onInput={(e) => setName(e.currentTarget.value)}
          data-connect-name=""
        />
      </label>
      <div class="flex items-start gap-2 rounded-sm border border-border bg-surface-muted p-2">
        <code class="min-w-0 flex-1 font-mono text-xs break-all text-neutral-950" data-connect-command="">
          {command()}
        </code>
        <Button size="sm" variant="ghost" onClick={() => void copy()} aria-label={t("danil.connect_machine.copy")} data-connect-copy="">
          <Show when={copied()} fallback={<Copy size={13} aria-hidden="true" />}>
            <Check size={13} aria-hidden="true" />
          </Show>
        </Button>
      </div>
      <p class="m-0 text-xs text-neutral-500">{t("danil.connect_machine.platforms")}</p>
      <ol class="m-0 grid list-none gap-1.5 p-0">
        <For each={steps()}>
          {(step, i) => (
            <li class="flex items-center gap-2" data-connect-step={step.key} data-done={step.done ? "true" : "false"}>
              <span class="grid size-4 shrink-0 place-items-center">
                <Show
                  when={step.done}
                  fallback={
                    <Show
                      when={!failed() && steps().findIndex((s) => !s.done) === i()}
                      fallback={<SignalDot tone="off" />}
                    >
                      <Spinner />
                    </Show>
                  }
                >
                  <Check size={13} class="text-success" aria-hidden="true" />
                </Show>
              </span>
              <span class={step.done ? "text-neutral-950" : "text-neutral-500"}>{step.text}</span>
            </li>
          )}
        </For>
      </ol>
      <Switch>
        <Match when={progress().stage === "enrolled"}>
          <p class="m-0 text-xs text-neutral-500">{t("danil.connect_machine.enrolled", { name: machine() })}</p>
        </Match>
        <Match when={progress().stage === "online"}>
          <div class="flex items-center gap-3">
            <p class="m-0 flex-1 text-neutral-950">{t("danil.connect_machine.online", { name: machine() })}</p>
            <Button
              size="sm"
              onClick={() => {
                const p = progress();
                if (p.stage === "online") props.onReady(p.computer);
              }}
              data-connect-open=""
            >
              {t("danil.connect_machine.open")}
            </Button>
          </div>
        </Match>
        <Match when={failed()}>
          {(f) => (
            <div class="grid gap-1 rounded-sm border border-border p-2" role="alert" data-connect-failed={f().code} data-hop={f().hop}>
              <p class="m-0 text-error-strong">{t(`danil.connect_machine.failed.${f().code}`, { name: machine() })}</p>
              <p class="m-0 text-xs text-neutral-500">
                {t("danil.connect_machine.hop", { hop: t(`danil.connect_machine.hop.${f().hop}`) })}
              </p>
              <p class="m-0 text-xs text-neutral-700">{t(`danil.connect_machine.fix.${f().code}`)}</p>
              <div class="pt-1">
                <Button size="sm" variant="secondary" onClick={() => void start()}>
                  {t("danil.connect_machine.retry")}
                </Button>
              </div>
            </div>
          )}
        </Match>
      </Switch>
      <p class="m-0 text-xs text-neutral-500">{t("danil.connect_machine.own_power")}</p>
    </div>
  );
}

/** Dónde se lee la lista para conectar: lo que da la plataforma (la web) o, en el escritorio con cuenta, su token de cliente. */
export function connectSource(account?: string | null): ConnectMachineProps | null {
  const given = capabilities().connectMachine;
  if (given) return given;
  if (!capabilities().danilAccount) return null;
  return {
    list: async () => {
      const client = await invoke<{ token: string; endpoint: string }>("account_relay_token", account ? { account } : {}).catch(() => null);
      return client ? listComputers(client.endpoint, client.token) : { kind: "error", status: null };
    },
    // La flota del escritorio vuelve a leer la cuenta (`account.tsx`) y suma la nueva.
    onReady: () => window.dispatchEvent(new CustomEvent("harness:account-computers")),
  };
}

/** Configuración → Cuenta de Danil: el botón y, abierto, el comando y la espera. */
export function ConnectMachineSection(props: { account?: string | null } = {}) {
  const source = connectSource(props.account);
  const [open, setOpen] = createSignal(false);
  return (
    <Show when={source}>
      {(s) => (
        <SettingsSection title={t("danil.connect_machine.title")} description={t("danil.connect_machine.description")}>
          <SettingsBlock>
            <Show
              when={open()}
              fallback={
                <Button size="sm" variant="secondary" class="justify-self-start" onClick={() => setOpen(true)} data-connect-machine-open="">
                  {t("danil.connect_machine.button")}
                </Button>
              }
            >
              <div class="grid gap-3">
                <p class="m-0 text-xs text-neutral-500">{t("danil.connect_machine.workspace_hint")}</p>
                <ConnectMachine {...s()} onReady={(c) => { s().onReady(c); setOpen(false); }} />
              </div>
            </Show>
          </SettingsBlock>
        </SettingsSection>
      )}
    </Show>
  );
}
