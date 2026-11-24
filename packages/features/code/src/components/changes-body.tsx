import { For, Show, createMemo, type JSX } from "solid-js";
import { cn } from "../../../../ui/src/lib/utils";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { ajuste } from "../../../../ui/src/lib/wrap";
import { filasDosPaneles, marcarLineas, saltoEntre, type ArchivoDiff, type Fila, type Hunk, type Tramo } from "../model/diff";
import { disposicion } from "./changes-layout";
import { Lado, Salto, Trozo } from "./changes-lines";

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
