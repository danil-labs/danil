import Globe from "lucide-solid/icons/globe";
import Monitor from "lucide-solid/icons/monitor";
import X from "lucide-solid/icons/x";
import { type Accessor, Show } from "solid-js";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import type { AgentProfile } from "../../../../ui/src/lib/model";
import { ariaDeAtajo, textoDeAtajo } from "../../../../ui/src/lib/shortcuts";
import { isTaskTab, type Tab } from "../../../../ui/src/lib/tabs";
import { cn } from "../../../../ui/src/lib/utils";
import { MarcaAgente } from "../../../../ui/src/icons";
import { WithMentions } from "../../../../ui/src/WithMentions";
import { IconoDeArchivo } from "../../../../ui/src/FileIcon";
import { colorDeMarca, describirEstado, localDe } from "../model/ports";
import { AstroAvatar } from "./AstroAvatar";
import { displayName } from "../queries/profiles";
import SessionGit, { sessionGitDescription } from "../components/SessionGit";
import { readableSessionTitle, threadTitle } from "./Sessions";
import EstadoDeTarea, { taskLabel } from "./TaskStatus";
import { taskPriority } from "../../../../ui/src/index";
import { type GitStatus } from "../queries/taskGit";
import { Pressable } from "../../../../ui/src/Pressable";
import type { TabStripProps } from "./tabs-model";

