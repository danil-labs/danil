import { SignalDot } from "../../ui/SignalDot";
import CircleCheck from "lucide-solid/icons/circle-check";
import CircleDashed from "lucide-solid/icons/circle-dashed";
import CircleX from "lucide-solid/icons/circle-x";
import GitBranch from "lucide-solid/icons/git-branch";
import GitMerge from "lucide-solid/icons/git-merge";
import GitPullRequest from "lucide-solid/icons/git-pull-request";
import GitPullRequestClosed from "lucide-solid/icons/git-pull-request-closed";
import GitPullRequestDraft from "lucide-solid/icons/git-pull-request-draft";
import { type JSX, Show } from "solid-js";
import { Dynamic } from "solid-js/web";
import { FolderSquare } from "./FolderChip";
import { t } from "../../lib/i18n";
import type { AgentModels, AgentProfile, HandlerStatus } from "../../lib/model";
import { nombreDeModelo } from "../../lib/models";
import { MarcaAgente } from "../../ui/icons";
import { machineName, machineSystem, machines } from "../machines/store";
import { AstroAvatar } from "./AstroAvatar";
import { workLabel } from "./branchLabel";
import { displayName } from "./profiles";
import { type SessionRow, threadTitle } from "./Sessions";
import EtapaDeTarea from "./TaskStage";
import { type GitStatus } from "./taskGit";
import { type HoverCardPull, hoverCardPull } from "./hoverCardPull";


export type TaskHoverCardProps = {
  task: SessionRow;
  folderName?: string;
  folderId?: string;
  git?: GitStatus;
  /** Rótulo del CLI (`Agent.label`); sin él se muestra su id. */
  providerLabel?: string;
  /** Catálogo de modelos del CLI, para nombrar un alias como lo hace el selector. */
  models?: AgentModels | null;
  /** Perfil del agente de la tarea: nombre visible y cara. */
  agentProfile?: AgentProfile;
  agentStatus?: HandlerStatus;
  onOpen: () => void;
  onPin: () => void;
  onArchive: () => void;
};

function pullAppearance(state: HoverCardPull["state"]) {
  switch (state) {
    case "open": return { icon: GitPullRequest, color: "text-success-strong", label: t("projects.git.open") };
    case "draft": return { icon: GitPullRequestDraft, color: "text-neutral-500", label: t("projects.git.draft") };
    case "closed": return { icon: GitPullRequestClosed, color: "text-error-strong", label: t("projects.git.closed") };
    case "merged": return { icon: GitMerge, color: "text-brand-purple", label: t("projects.git.merged") };
    case "merged_other_head": return { icon: GitBranch, color: "text-neutral-500", label: t("projects.git.merged_other_head") };
  }
}

function checksAppearance(checks: HoverCardPull["checks"]) {
  switch (checks) {
    case "success": return { icon: CircleCheck, color: "text-success-strong", label: t("projects.git.checks_success") };
    case "failure": return { icon: CircleX, color: "text-error-strong", label: t("projects.git.checks_failure") };
    case "pending": return { icon: CircleDashed, color: "text-warning-strong", label: t("projects.git.checks_pending") };
    default: return null;
  }
}

function Fila(props: { label: string; children: JSX.Element }) {
  return (
    <div class="flex min-w-0 items-center gap-1.5">
      <span class="w-16 shrink-0 text-caption text-neutral-500">{props.label}</span>
      <span class="flex min-w-0 flex-1 items-center gap-1.5">{props.children}</span>
    </div>
  );
}

const BOTON =
  "rounded-sm border border-border-strong px-2 py-0.5 text-caption text-neutral-700 outline-none hover:bg-surface-muted focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

