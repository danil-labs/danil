import { createSignal, For, Match, Show, Switch } from "solid-js";
import { AnsiText, Spinner } from "@danil/ui";
import { ChevronRight } from "./icons.tsx";

export interface DetalleOutput {
  kind: "output";
  text?: string;
  truncated?: boolean;
  exit_code?: number | null;
}

export interface DetalleEdit {
  kind: "edit";
  path?: string;
  before?: string | null;
  after?: string | null;
}

export type Detalle = DetalleOutput | DetalleEdit | { kind: string; [key: string]: unknown };

export interface Paso {
  id?: string;
  clase?: string;
  nombre?: string;
  objetivo?: string;
  detalle?: Detalle | null;
  corriendo?: boolean;
  ok?: boolean | null;
}

export interface TimelineProps {
  pasos?: Paso[];
  pieces?: Array<{
    id: string;
    kind: string;
    name?: string;
    command?: string;
    output?: string;
    status?: string;
    ok?: boolean | null;
    target?: string;
    detail?: unknown;
    exitCode?: number | null;
  }>;
  individual?: boolean;
  active?: boolean;
}

function Glifo(props: { paso: Paso }) {
  const fallido = () => props.paso.ok === false;
  return (
    <span class="flex size-3.5 shrink-0 items-center justify-center">
      <Show
        when={fallido()}
        fallback={<span class="size-1.5 rounded-full bg-neutral-400" />}
      >
        <span class="size-1.5 rounded-full bg-error-strong" />
      </Show>
    </span>
  );
}

function rotuloDePaso(paso: Paso): { verbo: string; sujeto?: string } {
  if (paso.clase === "ejecutar" || paso.nombre === "shell") {
    return { verbo: "Ejecutó", sujeto: paso.objetivo };
  }
  if (paso.clase === "editar" || paso.nombre?.includes("edit") || paso.nombre?.includes("write")) {
    return { verbo: "Editó", sujeto: paso.objetivo };
  }
  if (paso.clase === "leer" || paso.nombre?.includes("read")) {
    return { verbo: "Leyó", sujeto: paso.objetivo };
  }
  return { verbo: paso.nombre ? `Usó ${paso.nombre}` : "Paso", sujeto: paso.objetivo };
}

export function Timeline(props: TimelineProps) {
  const [abiertas, setAbiertas] = createSignal<Record<string, boolean>>({});

  const items = (): Paso[] => {
    if (props.pasos) return props.pasos;
    if (props.pieces) {
      return props.pieces
        .filter((p) => p.kind === "tool" || p.kind === "shell")
        .map((p) => {
          if (p.kind === "tool") {
            return {
              id: p.id,
              clase: "herramienta",
              nombre: p.name,
              objetivo: p.target,
              detalle: p.detail as Detalle,
              corriendo: p.status === "running",
              ok: p.ok ?? (p.status === "error" ? false : true),
            };
          }
          return {
            id: p.id,
            clase: "ejecutar",
            nombre: "shell",
            objetivo: p.command,
            detalle: { kind: "output", text: p.output, exit_code: p.exitCode } as DetalleOutput,
            corriendo: p.status === "running",
            ok: p.exitCode === 0 || p.exitCode == null,
          };
        });
    }
    return [];
  };

  const toggle = (clave: string) => {
    setAbiertas((prev) => ({ ...prev, [clave]: !prev[clave] }));
  };

  return (
    <div role="list" class="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-0.5">
      <For each={items()}>
        {(paso, i) => {
          const clave = () => paso.id ?? `#${i()}`;
          const abierta = () => Boolean(abiertas()[clave()]);
          const rotulo = () => rotuloDePaso(paso);
          const tieneSalida = () => Boolean(paso.detalle && "text" in paso.detalle && paso.detalle.text);
          const abre = () => tieneSalida() || Boolean(paso.objetivo);

          return (
            <div role="listitem">
              <Show
                when={abre()}
                fallback={
                  <p class="m-0 flex w-full min-w-0 items-start gap-2 px-1 py-1.5 text-left text-xs">
                    <span class="size-3 shrink-0" aria-hidden="true" />
                    <Show
                      when={paso.corriendo}
                      fallback={<Glifo paso={paso} />}
                    >
                      <span class="mt-px flex size-3.5 shrink-0 items-center justify-center">
                        <Spinner size={12} class="text-primary" />
                      </span>
                    </Show>
                    <span class="font-medium text-neutral-700">{rotulo().verbo}</span>
                    <Show when={rotulo().sujeto}>
                      {(s) => <span class="min-w-0 truncate font-mono text-neutral-500">{s()}</span>}
                    </Show>
                  </p>
                }
              >
                <button
                  type="button"
                  data-fila
                  aria-expanded={abierta()}
                  onClick={() => toggle(clave())}
                  class="flex w-full min-w-0 items-center gap-2 rounded-sm px-1 py-1.5 text-left text-xs hover:bg-surface-muted"
                >
                  <ChevronRight
                    size={12}
                    class={`shrink-0 text-neutral-500 transition-transform ${abierta() ? "rotate-90" : ""}`}
                    aria-hidden="true"
                  />
                  <Show
                    when={paso.corriendo}
                    fallback={<Glifo paso={paso} />}
                  >
                    <span class="mt-px flex size-3.5 shrink-0 items-center justify-center">
                      <Spinner size={12} class="text-primary" />
                    </span>
                  </Show>
                  <span class="shrink-0 font-medium text-neutral-700">{rotulo().verbo}</span>
                  <Show when={rotulo().sujeto}>
                    {(s) => <span class="min-w-0 truncate font-mono text-neutral-500">{s()}</span>}
                  </Show>
                  <Show when={paso.ok === false}>
                    <span class="ml-auto shrink-0 text-caption text-error-strong">falló</span>
                  </Show>
                </button>
              </Show>

              <Show when={abre() && abierta()}>
                <div class="ml-5 grid gap-2 border-l border-border py-1 pl-3 text-xs">
                  <Show when={paso.objetivo}>
                    <p class="m-0 font-mono text-caption break-all text-neutral-700">{paso.objetivo}</p>
                  </Show>
                  <Show when={paso.detalle && "text" in paso.detalle && paso.detalle.text}>
                    <pre class="m-0 max-h-60 overflow-auto border-l border-border pl-3 font-mono text-caption leading-[1.5] whitespace-pre-wrap text-neutral-950">
                      <AnsiText text={String((paso.detalle as { text: string }).text)} />
                    </pre>
                  </Show>
                </div>
              </Show>
            </div>
          );
        }}
      </For>
    </div>
  );
}

export { Timeline as LineaDeTiempo };
export default Timeline;
