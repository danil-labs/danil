import Folder from "lucide-solid/icons/folder";
import { SignalDot } from "../../ui/SignalDot";
import GitBranch from "lucide-solid/icons/git-branch";
import Monitor from "lucide-solid/icons/monitor";
import { MachineIcon } from "../machines/MachineIcon";
import { machineName, machineWakes } from "../machines/store";
import { type JSX, Show } from "solid-js";
import { createCopied } from "../../lib/clipboard";
import { t } from "../../lib/i18n";
import { capabilities, machineScreen } from "../../lib/platform";
import { cn } from "../../lib/utils";
import { RETARDO_TOOLTIP, TooltipContent, TooltipRoot, TooltipTrigger } from "../../ui/Tooltip";

export type TaskLocationProps = {
  /** El `machine` de la fila; sin él, la máquina de la ventana. */
  machine?: string;
  on: boolean;
  project?: string;
  /** La carpeta de trabajo de la tarea (su worktree). */
  path?: string;
  branch?: string;
  /** Intenta abrir la pantalla de esa máquina cuando está encendida. */
  onScreen?: (machine: string) => void;
  onFiles?: () => void;
};

const PARTE = "flex h-[30px] min-w-0 items-center gap-1.5 rounded-sm px-2 whitespace-nowrap";

function Pista(props: { tip: JSX.Element; children: JSX.Element; class?: string; onClick?: () => void; label?: string }) {
  return (
    <TooltipRoot openDelay={RETARDO_TOOLTIP} placement="bottom-start" gutter={4}>
      <TooltipTrigger
        as={props.onClick ? "button" : "span"}
        type={props.onClick ? "button" : undefined}
        aria-label={props.label}
        class={cn(PARTE, props.onClick && "cursor-pointer border-0 bg-transparent font-[inherit] outline-none hover:bg-neutral-200 hover:text-neutral-950 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-primary", props.class)}
        onClick={props.onClick}
      >
        {props.children}
      </TooltipTrigger>
      <TooltipContent class="font-medium">{props.tip}</TooltipContent>
    </TooltipRoot>
  );
}

/** Máquina / proyecto / rama de la tarea, arriba a la izquierda de su ventana. */
export default function TaskLocation(props: TaskLocationProps) {
  const here = () => capabilities().windowMachine?.();
  const nombre = () => (props.machine ? machineName(props.machine) : (here()?.name ?? machineName("local")));
  const id = () => props.machine ?? here()?.id ?? "local";
  const wakes = () => machineWakes(id());
  const { copied: copiada, copy: copiar } = createCopied();
  const pantalla = () => {
    const m = props.machine ?? here()?.id;
    const open = machineScreen(m ?? "");
    return m && props.on && props.onScreen && open ? m : null;
  };
  const Sep = () => <span aria-hidden="true" class="shrink-0 px-px text-neutral-500/60">/</span>;

  return (
    <nav
      data-task-location=""
      data-task-location-on={props.on ? "true" : "false"}
      aria-label={t("chat.location.label")}
      class="relative z-10 flex min-w-0 shrink-0 items-center gap-px px-3.5 pt-2 text-ui text-neutral-500"
    >
      <Pista
        class={cn("max-w-[40%] shrink", !props.on && "opacity-65")}
        tip={props.on ? t("shell.machines.task_on", { name: nombre() }) : t("shell.machines.task_off", { name: nombre() })}
      >
        <MachineIcon wakes={wakes()} size={14} class="shrink-0" />
        <span data-task-location-machine="" class="min-w-0 truncate">{nombre()}</span>
        <SignalDot tone={props.on ? "success" : "off"} />
      </Pista>
      <Show when={props.project}>
        {(proyecto) => (
          <>
            <Sep />
            <Pista
              class="max-w-[35%] shrink font-medium text-neutral-700"
              onClick={props.onFiles}
              label={props.onFiles ? t("shell.folder.view_on", { name: nombre() }) : undefined}
              tip={<>{props.onFiles ? t("shell.folder.view_on", { name: nombre() }) : t("chat.location.project")}<Show when={props.path}>{(ruta) => <span class="block font-mono text-caption font-normal opacity-80">{ruta()}</span>}</Show></>}
            >
              <Folder size={14} aria-hidden="true" class="shrink-0" />
              <span data-task-location-project="" class="min-w-0 truncate">{proyecto()}</span>
            </Pista>
          </>
        )}
      </Show>
      <Show when={props.branch}>
        {(rama) => (
          <>
            <Sep />
            <Pista
              class="min-w-0 shrink text-neutral-500"
              label={t("chat.location.copy_branch", { branch: rama() })}
              tip={copiada() ? t("chat.location.copied") : t("chat.location.copy_branch", { branch: rama() })}
              onClick={() => copiar(rama())}
            >
              <GitBranch size={14} aria-hidden="true" class="shrink-0" />
              <span data-task-location-branch="" class="min-w-0 truncate font-mono text-[0.71875rem]">{rama()}</span>
            </Pista>
          </>
        )}
      </Show>
      <Show when={pantalla()}>
        {(m) => (
          <Pista
            class="ml-1 shrink-0 text-neutral-500"
            label={t("screen.open_tip", { name: nombre() })}
            tip={t("screen.open_tip", { name: nombre() })}
            onClick={() => props.onScreen?.(m())}
          >
            <Monitor size={14} aria-hidden="true" class="shrink-0" />
            <span data-task-location-screen="">{t("screen.open")}</span>
          </Pista>
        )}
      </Show>
    </nav>
  );
}