export function createRenderTab(props: TabStripProps, deps: { gitRows: Accessor<Record<string, GitStatus>>; profiles: Accessor<Record<string, AgentProfile>>; separators: Accessor<Set<string>>; labels: Accessor<Map<string, string>>; reveal: (n: number) => void }) {
  const { gitRows, profiles, separators, labels, reveal } = deps;
  const renderTab = (p: Tab, i: () => number) => {
    const active = () => p.id === props.activeId;
    const transient = () => props.pinnedIds !== undefined && !props.pinnedIds.has(p.id);
    const task = () => isTaskTab(p);
    const row = () => props.session(p.session);
    const agentProfile = () => {
      const s = row();
      return s?.agent ?? null;
    };
    const legacyConversation = () => !!row()?.chat_de_agente;
    const sinEmpezar = () => {
      const s = row();
      return isTaskTab(p) && s?.turns === 0 && !s.chat_de_agente && !s.subagent && !props.liveIds.includes(p.session);
    };
    const fullTitle = () => {
      if (sinEmpezar()) return t("projects.view.new_task");
      const agent = agentProfile();
      if (agent && isTaskTab(p)) {
        if (!legacyConversation()) return row()?.title ?? p.titulo;
        return row()?.agent_thread
          ? t("projects.threads.heading", { name: displayName(agent, profiles()[agent]), title: threadTitle(row()) })
          : displayName(agent, profiles()[agent]);
      }
      return isTaskTab(p) || p.clase === "pantalla"
        ? (isTaskTab(p) && props.session(p.session)?.subagent ? readableSessionTitle(p.titulo) : p.titulo)
        : (labels().get(p.id) ?? "");
    };
    // Anteponer el agente haría que varios títulos truncaran con el mismo texto.
    const text = () => {
      const s = row();
      return isTaskTab(p) && agentProfile() && s?.agent_thread && !s.inbox ? threadTitle(s) : fullTitle();
    };
    const detail = () =>
      p.clase === "archivo"
        ? p.ruta
        : p.clase === "artefacto"
          ? p.rel
          : p.clase === "sitio"
            ? p.url
            : undefined;
    const activity = () => taskPriority({ aprobando: props.approvingIds.includes(p.session), viva: props.liveIds.includes(p.session), esperando: props.waitingIds.includes(p.session), outcome: props.session(p.session)?.outcome });
    const description = () => isTaskTab(p) ? [fullTitle(), taskLabel(activity()), sessionGitDescription(gitRows()[p.session])].filter(Boolean).join(" · ") : undefined;
    const startsGroup = () => separators().has(p.id);
    const dirty = () => props.dirtyIds.has(p.id);
    const local = () =>
      p.clase === "archivo" ? localDe(p.project, p.session, p.arbol, p.ruta) : undefined;
    const statusDecorated = (base: string | undefined) => {
      const l = local();
      return l ? [base, describirEstado(l)].filter(Boolean).join(" · ") : base;
    };
    return (
      <>
        <Show when={startsGroup()}>
          <span
            aria-hidden="true"
            class="mx-1 h-4 w-px shrink-0 self-center bg-border"
          />
        </Show>
        <Show when={props.dropIndex === i()}>
          <span
            aria-hidden="true"
            class="-mx-px h-5 w-0.5 shrink-0 self-center rounded-full bg-primary"
          />
        </Show>
        {/* Un botón dentro de role=tab queda oculto en algunos árboles de accesibilidad. */}
        <div
          data-envoltorio={i()}
          data-preview={transient() ? "" : undefined}
          onPointerDown={(e) => {
            if ((e.target as HTMLElement).closest("button")) return;
            props.onDrag?.(p.id, e);
          }}
          class={cn(
            "group flex h-[30px] shrink-0 touch-none items-center rounded-sm pr-1 select-none",
            task() ? "w-[220px] text-ui" : "w-[180px] text-label",
            active()
              ? "tab-active font-semibold text-neutral-950"
              : "font-medium text-neutral-500 hover:bg-neutral-950/5 hover:text-neutral-950",
          )}
        >
          <div
            role={transient() ? "button" : "tab"}
            aria-selected={transient() ? undefined : active()}
            aria-current={transient() && active() ? "true" : undefined}
            onDblClick={(event) => {
              event.stopPropagation();
              props.onPin?.(p.id);
            }}
            tabindex={active() || (i() === 0 && !props.tabs.some((x) => x.id === props.activeId)) ? 0 : -1}
            data-pestana={transient() ? undefined : i()}
            title={statusDecorated(
              dirty()
                ? t("projects.tabs.unsaved.named", { title: detail() ?? text() })
                : (description() ?? detail()),
            )}
            aria-label={statusDecorated(
              dirty()
                ? t("projects.tabs.unsaved.named", { title: text() })
                : (description() ?? (local() ? text() : undefined)),
            )}
            onClick={() => {
              props.onPick(p.id);
              // El foco del clic solo revela el tab, sin su botón de cerrar.
              reveal(i());
            }}
            onAuxClick={(e) => {
              if (e.button === 1) {
                e.preventDefault();
                props.onClose(p.id);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                props.onPick(p.id);
              }
              if (e.key === "Delete") {
                e.preventDefault();
                props.onClose(p.id);
              }
            }}
            class={cn(
              "flex h-full min-w-0 flex-1 cursor-default items-center gap-1.5 rounded-sm outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
              task() ? "pl-2" : "pl-1.5 font-mono",
              transient() && "font-normal italic",
            )}
          >
            <Show
              when={isTaskTab(p)}
              fallback={
              <Show
                  when={p.clase !== "sitio" && p.clase !== "pantalla"}
                  fallback={
                    <Show when={p.clase === "pantalla"} fallback={<Globe size={12} class="shrink-0 text-neutral-500" aria-hidden={true} />}>
                      <Monitor size={12} class="shrink-0 text-neutral-500" aria-hidden={true} />
                    </Show>
                  }
                >
                  <IconoDeArchivo
                    ruta={detail() ?? ""}
                    size={12}
                    class="shrink-0 text-neutral-500"
                  />
                </Show>
              }
            >
              <span class="inline-flex shrink-0 items-center gap-1">
                  <EstadoDeTarea
                    outcome={row()?.outcome}
                    aprobando={props.approvingIds.includes(p.session)}
                    viva={props.liveIds.includes(p.session)}
                    esperando={props.waitingIds.includes(p.session)}
                  />
                <Show
                  when={agentProfile()}
                  fallback={
                    <Show when={row()?.provider}>
                      {(agent) => (
                        <span class="inline-flex shrink-0" title={agent()} aria-label={agent()}>
                          <MarcaAgente id={agent()} size={12} />
                        </span>
                      )}
                    </Show>
                  }
                >
                  {(name) => (
                    <span class="inline-flex shrink-0" title={name()} aria-label={name()}>
                      <AstroAvatar
                        name={name()}
                        status="awake"
                        body={profiles()[name()]?.body}
                        avatar={profiles()[name()]?.avatar}
                        size={16}
                      />
                    </span>
                  )}
                </Show>
                <Show when={!agentProfile()}>
                  <SessionGit compact status={gitRows()[p.session]} />
                </Show>
              </span>
            </Show>
            <span class={cn("min-w-0 flex-1 truncate", local() && colorDeMarca(local()!.marca))}>
              <Show when={isTaskTab(p)} fallback={text()}>
                <WithMentions>{text()}</WithMentions>
              </Show>
            </span>
            <Show when={local()}>
              {(l) => (
                <span
                  aria-hidden="true"
                  class={cn("shrink-0 text-2xs font-semibold", colorDeMarca(l().marca))}
                >
                  {l().marca}
                </span>
              )}
            </Show>
          </div>
          <Pressable
            tabindex={-1}
            aria-label={t("projects.tabs.close_named", {
              title: detail() ?? text(),
            })}
            title={`${t("projects.tabs.close")} (${textoDeAtajo("closeTab")})`}
            aria-keyshortcuts={active() ? ariaDeAtajo("closeTab") : undefined}
            onClick={() => props.onClose(p.id)}
            class={cn(
              "grid size-5 shrink-0 place-items-center rounded-sm text-neutral-500 outline-none hover:bg-neutral-200 hover:text-neutral-950 focus-visible:opacity-100",
              active() || dirty()
                ? "opacity-100"
                : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
            )}
          >
            {/* El punto de borrador debe seguir visible: cerrar la pestaña puede perder lo escrito. */}
            <Show when={dirty()} fallback={<X size={13} />}>
              <span
                aria-hidden="true"
                class={cn(
                  "size-1.5 rounded-full group-hover:hidden",
                  active() ? "bg-neutral-950" : "bg-neutral-500",
                )}
              />
              <X
                size={13}
                class="hidden group-hover:block"
              />
            </Show>
          </Pressable>
        </div>
      </>
    );
  };
  return renderTab;
}
