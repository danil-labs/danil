import { createMemo, type JSX, Show } from "solid-js";
import { Dynamic } from "solid-js/web";
import { tareaEnVuelo } from "../../../../../apps/desktop/src/lib/drag";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { esProvisional } from "../../../../../apps/desktop/src/lib/taskDraft";
import { cn } from "../../../../../apps/desktop/src/lib/utils";
import { MarcaAgente } from "../../../../ui/src/icons";
import FolderChip from "./FolderChip";
import { gitAppearance, RailPull, sessionGitDescription } from "../components/SessionGit";
import { WithTaskHoverCard } from "../components/TaskHoverCardTrigger";
import { MachineChip } from "../model/ports";
import { AstroAvatar } from "./AstroAvatar";
import { displayName } from "../queries/profiles";
import EtapaDeTarea from "./TaskStage";
import EstadoDeTarea from "./TaskStatus";
import { sharesTaskGit } from "../queries/taskGit";
import type { TaskActivity } from "@terminus/design";
import { taskCard } from "@terminus/tasks";
import { shortTaskTime, type SessionRow, type SessionsProps } from "./sessions-model";
import type { SessionsState } from "./sessions-state";

export function createFilaDelRiel(props: SessionsProps, state: SessionsState) {
  const { hideFolder, gitDe, gitRows, profiles, menu, tarjetaDelRiel, hayMaquinas, projectOf, machines } = state;
  /** La tarjeta compartida mide 52 px; estado, menú y hora comparten la columna derecha. */
  const FilaDelRiel = (r: {
    s: SessionRow;
    actividad: TaskActivity;
    titulo: JSX.Element;
    /** Terminada y vista: la fila se apaga y vuelve a su color al pasar el puntero. */
    apagada: boolean;
    /** Si el hueco del estado puede pasar a ser el menú: no renombrando ni en solo lectura. */
    conMenu: boolean;
    menu: () => JSX.Element;
    cohete: () => JSX.Element;
  }) => {
    // Qué lleva la línea 2 lo decide la tarjeta compartida con el teléfono (`@terminus/tasks`).
    const tarjeta = () => taskCard(r.s, { live: props.vivas, approving: props.aprobando, hideFolder: hideFolder(r.s), hideMachine: props.hideMachine });
    const activeAgent = () => r.s.agent;
    const git = () => gitDe(r.s);
    // La rama de quien comparte el árbol de su padre se dice en la fila del padre.
    const propioDeOtra = () => !!git().shared_with || sharesTaskGit(r.s, gitRows(), props.relatedSessions ?? props.sessions);
    const nombre = (agente: string) => displayName(agente, profiles()[agente]);
    // Con un motor que no manda `last_turn_at`, la última vez que se movió.
    const cuando = () => r.s.last_turn_at ?? r.s.updated_at;
    // Memo: al hacer clic el menú se reinicia y, sin él, la ranura reescribe su clase.
    const abierto = createMemo(() => menu() === r.s.id);
    // La sección dice kn, el PR o, sin PR, el nombre de la rama.
    const conPr = () => (git().kind === "branch" || git().kind === "detached") && !!git().pull_known && !!git().pull;
    const conGit = () => !propioDeOtra() && (git().kind === "kn" || git().kind === "branch" || conPr());
    const gitStyle = () => {
      const appearance = gitAppearance(git());
      return git().stale ? { ...appearance, color: "text-neutral-500" } : appearance;
    };
    return <div class={cn("task-card-lines", r.conMenu && "task-card-with-menu")} data-menu-open={abierto() ? "" : undefined}>
      <div class="task-card-main">
        <div class="task-card-title flex h-[22px] min-w-0 items-center gap-1.5">
          <Show when={activeAgent()}>
            {(agent) => (
              <span class="task-card-face" data-session-agent title={nombre(agent())} aria-label={nombre(agent())}>
                <AstroAvatar name={agent()} status="awake" body={profiles()[agent()]?.body} avatar={profiles()[agent()]?.avatar} size={16} />
              </span>
            )}
          </Show>
          <div class="min-w-0 flex-1">{r.titulo}</div>
          <Show when={!tarjetaDelRiel()}><EtapaDeTarea etapa={r.s.stage} /></Show>
        </div>
        <div data-session-preview data-no-folder={hideFolder(r.s) ? "" : undefined} data-no-machine={hayMaquinas() ? undefined : ""} class={cn("task-card-metadata text-xs font-normal leading-4 text-neutral-500", activeAgent() && "task-card-has-agent", r.apagada && "opacity-80 group-hover/session:opacity-100")}>
          <span data-session-provider class="task-card-provider" title={tarjeta().mark ?? r.s.provider} aria-label={tarjeta().mark ?? r.s.provider}><MarcaAgente id={tarjeta().mark ?? r.s.provider} size={13} /></span>
          <Show when={!hideFolder(r.s)}>
            <span class="task-card-slot">
              <Show when={props.carpetaDe?.(r.s)}>{folder =>
                <FolderChip id={projectOf(r.s)} name={folder()} untitled={tarjetaDelRiel()} class="min-w-0 text-xs text-neutral-500" />
              }</Show>
            </span>
          </Show>
          <Show when={hayMaquinas()}>
            <span class="task-card-slot">
              <MachineChip machine={r.s.machine || machines().find((machine) => machine.local)?.id || "local"} on={r.s.machine_on !== false} class="min-w-0" />
            </span>
          </Show>
          <span class="task-card-git">
            <Show when={conGit()}><Show when={git().kind === "kn" || !conPr()} fallback={<RailPull status={git()} />}>
                <span data-session-pr class={cn("inline-flex min-w-0 items-center gap-1", gitStyle().color)} title={sessionGitDescription(git())} aria-label={sessionGitDescription(git())}><Dynamic component={gitStyle().icon} size={12} aria-hidden="true" /><Show when={git().kind === "branch"}><span class="min-w-0 truncate">{git().branch}</span></Show></span>
              </Show></Show>
            <span class="task-card-tail">
              <Show when={r.s.deferred}><span data-deferred class="shrink-0 text-neutral-500" title={t("projects.sessions.deferred")} aria-label={t("projects.sessions.deferred")}>⧗</span></Show>
              <span class="task-card-rocket">{r.cohete()}</span>
            </span>
          </span>
        </div>
      </div>
      {/* La hora y el ⋯ (y, con ellos, el loader y el punto) en una caja
          pegada al padding derecho. El loader no se mueve aunque la hora sea
          más ancha, y el ⋯ se centra sobre él. */}
      <div class="task-card-end">
        <div class="task-card-end-mark">
          <span data-session-status class="task-card-mark">
            <EstadoDeTarea {...r.actividad}
              tarjeta
              provisional={esProvisional(r.s.id)} archivada={!!r.s.archived} />
          </span>
          <Show when={r.conMenu}><span data-session-actions class={cn("absolute inset-y-0 left-1/2 z-10 hidden w-[22px] -translate-x-1/2 items-center justify-center group-hover/session:inline-flex group-focus-within/session:inline-flex", abierto() && "inline-flex")} data-abierto={abierto() ? "true" : undefined}>{r.menu()}</span></Show>
        </div>
        <span data-session-time class="task-card-time text-[0.71875rem] tabular-nums">{shortTaskTime(cuando())}</span>
      </div>
    </div>;
  };
  return FilaDelRiel;
}

export function createConTarjeta(props: SessionsProps, state: SessionsState) {
  const { tarjetaDelRiel, projectOf, gitDe, profiles, renombrando, menu, setPinned, intentar } = state;
  /** En el riel y en las delegadas la fila lleva su tarjeta flotante; en las demás listas, no. */
  const ConTarjeta = (c: { s: SessionRow; children: JSX.Element }) => (
    <Show when={tarjetaDelRiel()} fallback={c.children}>
      <WithTaskHoverCard
        task={c.s}
        placement={props.hoverCardPlacement}
        folderName={props.carpetaDe?.(c.s)}
        folderId={projectOf(c.s) || undefined}
        git={gitDe(c.s)}
        agentProfile={c.s.agent ? profiles()[c.s.agent] : undefined}
        agentStatus={props.vivas.includes(c.s.id) ? "working" : undefined}
        disabled={props.readOnly || renombrando() === c.s.id || menu() === c.s.id || !!tareaEnVuelo()}
        onOpen={() => props.onPick(c.s.id)}
        onPin={() => void setPinned(c.s)}
        onArchive={() => void intentar(c.s.id, false)}
      >
        {c.children}
      </WithTaskHoverCard>
    </Show>
  );
  return ConTarjeta;
}
