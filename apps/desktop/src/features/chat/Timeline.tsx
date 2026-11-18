import ChevronRight from "lucide-solid/icons/chevron-right";
import { createSignal, For, Match, Show, Switch } from "solid-js";
import { createRowSignal } from "./threadRow";
import { t } from "../../lib/i18n";
import { flechaDeLista } from "../../lib/shortcuts";
import {
  agrupar,
  type Detalle,
  type Fila,
  type Paso,
  rotuloDeFila,
} from "../../lib/steps";
import { cn } from "../../lib/utils";
import { AnsiText } from "../../ui/AnsiText";
import BloqueDeDiff from "./DiffBlock";
import { balance, comparado } from "./diff";
import { Spinner } from "../../ui/Spinner";
import { Glifo, HUECO_DE_GLIFO } from "./StepGlyph";
import { carpetaDe, desplegable, salidaDe, tituloDeFila, verboVisible } from "../../lib/stepRow";

/**
 * El carril de un tramo: una raya bajo el chevron de su cabecera y ningún
 * fondo. Una sola definición para el tramo cerrado y la tira viva
 * (`Chat.tsx`, bloques `trabajo` y `pasos`): si divergen, el tramo cambia de
 * forma al llegar el texto. Con fondo, la respuesta se leería entre cajas.
 */
export const SUPERFICIE_DE_EJECUCION = "min-w-0 ml-2.5 border-l border-border pl-1.5";


/** Con qué recuerda su pliegue una fila. Sin id del agente vale su sitio. */
function claveDeFila(fila: Fila, i: number) {
  return fila.pasos[0].id ?? `#${i}`;
}

/**
 * Lo que el agente hizo, una fila por acto. El pliegue de cada fila vive aquí y
 * no en `FilaDePaso`: `agrupar` fabrica filas nuevas con cada delta, el `For`
 * remonta sus componentes y una fila abierta se cerraría sola.
 */
export default function LineaDeTiempo(props: { pasos: Paso[]; individual?: boolean }) {
  let marco: HTMLDivElement | undefined;
  const [foco, setFoco] = createSignal(0);
  const [abiertas, setAbiertas] = createRowSignal<Record<string, boolean>>("steps", {});

  const filas = () => props.individual ? props.pasos.map(paso => ({ clase: paso.clase, pasos: [paso] })) : agrupar(props.pasos);

  const conIndice = () => {
    let n = 0;
    const lista = filas().map((fila, i) => ({
      fila,
      clave: claveDeFila(fila, i),
      tecla: desplegable(fila) ? n++ : -1,
    }));
    return { lista, total: n };
  };
  const activo = () =>
    Math.min(foco(), Math.max(0, conIndice().total - 1));

  // Arriba y abajo recorren las filas; Enter y espacio las abren, que es lo que
  // ya hace un botón. **Izquierda y derecha no se tocan**: `Document.tsx`
  // escucha esas dos en `window` para pasar diapositivas con el foco fuera del
  // marco, y aquí se robarían entre sí sin que se vea por qué.
  function mover(e: KeyboardEvent) {
    if (!flechaDeLista(e)) return;
    const salto = { ArrowDown: 1, ArrowUp: -1, Home: -Infinity, End: Infinity }[
      e.key
    ];
    if (salto === undefined) return;
    const botones = [
      ...(marco?.querySelectorAll<HTMLButtonElement>("[data-fila]") ?? []),
    ];
    if (botones.length === 0) return;
    e.preventDefault();
    e.stopPropagation();
    const desde = botones.findIndex((b) => b === document.activeElement);
    const i = Math.min(
      botones.length - 1,
      Math.max(0, (desde < 0 ? 0 : desde) + salto),
    );
    botones[i].focus();
    setFoco(i);
  }

  return (
    <div
      ref={marco}
      role="list"
      onKeyDown={mover}
      /* **`minmax(0,1fr)` y no la columna automática.** Un item de grid trae
         `min-width: auto`, así que una fila con un comando largo hacía crecer la
         columna por encima del ancho del chat: el `truncate` de la fila medía
         contra esa columna estirada y no recortaba nada, y la transcripción
         entera se iba de lado. */
      class="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-0.5"
    >
      {/* `<For>` reconcilia por identidad del elemento del array. Una fila que
          cambia de forma es un objeto nuevo y se monta como tal. */}
      <For each={conIndice().lista}>
        {({ fila, clave, tecla }) => (
          <FilaDePaso
            fila={fila}
            abierta={Boolean(abiertas()[clave])}
            enfocada={tecla === activo()}
            onAlternar={() =>
              setAbiertas({ ...abiertas(), [clave]: !abiertas()[clave] })
            }
            onFoco={() => setFoco(tecla)}
          />
        )}
      </For>
    </div>
  );
}

