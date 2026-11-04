import Check from "lucide-solid/icons/check";
import ChevronRight from "lucide-solid/icons/chevron-right";
import Coins from "lucide-solid/icons/coins";
import FilePenLine from "lucide-solid/icons/file-pen-line";
import FileText from "lucide-solid/icons/file-text";
import Globe from "lucide-solid/icons/globe";
import ListChecks from "lucide-solid/icons/list-checks";
import Search from "lucide-solid/icons/search";
import ShieldCheck from "lucide-solid/icons/shield-check";
import SquareTerminal from "lucide-solid/icons/square-terminal";
import TriangleAlert from "lucide-solid/icons/triangle-alert";
import Wrench from "lucide-solid/icons/wrench";
import { type Component, createSignal, For, Match, Show, Switch } from "solid-js";
import { createRowSignal } from "./threadRow";
import { Dynamic } from "solid-js/web";
import { t } from "../../lib/i18n";
import { flechaDeLista } from "../../lib/shortcuts";
import {
  agrupar,
  type Clase,
  comando,
  type Detalle,
  type Fila,
  origenDeFila,
  type Paso,
  rotuloDeFila,
} from "../../lib/steps";
import { cn } from "../../lib/utils";
import { AnsiText } from "../../ui/AnsiText";
import BloqueDeDiff from "./DiffBlock";
import { balance, comparado } from "./diff";
import { Spinner } from "../../ui/Spinner";
import { MarcaHerramienta } from "../../ui/toolMarks";

/**
 * El carril de un tramo: una raya bajo el chevron de su cabecera y ningún
 * fondo. Una sola definición para el tramo cerrado y la tira viva
 * (`Chat.tsx`, bloques `trabajo` y `pasos`): si divergen, el tramo cambia de
 * forma al llegar el texto. Con fondo, la respuesta se leería entre cajas.
 */
export const SUPERFICIE_DE_EJECUCION = "min-w-0 ml-2.5 border-l border-border pl-1.5";

type Icono = Component<{ size?: number; class?: string; "aria-hidden"?: boolean }>;

const ICONO: Record<Clase, Icono> = {
  leer: FileText,
  buscar: Search,
  editar: FilePenLine,
  ejecutar: SquareTerminal,
  web: Globe,
  plan: ListChecks,
  otro: Wrench,
  aviso: TriangleAlert,
  gasto: Coins,
  fin: Check,
  permiso: ShieldCheck,
};

/**
 * El glifo de la fila: el de su clase, o la marca del servicio cuando la
 * herramienta tiene dueño.
 *
 * **Una sola marca por renglón, en el hueco del glifo.** Dos iconos de 12 px en
 * la misma línea se estorban, y el verbo ya dice qué se hizo: la marca dice
 * quién lo prestó. Un servidor que no conocemos cae en una baldosa con su
 * inicial, y su nombre va escrito al lado.
 */
function Glifo(props: { fila: Fila; abierta: boolean }) {
  return (
    <Show
      when={origenDeFila(props.fila)}
      fallback={
        <Dynamic
          component={ICONO[props.fila.clase]}
          size={12}
          class={cn(
            "shrink-0",
            // Centrado en el primer renglón, no en el bloque: con
            // `items-start` el icono queda pegado arriba y el texto de 12px
            // vive en una línea de 16, así que sobran 2px por lado.
            !props.abierta && "mt-0.5",
            // Un paso fallido no se pinta entero de rojo: fallar y reintentar
            // es parte normal del trabajo, y la marca de la derecha ya dice
            // con qué código salió.
            "text-neutral-500",
          )}
          aria-hidden={true}
        />
      }
    >
      {(origen) => (
        <span class={cn("flex shrink-0 text-neutral-500", !props.abierta && "mt-px")}>
          <MarcaHerramienta
            source={origen()}
            size={14}
            fallback={<Dynamic component={ICONO[props.fila.clase]} size={14} class="text-neutral-500" aria-hidden={true} />}
          />
        </span>
      )}
    </Show>
  );
}

