import { For, Show, createMemo, type JSX } from "solid-js";
import Columns2 from "lucide-solid/icons/columns-2";
import Rows2 from "lucide-solid/icons/rows-2";
import UnfoldVertical from "lucide-solid/icons/unfold-vertical";
import { cn } from "../../../../apps/desktop/src/lib/utils";
import { t } from "../../../../apps/desktop/src/lib/i18n";
import { createPref } from "../../../../apps/desktop/src/lib/prefs";
import { ajuste } from "../../../../apps/desktop/src/lib/wrap";
import { Button } from "../../../ui/src/Button";
import {
  filasDosPaneles,
  marcarLineas,
  saltoEntre,
  type ArchivoDiff,
  type Fila,
  type Hunk,
  type Linea,
  type Tramo,
} from "./diff";

/**
 * Las piezas del diff que comparten el visor de archivos (`FileViewer.tsx`) y
 * el lado «Cambios» del panel de la tarea (`TaskFiles.tsx`): el cuerpo de un
 * archivo y el selector unificado / dos paneles.
 *
 * **El contexto se despliega, y por eso hace falta un segundo comando.** `git
 * diff` da tres líneas alrededor de cada trozo, y un cambio leído sin lo que lo
 * rodea no se puede juzgar: `tree_patch` recalcula ese archivo con el archivo
 * entero de contexto. Se pide solo al desplegar — traer todos los archivos
 * enteros de golpe es megabytes que casi nadie va a leer.
 *
 * **Sin resaltado de sintaxis, y es una decisión.** Lo que hay que distinguir es
 * qué entró y qué salió, y eso lo dice la línea entera. Un resaltador son
 * cientos de kilobytes de gramáticas para teñir palabras que no deciden nada en
 * una revisión.
 */

type Disposicion = "unified" | "split";

const [disposicionGuardada, setDisposicion] = createPref<Disposicion>("diff.layout", "unified");
const disposicion = (): Disposicion => (disposicionGuardada() === "split" ? "split" : "unified");

/** `delivery/development/` · `Cambios`. */
export type Cambios = {
  base: string;
  files: { path: string; added: number; removed: number; status: string }[];
  added: number;
  removed: number;
  patch: string;
  truncated: boolean;
  warnings: string[];
};

export function SelectorDeDisposicion() {
  return (
    <div role="group" aria-label={t("code.diff.layout.label")} class="flex shrink-0 gap-0.5">
      <BotonDeDisposicion
        pulsado={disposicion() === "unified"}
        etiqueta={t("code.diff.layout.unified")}
        onClick={() => setDisposicion("unified")}
      >
        <Rows2 size={13} />
      </BotonDeDisposicion>
      <BotonDeDisposicion
        pulsado={disposicion() === "split"}
        etiqueta={t("code.diff.layout.split")}
        onClick={() => setDisposicion("split")}
      >
        <Columns2 size={13} />
      </BotonDeDisposicion>
    </div>
  );
}

function BotonDeDisposicion(props: {
  pulsado: boolean;
  etiqueta: string;
  onClick: () => void;
  children: JSX.Element;
}) {
  return (
    <Button
      variant={props.pulsado ? "secondary" : "ghost"}
      size="compact"
      class={cn("size-6 px-0", !props.pulsado && "text-neutral-500 hover:text-neutral-950")}
      aria-pressed={props.pulsado}
      aria-label={props.etiqueta}
      title={props.etiqueta}
      onClick={() => props.onClick()}
    >
      {props.children}
    </Button>
  );
}

/**
 * Las líneas de un archivo: sus trozos y los tramos que faltan entre ellos.
 *
 * **Sin cabecera.** Quien lo monta ya dice qué archivo es; repetir la ruta con
 * su recuento sería el mismo dato dos veces. Lo que no puede haber es un
 * segundo dibujante de líneas: dos divergen y quien revisa deja de saber si
 * mira lo mismo.
 */