function FilaDePaso(props: {
  fila: Fila;
  abierta: boolean;
  enfocada: boolean;
  onAlternar: () => void;
  onFoco: () => void;
}) {
  const resumido = () => rotuloDeFila(props.fila);
  const corriendo = () => props.fila.pasos.some((p) => p.corriendo);
  // Sin presentación que fuerce el cuerpo abierto: con ella la fila perdía la
  // flecha y el comando salía dos veces sin poder cerrarse.
  const abre = () => desplegable(props.fila);
  const titulo = () => tituloDeFila(props.fila);

  // `min-w-0` es lo que deja que el sujeto se recorte: sin él la fila reclama
  // el ancho de su contenido y el comando se sale de la ventana.
  //
  // **Y `items-start` cuando la fila trae su propio texto**, porque ese texto
  // envuelve: con `items-center`, un aviso de dos renglones deja el icono
  // flotando entre los dos en vez de junto al primero.
  const clases = cn(
    "flex w-full min-w-0 gap-2 px-1 py-1.5 text-left text-xs",
    abre() ? "items-center" : "items-start",
  );

  /**
   * La cabecera es un componente porque se usa en dos ramas. Guardar JSX en una
   * variable crea un nodo del DOM: colocarlo dos veces lo mueve, y además lo
   * congela fuera de cualquier expresión reactiva.
   */
  const Cabecera = () => (
    <>
      <Show
        when={abre()}
        fallback={<span class="size-3 shrink-0" aria-hidden="true" />}
      >
        <ChevronRight
          size={12}
          class={cn(
            "shrink-0 text-neutral-500 transition-transform",
            props.abierta && "rotate-90",
          )}
          aria-hidden="true"
        />
      </Show>
      <Show
        when={corriendo()}
        fallback={<Glifo fila={props.fila} abierta={abre()} />}
      >
        <span class={cn(HUECO_DE_GLIFO, !abre() && "mt-px")}>
          <Spinner size={12} class="text-primary" />
        </span>
      </Show>
      {/* El dueño va antes del verbo: «GitHub · Usó create issue» dice en una
          línea lo que «Usó mcp__github__create_issue» no decía. */}
      <Show when={resumido().origen}>
        {(o) => (
          <>
            <span class="max-w-28 shrink-0 truncate text-caption text-neutral-500">{o().label}</span>
            <span class="shrink-0 text-caption text-neutral-500 opacity-50" aria-hidden="true">·</span>
          </>
        )}
      </Show>
      {/* En avisos, gasto y fin, resumen() coloca el mensaje entero en verbo y deja sujeto vacío. Impedir que verbo encoja o envuelva sacaría la prosa del ancho del hilo. */}
      {/* Un comando no pinta su verbo: el tramo ya dice «Ejecutó N comandos».
          El lector de pantalla sí lo dice. */}
      <span
        class={cn(
          "font-medium",
          !verboVisible(props.fila) ? "sr-only" : abre() ? "shrink-0" : "min-w-0 break-words",
          "text-neutral-700",
        )}
      >
        {/* El espacio separa el verbo oculto del comando en el nombre accesible. */}
        {verboVisible(props.fila) ? resumido().verbo : `${resumido().verbo} `}
      </span>
      <Show when={resumido().sujeto}>
        {(s) => (
          <span class="min-w-0 truncate font-mono text-neutral-500">{s()}</span>
        )}
      </Show>
      <Marcas fila={props.fila} />
    </>
  );

  return (
    <div role="listitem">
      <Show
        when={abre()}
        fallback={
          <p class={cn(clases, "m-0")} title={titulo()}>
            <Cabecera />
          </p>
        }
      >
        <button
          type="button"
          data-fila
          tabindex={props.enfocada ? 0 : -1}
          aria-expanded={props.abierta}
          title={titulo()}
          onClick={props.onAlternar}
          onFocus={props.onFoco}
          class={cn(clases, "rounded-sm hover:bg-surface-muted")}
        >
          <Cabecera />
        </button>
      </Show>

      <Show when={abre() && props.abierta}>
        <div class="ml-5 grid gap-2 border-l border-border py-1 pl-3">
          <For each={props.fila.pasos}>{(p) => <Cuerpo paso={p} />}</For>
        </div>
      </Show>
    </div>
  );
}

