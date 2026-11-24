import { Show } from "solid-js";
import { segmentosAnsi } from "./lib/ansi";
import { enlacesEnTexto } from "./lib/chat/links";

function sinAnsi(text: string) {
  return segmentosAnsi(text).map((segmento) => segmento.text).join("");
}

/** Con `enlaces`, cada URL web de la salida se abre en el navegador de la persona. */
export function AnsiText(props: { text: string; enlaces?: boolean }) {
  return (
    <Show when={props.enlaces} fallback={sinAnsi(props.text)}>
      {enlacesEnTexto(sinAnsi(props.text)).map(({ texto, url }) =>
        url ? (
          <a
            href={url}
            class="cursor-pointer text-link underline underline-offset-2"
            onClick={(e) => {
              e.preventDefault();
              window.dispatchEvent(new CustomEvent("harness:abrir-fuera", { detail: url }));
            }}
          >
            {texto}
          </a>
        ) : (
          texto
        ),
      )}
    </Show>
  );
}