export function CuerpoDeArchivo(props: {
  archivo: ArchivoDiff;
  onDesplegar: () => void;
  /** Ocupa el alto de su caja y lleva sus propios scrolls: la barra horizontal queda abajo. */
  llena?: boolean;
}) {
  // Un archivo sin cambios pintaría dos paneles idénticos.
  const conCambios = () => props.archivo.added + props.archivo.removed > 0;
  const dosPaneles = () => conCambios() && disposicion() === "split";
  const paneles: HTMLDivElement[] = [];
  // Solo arrastra el panel que la persona mueve: si el arrastrado devolviera su
  // scroll redondeado al primero, los dos se corregirían entre sí y el diff tiembla.
  let lider: HTMLDivElement | null = null;
  const tomar = (el: HTMLDivElement) => {
    lider = el;
  };
  const acompasar = (origen: HTMLDivElement) => {
    if (origen !== lider) return;
    for (const p of paneles) if (p !== origen && p.isConnected) p.scrollTop = origen.scrollTop;
  };
  const saltosAntes = (i: number) =>
    i === 0 ? props.archivo.hunks[0].desdeNueva - 1 : saltoEntre(props.archivo.hunks[i - 1], props.archivo.hunks[i]);
  return (
    <Show
      when={!props.archivo.binario}
      fallback={
        <p class="m-0 px-2.5 py-2 text-label text-neutral-500">
          {t("code.file.binary")}
        </p>
      }
    >
      <div
        class={cn(
          "w-full min-w-0 bg-surface-muted font-mono text-xs leading-[1.55]",
          !props.llena
            ? "overflow-x-auto"
            : dosPaneles() && !ajuste()
              ? "h-full overflow-hidden"
              : "h-full overflow-auto",
        )}
      >
        <Show
          when={dosPaneles()}
          fallback={
            <div class={cn(!ajuste() && "w-max min-w-full")}>
              <For each={props.archivo.hunks}>
                {(h, i) => (
                  <>
                    {/* Antes del primer trozo también falta archivo, y saberlo es
                        lo que dice si el cambio está al principio o en el medio. */}
                    <Salto cuantas={saltosAntes(i())} onDesplegar={props.onDesplegar} />
                    <Trozo hunk={h} />
                  </>
                )}
              </For>
            </div>
          }
        >
          <Show
            when={ajuste()}
            fallback={
              /* Sin ajuste cada fila mide un renglón: cada panel lleva su scroll
                 horizontal y las filas siguen casando. */
              <div class={cn("grid grid-cols-2", props.llena && "h-full")}>
                <Panel archivo={props.archivo} lado="antes" saltos={saltosAntes} onDesplegar={props.onDesplegar} llena={props.llena} ref={(el) => paneles.push(el)} onScroll={acompasar} onTomar={tomar} />
                <Panel archivo={props.archivo} lado="despues" saltos={saltosAntes} onDesplegar={props.onDesplegar} llena={props.llena} ref={(el) => paneles.push(el)} onScroll={acompasar} onTomar={tomar} />
              </div>
            }
          >
            {/* Con ajuste una fila crece por su lado largo: la rejilla por filas
                es lo que mantiene a las dos mitades a la misma altura. */}
            <div class="grid grid-cols-2">
              <For each={props.archivo.hunks}>
                {(h, i) => (
                  <>
                    <Salto cuantas={saltosAntes(i())} onDesplegar={props.onDesplegar} />
                    <FilasDeTrozo hunk={h}>
                      {(f, tramos) => (
                        <>
                          <Lado hunk={h} indice={f.antes} tramos={tramos} lado="antes" />
                          <Lado hunk={h} indice={f.despues} tramos={tramos} lado="despues" />
                        </>
                      )}
                    </FilasDeTrozo>
                  </>
                )}
              </For>
            </div>
          </Show>
        </Show>
      </div>
    </Show>
  );
}

/** Un lado de los dos paneles sin ajuste: todos los trozos, con su scroll horizontal propio. */
function Panel(props: {
  archivo: ArchivoDiff;
  lado: "antes" | "despues";
  saltos: (i: number) => number;
  onDesplegar: () => void;
  llena?: boolean;
  ref: (el: HTMLDivElement) => void;
  onScroll: (el: HTMLDivElement) => void;
  onTomar: (el: HTMLDivElement) => void;
}) {
  return (
    <div
      ref={props.ref}
      onScroll={(e) => props.llena && props.onScroll(e.currentTarget)}
      onWheel={(e) => props.onTomar(e.currentTarget)}
      onPointerDown={(e) => props.onTomar(e.currentTarget)}
      onTouchStart={(e) => props.onTomar(e.currentTarget)}
      onFocusIn={(e) => props.onTomar(e.currentTarget)}
      class={cn(
        "min-w-0",
        props.llena ? "h-full overflow-auto" : "overflow-x-auto",
        props.lado === "antes" && "border-r border-border",
      )}
    >
      <div class="w-max min-w-full">
        <For each={props.archivo.hunks}>
          {(h, i) => (
            <>
              {/* El salto sale en los dos paneles para que las filas sigan casando;
                  el segundo no entra en el orden de tabulación. */}
              <Salto
                cuantas={props.saltos(i())}
                onDesplegar={props.onDesplegar}
                eco={props.lado === "despues"}
              />
              <FilasDeTrozo hunk={h}>
                {(f, tramos) => (
                  <Lado
                    hunk={h}
                    indice={props.lado === "antes" ? f.antes : f.despues}
                    tramos={tramos}
                    lado={props.lado}
                  />
                )}
              </FilasDeTrozo>
            </>
          )}
        </For>
      </div>
    </div>
  );
}

function FilasDeTrozo(props: {
  hunk: Hunk;
  children: (fila: Fila, tramos: Tramo[][]) => JSX.Element;
}) {
  const tramos = createMemo(() => marcarLineas(props.hunk.lineas));
  const filas = createMemo(() => filasDosPaneles(props.hunk.lineas));
  return <For each={filas()}>{(f) => props.children(f, tramos())}</For>;
}