/**
 * Lo que se sabe de la fila sin abrirla: cuánto entra y sale de un diff, con qué
 * código murió un comando. Son la consecuencia, y la consecuencia no se pliega.
 */
function Marcas(props: { fila: Fila }) {
  const detalle = () =>
    props.fila.pasos.length === 1 ? props.fila.pasos[0].detalle : null;
  const edicion = () => {
    const d = detalle();
    return d?.kind === "edit" ? d : null;
  };
  const codigo = () => {
    const d = detalle();
    if (d?.kind !== "output") return null;
    const c = d.exit_code;
    return c !== null && c !== undefined && c !== 0 ? c : null;
  };

  return (
    <Switch>
      <Match when={edicion()}>
        {(d) => {
          const b = () => balance(comparado(d()));
          return (
            <span class="ml-auto shrink-0 font-mono text-caption tabular-nums">
              <Show when={b().pone > 0}>
                <span class="text-success-strong">+{b().pone}</span>
              </Show>
              <Show when={b().quita > 0}>
                <span class="ml-1 text-error-strong">−{b().quita}</span>
              </Show>
            </span>
          );
        }}
      </Match>

      <Match when={codigo()}>
        {(c) => (
          <span class="ml-auto shrink-0 font-mono text-caption tabular-nums text-error-strong">
            {t("chat.timeline.exit_code", { code: c() })}
          </span>
        )}
      </Match>

      {/* Sin código, «Ejecutó» a secas afirmaría que se hizo. Un paso que la
          herramienta rechazó —permiso denegado, ruta prohibida— no llegó a
          correr, y esta transcripción es lo que el gate aprueba. */}
      <Match when={props.fila.pasos.some((p) => p.ok === false)}>
        <span class="ml-auto shrink-0 text-caption text-error-strong">
          {t("chat.timeline.failed")}
        </span>
      </Match>
    </Switch>
  );
}

/**
 * El paso abierto: sobre qué actuó, y su cuerpo si lo tiene. Un comando no
 * repite su texto: el renglón ya lo dice y el `title` lleva el real.
 */
function Cuerpo(props: { paso: Paso }) {
  const es = () => props.paso.clase === "ejecutar";
  const edicion = () => {
    const d = props.paso.detalle;
    return d?.kind === "edit" ? d : null;
  };

  return (
    <div class="grid min-w-0 gap-1.5">
      <Show
        when={es()}
        fallback={
          <>
            <Show when={props.paso.objetivo}>
              {(o) => <p class="m-0 font-mono text-caption break-all text-neutral-700">{o()}</p>}
            </Show>
            <Show when={props.paso.detalle?.kind === "output" ? props.paso.detalle : null}>
              {(s) => <Terminal salida={s()} />}
            </Show>
          </>
        }
      >
        <Show when={carpetaDe(props.paso)}>
          {(cwd) => <p class="m-0 font-mono text-2xs text-neutral-500">{cwd()}</p>}
        </Show>
        <Show when={salidaDe(props.paso)}>{(s) => <Terminal salida={s()} />}</Show>
      </Show>
      <Show when={edicion()}>
        {(d) => <BloqueDeDiff cambio={d()} numerar={d().before === null} />}
      </Show>
      {/* Codex dice qué archivos tocó y no qué les hizo — el item trae la ruta
          y nada más. Se dice, en vez de dejar un pliegue que promete un diff. */}
      <Show
        when={
          props.paso.clase === "editar" &&
          !props.paso.detalle &&
          !props.paso.corriendo
        }
      >
        <p class="m-0 text-caption text-neutral-500 italic">
          {props.paso.nombre === "file_change"
            ? t("chat.timeline.edit.codex_no_content")
            : t("chat.timeline.edit.no_content")}
        </p>
      </Show>
    </div>
  );
}

/** La salida se lee como detalle de la línea, no como una tarjeta aparte. */
function Terminal(props: { salida: Extract<Detalle, { kind: "output" }> }) {
  return (
    <div class="min-w-0">
      <pre class="m-0 max-h-72 overflow-auto border-l border-border pl-3 font-mono text-caption leading-[1.5] whitespace-pre-wrap text-neutral-950">
        <AnsiText text={props.salida.text || " "} />
      </pre>
      <Show when={props.salida.truncated}>
        <p class="m-0 pt-1 text-caption text-neutral-500 italic">
          {t("chat.timeline.output.truncated")}
        </p>
      </Show>
    </div>
  );
}

/**
 * El diff, **dentro de la conversación y donde ocurrió**. No se va a otro panel:
 * el panel es para revisar el conjunto antes de publicar, que es otro momento.
 */
