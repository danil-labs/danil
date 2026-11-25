import Pin from "lucide-solid/icons/pin";
import TriangleAlert from "lucide-solid/icons/triangle-alert";
import { createMemo, Show } from "solid-js";
import { arrastrar, fueArrastre, tareaEnVuelo } from "../../../../ui/src/lib/drag";
import { enfocarYSeleccionar } from "../../../../ui/src/lib/focus";
import { t } from "../../../../ui/src/lib/i18n";
import { SESSION_TITLE_MAX_LENGTH } from "../../../../ui/src/lib/projectNames";
import { esProvisional } from "../../../../ui/src/lib/taskDraft";
import { cn } from "../../../../ui/src/lib/utils";
import { FinishTaskButton } from "../../../../ui/src/FinishTaskButton";
import { Input } from "../../../../ui/src/Input";
import { WithMentions } from "../../../../ui/src/WithMentions";
import { canFinishTask, effectiveTaskGit } from "../queries/taskGit";
import { type TaskActivity, taskPriority } from "../../../../ui/src/index";
import { readableSessionTitle, type SessionRow, type SessionsProps } from "./sessions-model";
import type { SessionsState } from "./sessions-state";
import type { createConTarjeta, createFilaDelRiel } from "./sessions-card";
import { createFilaMenu } from "./sessions-row-menu";

