import type { JSX } from "solid-js";
import { SignalDot } from "../../ui/SignalDot";
import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  on,
  onMount,
} from "solid-js";
import { invoke } from "../../lib/invoke.ts";
import { copyText } from "../../lib/clipboard";
import { t } from "../../lib/i18n";
import { elapsed, percent } from "../../lib/format";
import { cn } from "../../lib/utils";
import Plug from "lucide-solid/icons/plug";
import Copy from "lucide-solid/icons/copy";
import ExternalLink from "lucide-solid/icons/external-link";
import Globe from "lucide-solid/icons/globe";
import Square from "lucide-solid/icons/square";
import ChevronRight from "lucide-solid/icons/chevron-right";
import ChevronDown from "lucide-solid/icons/chevron-down";
import { Popover, PopoverContent, PopoverTrigger } from "../../ui/Popover";
import {
  RETARDO_TOOLTIP,
  TooltipContent,
  TooltipRoot,
  TooltipTrigger,
} from "../../ui/Tooltip";
import { prosaDe } from "../../ui/Failure";

/**
 * Qué puertos hay escuchando, quién los abrió y qué se puede hacer con ellos.
 *
 * Un turno que levanta un servidor deja un proceso escuchando **después de que
 * el turno acabe**. Sin esto no hay dónde verlo: el puerto sigue tomado, el
 * siguiente arranque falla con «address already in use» y no hay forma de saber
 * quién lo tiene ni de abrirlo sin buscar el pid a mano.
 *
 * **El control se ve siempre, aunque no haya ninguno nuestro.** La pregunta que
 * trae aquí a alguien es «¿quién tiene el 3000?», y esa se hace justo cuando
 * nosotros no tenemos ninguno abierto: escondido, la única respuesta es salir a
 * una terminal, que es lo que este producto existe para no pedir. El contador
 * enseña lo nuestro, que es lo accionable; el total sale en el panel.
 *
 * **Pregunta al montar, al terminar un turno —cuando puede haber aparecido un
 * servidor nuevo—, al abrir el panel y tras cerrar uno. Sin temporizador:** lo
 * que se desincroniza es un servidor que muere por su cuenta, y eso deja el
 * contador alto hasta que alguien abra el panel, que es donde se corrige y el
 * único momento en que a alguien le importa el número exacto.
 *
 * **Abrir tiene dos destinos y no son intercambiables.** El de una tarea abre
 * aquí, como una pestaña más del espacio principal (`features/sites/Site.tsx`),
 * para no salir de la app y perder de vista la tarea que levantó ese servidor.
 * El del navegador del sistema sigue al lado porque esa capa no comparte la
 * sesión de la persona: lo que pida un login lo quiere allá.
 *
 * **Los externos se ven, se abren y no se cierran.** Un puerto que no abrió
 * ninguna tarea de este workspace sale en su sección, plegada y con su cuenta:
 * se abre en el navegador y se copia, pero no se cierra ni se abre como pestaña
 * —una pestaña de sitio pertenece a una tarea, y este no tiene ninguna—. Matar
 * lo que la app no lanzó, con los permisos del usuario del sistema, es
 * destructivo y no es nuestro. La regla la aplica `environment/ports.rs` y no esta pantalla:
 * un `invoke` lo llama cualquiera.
 */

/** Un puerto que hay escuchando. */
type Puerto = {
  /** Estable mientras el puerto sea el mismo: la clave de la lista. */
  id: string;
  pid: number;
  puerto: number;
  /** Tal como la reporta el sistema: `127.0.0.1:3000`, `*:5173`. */
  direccion: string;
  /** La que un navegador sí puede abrir: `http://localhost:5173`. */
  url: string;
  /** El binario que escucha: `bun`, `node`. */
  comando: string;
};

/** Lo que una tarea dejó corriendo fuera del grupo de su agente. */
type TaskProcess = {
  id: string;
  pid: number;
  command: string;
  cpu_percent: number;
  elapsed_seconds: number;
  /** Perdió a quien lo lanzó: nadie lo va a recoger. */
  orphan: boolean;
};

