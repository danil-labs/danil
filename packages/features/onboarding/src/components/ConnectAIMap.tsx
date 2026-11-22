import { marcaDeSuperficie } from "../../../../../apps/desktop/src/lib/surfaces";
import Check from "lucide-solid/icons/check";
import { For, Show } from "solid-js";
import { lista } from "../../../../../apps/desktop/src/lib/format";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { cn } from "../../../../../apps/desktop/src/lib/utils";
import { MarcaAgente } from "../../../../ui/src/icons";
import { type Conexiones, type Fila, nombreDeFila, ordenDelMapa, type Paso } from "../queries/connect-store";

type Nodo = "off" | "det" | "vivo" | "on";

function nodo(p: Paso | undefined): Nodo {
  if (p?.k === "conectada") return "on";
  if (p && ["descargando", "entrando", "clave", "comprobando", "saliendo", "alta"].includes(p.k)) return "vivo";
  return p?.k === "instalada" || p?.k === "sesion" ? "det" : "off";
}

function nombreCorto(f: Fila) {
  if (f.modo === "consentimiento") return t("surfaces.label.free_short");
  if (f.agente === "antigravity") return "Gemini";
  return nombreDeFila(f);
}

export function MarcaDeFila(props: { f: Fila; size: number }) {
  return <MarcaAgente id={marcaDeSuperficie({ catalogo: props.f.modo === "consentimiento" ? "gratuitos" : "todo", provider: props.f.agente })} size={props.size} />;
}

const LINEA: Record<Nodo, string> = {
  off: "stroke-border-strong [stroke-dasharray:3_5]",
  det: "stroke-primary/45 [stroke-dasharray:3_5]",
  vivo: "stroke-primary [stroke-dasharray:6_6] animate-flujo motion-reduce:animate-none",
  on: "stroke-primary [stroke-width:2]",
};
const AZULEJO: Record<Nodo, string> = {
  off: "opacity-35 grayscale",
  det: "ring-1 ring-primary/45",
  vivo: "ring-2 ring-primary",
  on: "ring-2 ring-success-strong",
};

/** El texto con los nombres en negrita, como los escribe el resumen del mapa. */
function ConNombres(props: { texto: string; nombres: string }) {
  const i = () => (props.nombres ? props.texto.indexOf(props.nombres) : -1);
  return (
    <Show when={i() >= 0} fallback={props.texto}>
      {props.texto.slice(0, i())}
      <b class="font-semibold text-neutral-950">{props.nombres}</b>
      {props.texto.slice(i() + props.nombres.length)}
    </Show>
  );
}

/** Terminus al centro y cada IA alrededor, con su estado en el trazo y en el aro de su logo. */
export function MapaDeConexiones(props: { c: Conexiones }) {
  const filas = () => ordenDelMapa(props.c.filas());
  const lugar = (i: number) => {
    const angulo = -Math.PI / 2 + (i * 2 * Math.PI) / Math.max(1, filas().length);
    return [50 + 37 * Math.cos(angulo), 48 + 40 * Math.sin(angulo)] as const;
  };
  const resumen = () => {
    const vivo = filas().find((f) => nodo(props.c.pasos[f.id]) === "vivo");
    if (vivo) {
      const names = nombreDeFila(vivo);
      return { texto: t("onboarding.ai.map.connecting", { name: names }), names };
    }
    const on = props.c.conectadas();
    if (on.length) {
      const names = lista(on.map(nombreDeFila));
      return { texto: t("onboarding.ai.map.ready", { count: on.length, names }), names };
    }
    const det = filas().filter((f) => f.detectada);
    if (det.length) {
      const names = lista(det.map(nombreDeFila));
      return { texto: t("onboarding.ai.map.found", { names }), names };
    }
    return { texto: t("onboarding.ai.map.none"), names: "" };
  };
  return (
    <div>
      <div class="relative mt-[22px] mb-[18px] h-[250px]" aria-hidden="true">
        <svg class="absolute inset-0 size-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
          <For each={filas()}>
            {(f, i) => (
              <line
                x1="50"
                y1="50"
                x2={lugar(i())[0]}
                y2={lugar(i())[1]}
                vector-effect="non-scaling-stroke"
                class={cn("[stroke-width:1.5] transition-[stroke] duration-300", LINEA[nodo(props.c.pasos[f.id])])}
              />
            )}
          </For>
        </svg>
        <span class="absolute top-1/2 left-1/2 grid size-[58px] -translate-1/2 place-items-center rounded-2xl bg-primary text-[var(--action-text)] shadow-lg ring-6 ring-bg">
          <MarcaAgente id="danil" size={30} />
        </span>
        <For each={filas()}>
          {(f, i) => {
            const estado = () => nodo(props.c.pasos[f.id]);
            return (
              <span
                class={cn(
                  "absolute grid w-[92px] -translate-1/2 justify-items-center gap-[5px] text-center text-caption transition-opacity duration-300",
                  estado() === "on" ? "font-semibold text-neutral-950" : "text-neutral-500",
                  estado() === "off" && "opacity-80",
                )}
                style={{ left: `${lugar(i())[0]}%`, top: `${lugar(i())[1]}%` }}
              >
                <span
                  class={cn(
                    "relative grid size-10 place-items-center rounded-[11px] border border-border bg-surface-raised ring-offset-4 ring-offset-bg transition-[filter,opacity,box-shadow] duration-300",
                    AZULEJO[estado()],
                  )}
                >
                  <MarcaDeFila f={f} size={22} />
                  <Show when={estado() === "on"}>
                    <span class="absolute -top-1 -right-1.5 grid size-4 place-items-center rounded-full bg-success-strong text-bg ring-2 ring-bg">
                      <Check size={10} stroke-width={3} />
                    </span>
                  </Show>
                </span>
                <span class="truncate">{nombreCorto(f)}</span>
              </span>
            );
          }}
        </For>
      </div>
      <p class="m-0 min-h-[18px] text-center text-ui text-neutral-500" role="status">
        <ConNombres texto={resumen().texto} nombres={resumen().names} />
      </p>
    </div>
  );
}