export function createFila(props: SessionsProps, state: SessionsState, FilaDelRiel: ReturnType<typeof createFilaDelRiel>, ConTarjeta: ReturnType<typeof createConTarjeta>) {
  const { renombrando, setRenombrando, borrador, setBorrador, tarjetaDelRiel, fijada, contextual, gitRows, empezarARenombrar, finishing, intentar, menu, projectOf } = state;
  const Fila = (f: { s: SessionRow }) => {
    // En la barra el coordinador lleva también la actividad de sus subtareas, que no se pintan ahí.
    const activity = (): TaskActivity => (props.sidebar ? f.s.delegated_activity : undefined) ?? ({
      aprobando: props.aprobando.includes(f.s.id),
      viva: props.vivas.includes(f.s.id),
      esperando: f.s.esperando,
      outcome: f.s.outcome,
      sinVer: f.s.sin_ver,
    });
    // Agrupando por agente la cabecera ya lo dice; en el chat del agente, también.
    const title = () => f.s.inbox ? t("projects.threads.inbox")
      : f.s.chat_de_agente && !f.s.agent_thread ? t("projects.threads.persistent_chat")
      : f.s.command_title ? t("projects.threads.command")
      : f.s.title;
    /**
     * Cierra el renombrado guardando lo escrito.
     *
     * **Salir del campo guarda, no cancela.** Un campo en línea sin botón de
     * guardar cuyo `onBlur` descarta borra lo tecleado al ir a pulsar cualquier
     * otra cosa, sin decir nada. Descartar tiene su gesto, y es `Escape`.
     *
     * Un nombre en blanco no borra el que había: el vacío no es un nombre, y
     * Rust lo rechaza igual (`sessions::titulo_de_tarea`).
     */
    const guardarNombre = () => {
      if (renombrando() !== f.s.id) return;
      const n = borrador().trim();
      setRenombrando(null);
      if (n && n !== f.s.title) props.onRenombrar(f.s.id, n);
    };

    /** `missing_source` no se marca: borrar la fuente de una receptora fijada es legítimo. */
    const handoffRoto = () => f.s.handoff_issue === "contradictory" || f.s.handoff_issue === "cycle";
    const marcaDeFijada = () => <span role="img" aria-label={t("projects.sessions.pinned")} title={t("projects.sessions.pinned")} class="shrink-0 text-neutral-500"><Pin size={12} /></span>;
    /**
     * Terminada y vista en la tarjeta del riel: sin marca, la fila se apaga
     * —el título en `neutral-700` y la segunda línea al 80 %— y recupera su color al
     * pasar el puntero.
     */
    const apagada = createMemo(() => tarjetaDelRiel() && !taskPriority(activity()) && !esProvisional(f.s.id));
    const conMenu = createMemo(() => !props.readOnly && renombrando() !== f.s.id && (props.draggedTask ?? tareaEnVuelo()?.id) !== f.s.id);
    // Sin memo, el clic (que pasa por «en vuelo») reescribe las clases con el mismo valor: tests/perf/open-task-cost.mjs.
    /** El título, o el campo que lo renombra en su sitio y con su misma medida. */
    const Titulo = () => (
      <>
      {/* El campo debe conservar la altura y tipografía del título para no desplazar el historial al editar. */}
      <Show
        when={renombrando() === f.s.id}
        fallback={
          // El cohete es absoluto: sin este hueco el título se mete debajo. Por
          // `:has`, no por clase reactiva: cada fila mutaría al llegar git.
          <div class={cn(
            "flex min-w-0 items-center gap-1 text-ui leading-[1.35]",
            // La tarjeta del riel: 13,5 px en su línea de 18, sin chincheta ni «Contexto».
            tarjetaDelRiel() && "text-[0.84375rem] leading-[18px]",
            apagada() && "text-neutral-700 group-hover/session:text-neutral-950",
          )}>
            <Show when={fijada(f.s) && !tarjetaDelRiel()}>{marcaDeFijada()}</Show>
            <Show when={handoffRoto()}><span role="img" aria-label={t("projects.sessions.handoff_issue")} title={t("projects.sessions.handoff_issue")} class="shrink-0 text-warning-strong"><TriangleAlert size={12} /></span></Show>
            <Show when={contextual(f.s) && !tarjetaDelRiel()}><span class="shrink-0 text-caption font-normal text-neutral-500">{t("projects.sessions.context")}</span></Show>
            <span class="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap"><WithMentions>{f.s.subagent ? readableSessionTitle(title()) : title()}</WithMentions></span>
          </div>
        }
      >
        <form
          data-session-rename
          class="min-w-0"
          onSubmit={(e) => {
            e.preventDefault();
            guardarNombre();
          }}
        >
          <Input
            ref={enfocarYSeleccionar}
            variant="ghost"
            // `font-sans` conserva la letra del título, y
            // `p-0`/`min-h-0` devuelve su altura: 13 px por 1,35, los
            // mismos que el título. El peso lo hereda, para que
            // la tarea abierta siga en negrita mientras se renombra.
            class="block h-auto min-h-0 rounded-none border-0 p-0 font-sans text-ui leading-[1.35] text-inherit [font-weight:inherit]"
            maxlength={SESSION_TITLE_MAX_LENGTH}
            value={borrador()}
            aria-label={t("projects.sessions.rename_label", {
              title: f.s.title,
            })}
            onInput={(e) => setBorrador(e.currentTarget.value)}
            onBlur={guardarNombre}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setRenombrando(null);
              }
            }}
          />
        </form>
      </Show>
      </>
    );
    /** El cohete es el único de los dos controles que ocupa sitio en la fila. */
    const puedeFinalizar = () =>
      !props.readOnly && !fijada(f.s) && canFinishTask(
        f.s,
        effectiveTaskGit(f.s, gitRows(), props.relatedSessions ?? props.sessions),
        props.vivas.includes(f.s.id) || props.aprobando.includes(f.s.id),
      );

    /**
     * El menú de acciones de la fila. En la tarjeta del riel su disparador es
     * el hueco del estado y empieza por fijar; en las demás listas vive en la
     * capa de acciones, con la etapa.
     */
    const Menu = createFilaMenu(f, props, state);

    return (
      <ConTarjeta s={f.s}>
        {/* `aria-current` además de la clase, y no es adorno: la fila
          abierta se marcaba solo con fondo y negrita, así que un
          lector de pantalla recorría veinte tareas sin saber cuál
          está abierta.

          **Sin `marca-seleccion`:** en una lista sangrada bajo su
          proyecto, la barra de acento morada compite con la propia
          sangría. El borde en `neutral-500` es lo que cumple los 3:1 que
          pide WCAG 2.2 § 1.4.11 —4,13:1 en claro y 4,53:1 en oscuro—; el
          fondo y la negrita solos no llegaban. */}
        <div
          data-sesion={f.s.id}
          data-pinned={fijada(f.s) ? "true" : undefined}
          data-apagada={apagada() ? "true" : undefined}
          class={tarjetaDelRiel() ? cn(
            // La tarjeta: 52 px fijos y dos líneas, pase lo que pase con los datos.
            "group/session relative flex h-[52px] min-w-0 cursor-pointer flex-col justify-center gap-[5px] rounded-[10px] border border-transparent py-[7px] pr-2.5 pl-2.5 hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-primary",
            // Abierta: un tinte y un borde suave. Ni barra de color, ni negrita, ni sombra.
            f.s.id === props.current && "border-border bg-neutral-200 hover:bg-neutral-200",
            // Fijada: el borde lo dibuja `::after` para poder abrirle un hueco
            // arriba al centro, donde va el alfiler sin fondo; los 7 px de
            // arriba son los que el alfiler necesita para no recortarse.
            fijada(f.s) && "tarjeta-fijada mt-[7px] border-transparent",
            renombrando() === f.s.id && "bg-neutral-200 hover:bg-neutral-200",
            menu() === f.s.id && f.s.id !== props.current && "bg-neutral-100",
            (props.draggedTask ?? tareaEnVuelo()?.id) === f.s.id &&
              "border-neutral-500 bg-transparent opacity-45 [border-style:dashed] hover:bg-transparent",
          ) : cn(
            "group/session relative grid min-w-0 cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-0.5 rounded-sm border border-transparent py-1 pr-1 pl-2 hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-primary",
            f.s.id === props.current &&
              "border-neutral-500 bg-neutral-200 font-semibold text-neutral-950 shadow-sm",
            fijada(f.s) && "tarjeta-fijada mt-[7px] rounded-[10px] border-transparent",
            renombrando() === f.s.id && "bg-neutral-200 hover:bg-neutral-200",
            // Con el menú abierto el puntero puede irse de la fila, y el velo
            // del menú se vería recortado sobre otro fondo.
            menu() === f.s.id && "bg-neutral-100",
            (props.draggedTask ?? tareaEnVuelo()?.id) === f.s.id &&
              "border-border bg-transparent opacity-40 [border-style:dashed]",
          )}
          aria-current={f.s.id === props.current ? "true" : undefined}
          role="link"
          tabIndex={0}
          onKeyDown={event => {
            if (event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " ")) return;
            event.preventDefault();
            props.onPick(f.s.id);
          }}
          // **Renombrando, la fila se rellena.** El campo perdió su borde y su
          // anillo para no cambiar de tamaño (ver el `Input` de abajo), así que
          // el estado se marca donde no cuesta píxeles: en el fondo de la fila,
          // que ya es la superficie con la que esta lista dice «esto es lo que
          // estás mirando». Con el caret y el nombre seleccionado dentro, es la
          // misma señal que da renombrar en el Finder.
          data-renombrando={renombrando() === f.s.id ? "true" : undefined}
          // **La fila que va en la mano se atenúa, y eso es lo que hace
          //  visible el gesto.** El chip que sigue al puntero solo dice
          //  QUÉ se lleva; sin que el origen reaccione, la lista se ve
          //  intacta y el arrastre parece no mover nada. Es la
          //  retroalimentación que da por hecha cualquier arrastre del
          //  sistema: lo que se levanta deja su hueco marcado.
          data-en-vuelo={(props.draggedTask ?? tareaEnVuelo()?.id) === f.s.id ? "true" : undefined}
          // El shell puede abrir la vista en un panel; el gesto de mover
          // entre carpetas conserva sus restricciones para tareas hijas.
          onPointerDown={(e) => {
            if (props.readOnly) return;
            const en = e.target as HTMLElement;
            if (en.closest("[data-session-actions]")) return;
            // Tampoco desde la confirmación de borrado: ahí lo que hay
            // que poder hacer es pulsar uno de los dos botones.
            if (en.closest("[data-session-confirm]")) return;
            // Ni desde el campo de renombrar: ahí el gesto de arrastrar es
            // seleccionar texto, y sin esta línea seleccionar media palabra
            // levantaría la tarea y la movería de proyecto al soltar.
            if (en.closest("[data-session-rename]")) return;
            if (props.onDrag) {
              props.onDrag(f.s, e);
              return;
            }
            if (f.s.parent || f.s.chat_de_agente) return;
            arrastrar(e, { id: f.s.id, de: projectOf(f.s), titulo: f.s.title }, (a) =>
              props.onMove(f.s.id, a),
            );
          }}
          onClick={(e) => {
            // El menú vive en un portal: Solid deja subir su clic por esta
            // fila aunque el botón no esté dentro de ella.
            if (!e.currentTarget.contains(e.target as Node)) return;
            // Lo de la columna de acciones no abre la tarea, y esto es
            // lo único que lo impide: el disparador del menú NO puede
            // llevar un `onClick` propio sin matar el que lo abre.
            if ((e.target as HTMLElement).closest("[data-session-actions]")) return;
            if ((e.target as HTMLElement).closest("[data-session-rename]")) return;
            // Soltar después de arrastrar dispara un `click` igual.
            if (fueArrastre()) return;
            props.onPick(f.s.id);
          }}
          // **Doble clic sobre la fila renombra**, que es el gesto con el que se
          // renombra cualquier cosa de una lista. Es un atajo del que ya está en
          // el menú y no la única puerta: un gesto sin rótulo no lo encuentra
          // quien no lo busca, y con el teclado no se da.
          //
          // El primero de los dos clics abre la tarea, y eso se queda: es lo que
          // hace la fila, y renombrar la que tienes delante es justo el caso.
          onDblClick={(e) => {
            if (props.readOnly || f.s.chat_de_agente) return;
            const en = e.target as HTMLElement;
            if (en.closest("[data-session-actions]")) return;
            if (en.closest("[data-session-confirm]")) return;
            if (en.closest("[data-session-rename]")) return;
            empezarARenombrar(f.s);
          }}
        >
          <div class="col-span-full min-w-0">
            <Show when={fijada(f.s)}>
              {/* El alfiler va en el hueco del borde, arriba al centro, sin fondo. */}
              <span role="img" aria-label={t("projects.sessions.pinned")} class="pointer-events-none absolute -top-1.5 left-1/2 flex size-3 -translate-x-1/2 items-center justify-center text-neutral-500">
                <Pin size={11} class="tarjeta-fijada-alfiler" aria-hidden="true" />
              </span>
            </Show>
            <FilaDelRiel
              s={f.s}
              actividad={activity()}
              titulo={<Titulo />}
              apagada={apagada()}
              conMenu={conMenu()}
              menu={() => <Menu riel={tarjetaDelRiel()} />}
              cohete={() => (
                <Show when={puedeFinalizar() && renombrando() !== f.s.id}>
                  <span data-session-actions data-finish-slot class="flex">
                    <FinishTaskButton
                      compact
                      label={t("projects.sessions.finish")}
                      description={f.s.subagent || gitRows()[f.s.id]?.shared_with
                        ? t("projects.sessions.finish_shared_description")
                        : t("projects.sessions.finish_description")}
                      busy={finishing().includes(f.s.id)}
                      onFinish={rect => void intentar(f.s.id, true, rect)}
                    />
                  </span>
                </Show>
              )}
            />
          </div>


        </div>
      </ConTarjeta>
    );
  };
  return Fila;
}