type TareaConPuertos = {
  session: string;
  project: string;
  tarea: string;
  proyecto: string | null;
  puertos: Puerto[];
  processes: TaskProcess[];
};

type Puertos = {
  tareas: TareaConPuertos[];
  externos: Puerto[];
  /** Por qué la lista puede estar vacía: no es lo mismo que no haya nada. */
  aviso: string | null;
};

type Cierre = { cerrado: boolean; detalle: string };

/** Medio núcleo sostenido: por debajo es un servidor ocioso, por encima trabaja o se quedó en bucle. */
const HOT_CPU = 50;

export default function PuertosAbiertos(props: {
  /** Si hay un turno corriendo. Su flanco de bajada dispara la consulta. */
  busy: boolean;
  /** Abrirlo como pestaña del espacio principal. Solo lo de una tarea. */
  onAbrirSitio: (url: string, project: string, session: string) => void;
  /** En la columna de organizaciones: icono sobre la cifra y el panel a la derecha. */
  vertical?: boolean;
}) {
  const [datos, setDatos] = createSignal<Puertos | null>(null);
  const [abierto, setAbierto] = createSignal(false);
  const [externosAbiertos, setExternosAbiertos] = createSignal(false);
  const [consultando, setConsultando] = createSignal(false);
  /** El puerto que se está cerrando, por pid: la fila se bloquea sola. */
  const [cerrando, setCerrando] = createSignal<Record<number, boolean>>({});
  /** Lo que dijo el backend cuando no se pudo cerrar, en la fila que lo pidió. */
  const [fallo, setFallo] = createSignal<Record<number, string>>({});
  /** El puerto cuya dirección se acaba de copiar, para confirmarlo en su sitio. */
  const [copiado, setCopiado] = createSignal<string | null>(null);

  async function consultar() {
    setConsultando(true);
    try {
      setDatos(await invoke<Puertos>("list_ports"));
    } catch (e) {
      // Un fallo al preguntar no puede dejar el número de antes en pantalla
      // afirmando puertos que ya no se sabe si están. Y se dice por qué: un
      // panel vacío se lee como «no hay nada», que no es lo mismo.
      setDatos({ tareas: [], externos: [], aviso: prosaDe(e) });
    } finally {
      setConsultando(false);
    }
  }

  onMount(() => void consultar());

  // Al terminar el turno, no al empezarlo: lo que se busca es lo que dejó.
  createEffect(
    on(
      () => props.busy,
      (busy, antes) => {
        if (antes && !busy) void consultar();
      },
      { defer: true },
    ),
  );

  const mios = createMemo(
    () => datos()?.tareas.reduce((n, t) => n + t.puertos.length, 0) ?? 0,
  );
  const externos = createMemo(() => datos()?.externos.length ?? 0);
  const processes = createMemo(
    () => datos()?.tareas.reduce((n, t) => n + t.processes.length, 0) ?? 0,
  );
  // Un proceso de fondo que gasta un núcleo entero es lo que calienta la
  // máquina sin que nada lo diga: el disparador lo marca sin abrir el panel.
  const hot = createMemo(
    () => datos()?.tareas.some((t) => t.processes.some((p) => p.cpu_percent >= HOT_CPU)) ?? false,
  );

  async function abrir(p: Puerto) {
    // **Al navegador del sistema, que sigue sin ser lo mismo que «aquí».**
    // Navegar el webview de la app se la lleva entera —ese motivo no ha
    // cambiado, y es el de `Markdown.tsx` y `delivery/preview.rs`—; la tercera opción es
    // una capa nativa aparte (`src-tauri/src/environment/sites.rs`). Las dos conviven porque
    // no hacen lo mismo:
    // la de aquí no comparte la sesión de la persona, así que un panel que pide
    // login sigue queriendo su navegador.
    await invoke("open_external", { target: p.url }).catch(() => {});
  }

  async function copiar(p: Puerto) {
    try {
      await copyText(p.direccion);
      setCopiado(p.id);
      // Se limpia solo: un «copiado» que se queda puesto deja de significar
      // que **esto** se copió.
      setTimeout(() => setCopiado((v) => (v === p.id ? null : v)), 1400);
    } catch (e) {
      // Callarlo deja a quien pulsó creyendo que la dirección está copiada.
      setFallo((f) => ({ ...f, [p.pid]: prosaDe(e) }));
    }
  }

  async function cerrar(p: Puerto, session: string) {
    setCerrando((c) => ({ ...c, [p.pid]: true }));
    setFallo((f) => ({ ...f, [p.pid]: "" }));
    try {
      const r = await invoke<Cierre>("close_port", {
        session,
        pid: p.pid,
        puerto: p.puerto,
      });
      if (!r.cerrado) setFallo((f) => ({ ...f, [p.pid]: r.detalle }));
    } catch (e) {
      setFallo((f) => ({ ...f, [p.pid]: prosaDe(e) }));
    } finally {
      setCerrando((c) => ({ ...c, [p.pid]: false }));
      await consultar();
    }
  }

  async function stop(p: TaskProcess, session: string) {
    setCerrando((c) => ({ ...c, [p.pid]: true }));
    setFallo((f) => ({ ...f, [p.pid]: "" }));
    try {
      const r = await invoke<Cierre>("close_process", { session, pid: p.pid });
      if (!r.cerrado) setFallo((f) => ({ ...f, [p.pid]: r.detalle }));
    } catch (e) {
      setFallo((f) => ({ ...f, [p.pid]: prosaDe(e) }));
    } finally {
      setCerrando((c) => ({ ...c, [p.pid]: false }));
      await consultar();
    }
  }

  /** Un botón de icono de la fila, con su globo. Los tres se pintan igual. */
  function Accion(props2: {
    etiqueta: string;
    onClick: () => void;
    disabled?: boolean;
    children: JSX.Element;
  }) {
    return (
      <TooltipRoot openDelay={RETARDO_TOOLTIP} placement="bottom">
        <TooltipTrigger
          as={(p: object) => (
            <button
              {...p}
              type="button"
              class="flex size-5 shrink-0 items-center justify-center rounded-sm text-neutral-500 outline-none hover:bg-surface-muted hover:text-neutral-950 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary disabled:opacity-60"
              disabled={props2.disabled}
              aria-label={props2.etiqueta}
              // Reenvía el clic del disparador antes de hacer lo suyo: Kobalte
              // no compone manejadores como hacía Radix con `asChild`, así que
              // un `onClick` encima del `{...p}` borra el que cierra el globo.
              // Lo comprueba `tests/unit/triggers.test.mjs`.
              onClick={(e: MouseEvent) => {
                (p as { onClick?: (e: MouseEvent) => void }).onClick?.(e);
                props2.onClick();
              }}
            >
              {props2.children}
            </button>
          )}
        />
        <TooltipContent class="whitespace-nowrap">
          {props2.etiqueta}
        </TooltipContent>
      </TooltipRoot>
    );
  }

  /**
   * Una fila de puerto. `session` vacío es un externo: sin botón de cerrar y
   * **sin «Abrir aquí»**.
   *
   * Una pestaña de sitio pertenece a una tarea, igual que la de un archivo o la
   * de un artefacto (`lib/tabs.ts`): se cierra con ella y va pegada a ella
   * en la tira. Un puerto externo no lo abrió ninguna, así que no hay contexto
   * de tarea que conservar — que es justo lo que la pestaña existe para no
   * perder. Ese se abre donde ya se abría: en el navegador del sistema.
   */
  function Fila(props2: { p: Puerto; session?: string; project?: string }) {
    return (
      <li class="flex min-w-0 items-center gap-2 py-0.5">
        <span class="shrink-0 font-mono text-xs tabular-nums text-neutral-950">
          {props2.p.direccion}
        </span>
        <span class="min-w-0 flex-1 truncate text-xs text-neutral-500">
          {props2.p.comando}
        </span>
        <Show when={props2.session && props2.project !== undefined}>
          <Accion
            etiqueta={t("shell.ports.open_here")}
            onClick={() => {
              // Se cierra el panel: es un popover, o sea un hijo de `<body>`, y
              // mientras esté abierto la capa nativa del sitio se queda
              // escondida a propósito para no taparlo (`lib/sites.ts`). Sin
              // esto, pulsar «Abrir aquí» abre la pestaña y no enseña nada.
              setAbierto(false);
              props.onAbrirSitio(
                props2.p.url,
                props2.project ?? "",
                props2.session ?? "",
              );
            }}
          >
            <Globe size={12} />
          </Accion>
        </Show>
        <Accion etiqueta={t("shell.ports.open_browser")} onClick={() => void abrir(props2.p)}>
          <ExternalLink size={12} />
        </Accion>
        <Accion
          etiqueta={copiado() === props2.p.id ? t("shell.ports.copied") : t("shell.ports.copy")}
          onClick={() => void copiar(props2.p)}
        >
          <Copy size={12} class={copiado() === props2.p.id ? "text-primary" : ""} />
        </Accion>
        <Show when={props2.session}>
          {(s) => (
            <Accion
              etiqueta={t("shell.ports.close")}
              disabled={cerrando()[props2.p.pid]}
              onClick={() => void cerrar(props2.p, s())}
            >
              <Square size={12} />
            </Accion>
          )}
        </Show>
      </li>
    );
  }

  function ProcessRow(props2: { p: TaskProcess; session: string }) {
    return (
      <li class="flex min-w-0 items-center gap-2 py-0.5">
        <span class="shrink-0 font-mono text-xs text-neutral-950">{props2.p.command}</span>
        <span
          class={cn(
            "shrink-0 font-mono text-xs tabular-nums",
            props2.p.cpu_percent >= HOT_CPU ? "text-warning-strong" : "text-neutral-500",
          )}
        >
          {percent(Math.round(props2.p.cpu_percent))}
        </span>
        <span class="min-w-0 flex-1 truncate text-xs text-neutral-500">
          {elapsed(props2.p.elapsed_seconds)}
          <Show when={props2.p.orphan}> · {t("shell.processes.orphan")}</Show>
        </span>
        <Accion
          etiqueta={t("shell.processes.close")}
          disabled={cerrando()[props2.p.pid]}
          onClick={() => void stop(props2.p, props2.session)}
        >
          <Square size={12} />
        </Accion>
      </li>
    );
  }

  return (
    <Popover
      open={abierto()}
      onOpenChange={(v: boolean) => {
        setAbierto(v);
        if (v) void consultar();
      }}
      placement={props.vertical ? "right-end" : "bottom-end"}
      gutter={6}
    >
      {/* El disparador **no lleva `onClick` propio**: Kobalte no compone
          manejadores como hacía Radix con `asChild`, así que el último gana y
          el panel dejaría de abrirse. Lo que hay que hacer al abrir va en
          `onOpenChange`. */}
      <PopoverTrigger
        as={(p: object) => (
          <button
            {...p}
            class={cn(
              "flex shrink-0 items-center text-neutral-500 outline-none transition-colors hover:bg-surface-muted hover:text-neutral-950 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary data-[expanded]:bg-surface-muted",
              props.vertical ? "relative size-8 justify-center rounded-md" : "gap-1 rounded-sm px-1.5 py-0.5",
            )}
            aria-label={`${t("shell.ports.aria", { mine: mios(), external: externos() })} · ${t("shell.ports.aria_processes", { processes: processes() })}`}
          >
            <Plug size={props.vertical ? 16 : 12} class={!props.vertical && hot() ? "text-warning-strong" : ""} aria-hidden />
            {/* En la columna la cifra no cabe al lado: un punto dice que hay algo abierto. */}
            <Show
              when={!props.vertical}
              fallback={
                <Show when={mios() + processes() > 0}>
                  <SignalDot tone={hot() ? "warning" : "success"} class="absolute top-1 right-1" />
                </Show>
              }
            >
              <span class={cn("font-mono tabular-nums", hot() && "text-warning-strong")}>
                {mios() + processes()}
              </span>
            </Show>
          </button>
        )}
      />

      <PopoverContent
        class="flex max-h-[var(--kb-popper-content-available-height)] w-[340px] flex-col p-0"
        onOpenAutoFocus={(e: Event) => e.preventDefault()}
      >
        <div class="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2">
          <h2 class="m-0 flex items-center gap-1.5 text-xs font-semibold text-neutral-950">
            <Plug size={12} class="text-neutral-500" aria-hidden />
            {t("shell.ports.title")}
          </h2>
        </div>

        <Show
          when={!datos()?.aviso}
          fallback={
            /* No se pudo preguntar. **Se dice, y no se enseña un panel vacío**:
               una lista sin filas se lee como «no hay puertos», que es otra
               cosa. Pasa en Linux sin `lsof`. */
            <p class="m-0 px-3 py-4 text-xs text-warning-strong">
              {datos()?.aviso}
            </p>
          }
        >
          <div class="min-h-0 flex-1 overflow-y-auto">
            <Show
              when={datos()?.tareas.length}
              fallback={
                <p class="m-0 px-3 py-4 text-center text-xs text-neutral-500">
                  {consultando() ? t("shell.ports.checking") : t("shell.ports.none")}
                </p>
              }
            >
              <For each={datos()?.tareas ?? []}>
                {(tarea) => (
                  <section class="border-b border-border last:border-b-0">
                    <h3 class="m-0 truncate px-3 pt-2.5 pb-1 text-xs font-semibold text-neutral-950">
                      {tarea.tarea}
                      <Show when={tarea.proyecto}>
                        {(p) => (
                          <span class="font-normal text-neutral-500"> · {p()}</span>
                        )}
                      </Show>
                    </h3>
                    <ul class="m-0 list-none px-3 pb-2.5 pt-0.5">
                      <For each={tarea.puertos}>
                        {(p) => <Fila p={p} session={tarea.session} project={tarea.project} />}
                      </For>
                      {/* Un proceso no es un puerto: comparten panel, no lista. */}
                      <Show when={tarea.processes.length}>
                        <li class="pt-1.5 text-2xs font-semibold uppercase tracking-wide text-neutral-500">
                          {t("shell.processes.title")}
                        </li>
                      </Show>
                      <For each={tarea.processes}>
                        {(p) => <ProcessRow p={p} session={tarea.session} />}
                      </For>
                      {/* Lo que pasó cuando no se pudo cerrar, en la fila que lo
                          pidió: un botón que no hace nada y no dice por qué
                          manda a pulsarlo otra vez. */}
                      <For each={[...tarea.puertos, ...tarea.processes].filter((p) => fallo()[p.pid])}>
                        {(p) => (
                          <li class="py-0.5 text-xs text-warning-strong">
                            {fallo()[p.pid]}
                          </li>
                        )}
                      </For>
                    </ul>
                  </section>
                )}
              </For>
            </Show>

            <section class="border-t border-border">
              {/* Plegada por omisión: son decenas y no son accionables. Se abre
                  para contestar «¿quién tiene el 3000?», que es la pregunta que
                  trae aquí a alguien cuando lo suyo está vacío. */}
              <button
                type="button"
                class="flex w-full items-center gap-1.5 px-3 py-2 text-left text-caption font-semibold uppercase tracking-wide text-neutral-500 outline-none hover:bg-surface-muted hover:text-neutral-950 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
                aria-expanded={externosAbiertos()}
                onClick={() => setExternosAbiertos((v) => !v)}
              >
                <Show
                  when={externosAbiertos()}
                  fallback={<ChevronRight size={12} aria-hidden />}
                >
                  <ChevronDown size={12} aria-hidden />
                </Show>
                <span>{t("shell.ports.external")}</span>
                <span class="ml-auto font-mono tabular-nums">{externos()}</span>
              </button>
              <Show when={externosAbiertos()}>
                <Show
                  when={datos()?.externos.length}
                  fallback={
                    <p class="m-0 px-3 pb-2.5 text-xs text-neutral-500">
                      {t("shell.ports.external.none")}
                    </p>
                  }
                >
                  {/* Sin botón de cerrar: no los abrimos nosotros. El título
                      dice por qué no hay nada que pulsar. */}
                  <ul
                    class="m-0 list-none px-3 pb-2.5"
                    title={t("shell.ports.external.why")}
                  >
                    <For each={datos()?.externos ?? []}>
                      {(p) => <Fila p={p} />}
                    </For>
                  </ul>
                </Show>
              </Show>
            </section>
          </div>
        </Show>
      </PopoverContent>
    </Popover>
  );
}