/** Las clases del texto de una línea: una sola fila con scroll, o varias con ajuste. */
const textoDeLinea = () =>
  ajuste() ? "min-w-0 flex-1 whitespace-pre-wrap break-words pr-4 pl-1" : "whitespace-pre pr-4 pl-1";

/** Las líneas de un trozo en la vista unificada, con su número real a la izquierda. */
function Trozo(props: { hunk: Hunk }) {
  const tramos = createMemo(() => marcarLineas(props.hunk.lineas));
  return (
    <For each={props.hunk.lineas}>
      {(l, i) => (
        <div
          class={cn(
            "flex border-l-2",
            l.tipo === "add" && "border-success bg-diff-add",
            l.tipo === "del" && "border-error bg-diff-del",
            l.tipo === "ctx" && "border-transparent",
          )}
        >
          <Numero tipo={l.tipo} n={l.nueva ?? l.vieja} class="w-9" />
          <span class={textoDeLinea()}>
            <Texto linea={l} tramos={tramos()[i()]} />
          </span>
        </div>
      )}
    </For>
  );
}

/** Media fila de los dos paneles: número y texto, o el hueco del lado corto. */
function Lado(props: {
  hunk: Hunk;
  indice: number | null;
  tramos: Tramo[][];
  lado: "antes" | "despues";
}) {
  const linea = () => (props.indice === null ? null : props.hunk.lineas[props.indice]);
  return (
    <div
      class={cn(
        "flex min-w-0 border-l-2",
        linea()?.tipo === "add" && "border-success bg-diff-add",
        linea()?.tipo === "del" && "border-error bg-diff-del",
        (linea() === null || linea()?.tipo === "ctx") && "border-transparent",
        linea() === null && "bg-surface-raised",
        ajuste() && props.lado === "antes" && "border-r border-r-border",
      )}
    >
      <Show
        when={linea()}
        fallback={<span class="whitespace-pre"> </span>}
      >
        {(l) => (
          <>
            <Numero
              tipo={l().tipo}
              n={props.lado === "antes" ? l().vieja : l().nueva}
              class="w-11"
            />
            <span class={textoDeLinea()}>
              <Texto linea={l()} tramos={props.indice === null ? [] : props.tramos[props.indice]} />
            </span>
          </>
        )}
      </Show>
    </div>
  );
}

function Numero(props: { tipo: Linea["tipo"]; n: number | null; class: string }) {
  return (
    /* **El número también va de color, y no es adorno.** Es lo que
       distingue las dos filas cuando el fondo es tan tenue como debe ser,
       y lo que dice de qué archivo es ese número: el de una borrada es su
       línea en el archivo de antes, el de una añadida en el de ahora. Sin
       color, dos filas seguidas con el mismo 112 se leen como un error.

       `tabular-nums` para que la columna no baile al pasar de 99 a 100, y
       `select-none` para que copiar el bloque no se lleve los números. */
    <span
      class={cn(
        "shrink-0 select-none pr-2 text-right tabular-nums",
        props.tipo === "add" && "text-success-strong",
        props.tipo === "del" && "text-error-strong",
        props.tipo === "ctx" && "text-neutral-500",
        props.class,
      )}
    >
      {props.n}
    </span>
  );
}

/** El texto de la línea, con los tramos que cambiaron sobre un fondo más fuerte. */
function Texto(props: { linea: Linea; tramos: Tramo[] }) {
  return (
    <Show when={props.tramos.length > 0} fallback={props.linea.texto || " "}>
      {cortar(props.linea.texto, props.tramos).map(([trozo, marcado]) =>
        marcado ? (
          <span
            class={cn(
              "rounded-[2px]",
              props.linea.tipo === "add" ? "bg-diff-add-word" : "bg-diff-del-word",
            )}
          >
            {trozo}
          </span>
        ) : (
          trozo
        ),
      )}
    </Show>
  );
}

function cortar(texto: string, tramos: Tramo[]): [string, boolean][] {
  const piezas: [string, boolean][] = [];
  let desde = 0;
  for (const [inicio, fin] of tramos) {
    if (inicio > desde) piezas.push([texto.slice(desde, inicio), false]);
    piezas.push([texto.slice(inicio, fin), true]);
    desde = fin;
  }
  if (desde < texto.length) piezas.push([texto.slice(desde), false]);
  return piezas;
}

/** El tramo que git no mandó, y el gesto para traerlo. */
function Salto(props: { cuantas: number; onDesplegar: () => void; eco?: boolean }) {
  return (
    <Show when={props.cuantas > 0}>
      <button
        class="col-span-full flex w-full items-center gap-2 border-y border-border bg-surface-raised px-2 py-1 text-left text-caption text-neutral-500 outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        onClick={props.onDesplegar}
        title={t("code.gap.title")}
        tabindex={props.eco ? -1 : undefined}
        aria-hidden={props.eco ? true : undefined}
      >
        <UnfoldVertical size={12} class="shrink-0" />
        {t("code.gap.lines", { count: props.cuantas })}
      </button>
    </Show>
  );
}
