import { createSignal, type JSX } from "solid-js";
import { Input } from "../../../../ui/src/Input";
import { CHEVRON } from "../model/fileTree";

export const HuecoDeChevron = () => (
  <span class="shrink-0" style={{ width: `${CHEVRON}px` }} aria-hidden="true" />
);

/**
 * El nombre que se escribe en el sitio de la fila. Enter o salir del campo
 * confirman y Escape descarta; un fallo deja el campo abierto con lo escrito.
 */
export function CampoDeNombre(props: {
  inicial: string;
  sangria: string;
  etiqueta: string;
  icono: JSX.Element;
  onConfirmar: (nombre: string) => Promise<boolean>;
  onCancelar: () => void;
}) {
  const [valor, setValor] = createSignal(props.inicial);
  // El campo se desmonta al terminar y eso le quita el foco: sin esto el `blur`
  // repetiría la operación que acaba de salir bien.
  let terminado = false;
  let enviando = false;

  const confirmar = async () => {
    if (terminado || enviando) return;
    const nombre = valor().trim();
    if (!nombre || nombre === props.inicial) {
      terminado = true;
      props.onCancelar();
      return;
    }
    enviando = true;
    try {
      terminado = await props.onConfirmar(nombre);
    } finally {
      enviando = false;
    }
  };

  return (
    <form
      class="flex w-full items-center gap-1.5 py-0.5 pr-3"
      style={{ "padding-left": props.sangria }}
      onSubmit={(e) => {
        e.preventDefault();
        void confirmar();
      }}
    >
      <HuecoDeChevron />
      {props.icono}
      <Input
        ref={(el) =>
          queueMicrotask(() => {
            el.focus({ preventScroll: true });
            const punto = props.inicial.lastIndexOf(".");
            el.setSelectionRange(0, punto > 0 ? punto : props.inicial.length);
          })
        }
        class="min-h-6 rounded-sm px-1 py-0 font-mono text-label"
        value={valor()}
        aria-label={props.etiqueta}
        spellcheck={false}
        autocomplete="off"
        onInput={(e) => setValor(e.currentTarget.value)}
        onBlur={() => void confirmar()}
        onKeyDown={(e) => {
          if (e.key !== "Escape") return;
          e.preventDefault();
          e.stopPropagation();
          terminado = true;
          props.onCancelar();
        }}
      />
    </form>
  );
}
