import type { JSX } from "solid-js";

export type Opcion = { value: string; label: string; detail?: string | null };

export type Pregunta = {
  id: string;
  question: string;
  header?: string | null;
  options: Opcion[];
  multiple?: boolean;
  free_text?: boolean;
};

export type RespuestaEnviada = {
  turn?: string;
  question: string;
  chosen: string[];
  free_text: string | null;
};

export type Estado = { elegidas: string[]; otra: boolean; texto: string };

export function inicial(p: Pregunta): Estado {
  return { elegidas: [], otra: (p.options?.length ?? 0) === 0, texto: "" };
}

export function contestada(e: Estado) {
  return e.elegidas.length > 0 || (e.otra && e.texto.trim().length > 0);
}

export function editable(destino: EventTarget | null) {
  return (
    destino instanceof HTMLTextAreaElement ||
    destino instanceof HTMLInputElement ||
    (destino instanceof HTMLElement && destino.isContentEditable)
  );
}

export function Insignia(props: { puesta: boolean; children: JSX.Element }) {
  return (
    <span
      aria-hidden="true"
      class={`inline-flex size-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold tabular-nums transition-colors duration-150 ease-out ${
        props.puesta
          ? "border-neutral-950 bg-neutral-950 text-neutral-50"
          : "border-border-strong text-neutral-500"
      }`}
    >
      {props.children}
    </span>
  );
}