/** Una fila con algo que enseñar debajo. Las demás son solo la línea. */
function desplegable(fila: Fila) {
  if (fila.clase === "aviso" || fila.clase === "gasto" || fila.clase === "fin")
    return false;
  return fila.pasos.some((p) => p.objetivo || p.detalle);
}

/** Con qué recuerda su pliegue una fila. Sin id del agente vale su sitio. */
function claveDeFila(fila: Fila, i: number) {
  return fila.pasos[0].id ?? `#${i}`;
}

/**
 * Lo que el agente hizo, una fila por acto. El pliegue de cada fila vive aquí y
 * no en `FilaDePaso`: `agrupar` fabrica filas nuevas con cada delta, el `For`
 * remonta sus componentes y una fila abierta se cerraría sola.
 */
export default function LineaDeTiempo(props: { pasos: Paso[] }) {
  let marco: HTMLDivElement | undefined;
  const [foco, setFoco] = createSignal(0);
  const [abiertas, setAbiertas] = createRowSignal<Record<string, boolean>>("steps", {});

  const filas = () => agrupar(props.pasos);

  // El índice de teclado cuenta filas ABIERTAS al teclado, que no son todas:
  // un aviso no se despliega y ahí no hay nada que enfocar.
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
  const abre = () => desplegable(props.fila);

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
        <Spinner size={12} class="text-primary" />
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
      <span
        class={cn(
          "font-medium",
          abre() ? "shrink-0" : "min-w-0 break-words",
          "text-neutral-700",
        )}
      >
        {resumido().verbo}
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
          <p class={cn(clases, "m-0")}>
            <Cabecera />
          </p>
        }
      >
        <button
          type="button"
          data-fila
          tabindex={props.enfocada ? 0 : -1}
          aria-expanded={props.abierta}
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

/** El paso abierto: sobre qué actuó, y su cuerpo si lo tiene. */
function Cuerpo(props: { paso: Paso }) {
  const es = () => props.paso.clase === "ejecutar";
  const salida = () => {
    const d = props.paso.detalle;
    return d?.kind === "output" ? d : null;
  };
  const edicion = () => {
    const d = props.paso.detalle;
    return d?.kind === "edit" ? d : null;
  };

  return (
    <div class="grid min-w-0 gap-1.5">
      <Show when={props.paso.objetivo}>
        {(o) => (
          <div class={cn(es() && "border-l border-border pl-3")}>
            <Show when={salida()?.cwd}>
              {(cwd) => (
                <p class="m-0 pb-1 font-mono text-2xs text-neutral-500">
                  {cwd()}
                </p>
              )}
            </Show>
            <Show
              when={es()}
              fallback={
                <p class="m-0 font-mono text-caption break-all text-neutral-700">{o()}</p>
              }
            >
              <Comando texto={comando(o())} />
            </Show>
          </div>
        )}
      </Show>
      <Show when={salida()}>{(s) => <Terminal salida={s()} />}</Show>
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

const LINEAS_DE_COMANDO = 8;
const LETRAS_DE_COMANDO = 600;

/** Recortado: un heredoc entero tapaba la salida, que es lo que dice por qué falló. */
function Comando(props: { texto: string }) {
  const [entero, setEntero] = createRowSignal("command", false);
  const recorte = () => {
    const lineas = props.texto.split("\n");
    let corto = lineas.slice(0, LINEAS_DE_COMANDO).join("\n");
    if (corto.length > LETRAS_DE_COMANDO) corto = corto.slice(0, LETRAS_DE_COMANDO);
    return corto.length < props.texto.length ? `${corto.trimEnd()}…` : null;
  };
  const visible = () => (entero() ? props.texto : (recorte() ?? props.texto));

  return (
    <>
      <p class="m-0 font-mono text-caption break-all whitespace-pre-wrap text-neutral-700">
        {`$ ${visible()}`}
      </p>
      <Show when={recorte()}>
        <button
          type="button"
          onClick={() => setEntero(!entero())}
          class="mt-1 text-caption text-neutral-500 hover:text-neutral-700 hover:underline"
        >
          {entero() ? t("chat.timeline.command.show_less") : t("chat.timeline.command.show_all")}
        </button>
      </Show>
    </>
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