/** El cuerpo de la tarjeta: lo que se sabe de la tarea sin abrirla. */
export function TaskHoverCard(props: TaskHoverCardProps) {
  const rama = () => {
    const git = props.git;
    if (!git) return "";
    const label = workLabel(git.branch, git.alias);
    if (label) return label;
    return git.kind === "detached" && git.head ? t("projects.git.detached", { sha: git.head.slice(0, 7) }) : "";
  };
  const pull = () => hoverCardPull(props.git);
  const modelo = () => props.task.model
    ? nombreDeModelo(props.task.model, props.models)
    : t("projects.hover_card.default_model");
  const proveedor = () => props.providerLabel ?? props.task.provider;
  /** En qué máquina corre: la de la fila o, con más de una máquina, esta computadora. */
  const maquina = () => {
    const remota = props.task.machine;
    if (remota) return { id: remota, on: props.task.machine_on !== false, local: false };
    const todas = machines();
    const aqui = todas.length > 1 ? todas.find((m) => m.local) : undefined;
    return aqui ? { id: aqui.id, on: true, local: true } : null;
  };

  return (
    <div class="flex flex-col gap-1.5 text-xs text-neutral-950">
      <div class="text-ui leading-snug font-semibold break-words">{threadTitle(props.task)}</div>
      <Show when={props.task.last_message?.trim()}>
        {(mensaje) => (
          <p class="m-0 line-clamp-3 border-l-2 border-border-strong pl-2 text-caption leading-[1.4] break-words text-neutral-700">
            {mensaje()}
          </p>
        )}
      </Show>
      <Show when={props.folderName}>
        {(nombre) => (
          <Fila label={t("projects.hover_card.folder")}>
            <FolderSquare id={props.folderId ?? props.task.folder ?? nombre()} size={12} />
            <span class="truncate">{nombre()}</span>
          </Fila>
        )}
      </Show>
      <Show when={props.task.agent}>
        {(agente) => (
          <Fila label={t("projects.hover_card.agent")}>
            <AstroAvatar
              name={agente()}
              status={props.agentStatus ?? "asleep"}
              body={props.agentProfile?.body}
              avatar={props.agentProfile?.avatar}
              size={14}
            />
            <span class="truncate">{displayName(agente(), props.agentProfile)}</span>
          </Fila>
        )}
      </Show>
      {/* Solo con más de una máquina. Una fila de otra trae `machine`; la de esta
          computadora no, y se dice igual, con el nombre de esta máquina. */}
      <Show when={maquina()}>
        {(m) => (
          <Fila label={t("projects.hover_card.machine")}>
            <span class="inline-flex shrink-0"
              data-hover-machine={m().id}
              aria-label={m().on ? t("shell.machines.on") : t("shell.machines.off")}
            >
              <SignalDot tone={m().on ? "success" : "off"} />
            </span>
            <span class="truncate">
              {machineName(m().id, false)}
              <Show when={machineSystem(m().id)}>{(os) => <span class="text-neutral-500"> ({os()})</span>}</Show>
            </span>
          </Fila>
        )}
      </Show>
      <Fila label={t("projects.hover_card.provider")}>
        <span class="flex shrink-0" title={proveedor()} aria-label={proveedor()}>
          <MarcaAgente id={props.task.provider} size={12} />
        </span>
        <span class="truncate">{modelo()}</span>
      </Fila>
      <Show when={rama()}>
        <Fila label={t("projects.hover_card.branch")}>
          <GitBranch size={11} class="shrink-0 text-neutral-500" aria-hidden="true" />
          <span class="truncate text-neutral-700">{rama()}</span>
        </Fila>
      </Show>
      <Show when={pull()}>
        {(pr) => {
          const aspecto = () => pullAppearance(pr().state);
          const ci = () => checksAppearance(pr().checks);
          return (
            <Fila label={t("projects.hover_card.pr")}>
              <span class={`inline-flex shrink-0 items-center gap-1 ${aspecto().color}`}>
                <Dynamic component={aspecto().icon} size={12} aria-hidden="true" />
                #{pr().number}
              </span>
              <span class="truncate text-neutral-500">{aspecto().label}</span>
              <Show when={ci()}>
                {(c) => (
                  <span class={`inline-flex min-w-0 items-center gap-1 ${c().color}`}>
                    <Dynamic component={c().icon} size={12} class="shrink-0" aria-hidden="true" />
                    <span class="truncate">{c().label}</span>
                  </span>
                )}
              </Show>
            </Fila>
          );
        }}
      </Show>
      <Show when={props.task.stage}>
        <Fila label={t("projects.hover_card.stage")}>
          <EtapaDeTarea etapa={props.task.stage} />
        </Fila>
      </Show>
      <div class="mt-0.5 flex gap-1.5">
        <button type="button" class={BOTON} onClick={() => props.onOpen()}>{t("projects.hover_card.open")}</button>
        <button type="button" class={BOTON} onClick={() => props.onPin()}>
          {props.task.pinned ? t("projects.sessions.unpin") : t("projects.sessions.pin")}
        </button>
        <Show when={!props.task.archived}>
          <button type="button" class={BOTON} onClick={() => props.onArchive()}>{t("projects.hover_card.archive")}</button>
        </Show>
      </div>
    </div>
  );
}
