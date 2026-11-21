/** Un bloque de lo que el agente pensó. No es su respuesta. */
export type Razonamiento = {
  text: string;
  /** Cuánto duró, cuando el turno guardado lo trae. */
  durationMs?: number;
  /** El motor cortó el bloque por su tope. */
  truncated?: boolean;
};

/** Reasoning belongs to the turn's single activity disclosure. */
export function Reasoning(props: { bloques: Razonamiento[] }) {
  return (
    <section class="px-1 py-2" data-reasoning-content="">
      <h4 class="m-0 mb-1 text-xs font-medium text-neutral-500">Razonamiento</h4>
      <div class="text-sm whitespace-pre-wrap text-neutral-500 select-text">
        {props.bloques.map((block) => block.text).join("\n\n")}
      </div>
    </section>
  );
}

export default Reasoning;
