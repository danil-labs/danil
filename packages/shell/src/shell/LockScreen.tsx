import TriangleAlert from "lucide-solid/icons/triangle-alert";
import { prosa, type Frase } from "../../../ui/src/lib/prose";

/**
 * La ventana que **no puede abrir estos datos**, y no abre nada más.
 *
 * La levanta un arranque que encuentra unos datos que este binario ya no sabe
 * convertir — ver `workspaces::base_decidida`.
 *
 * **Tapa la app entera a propósito, y esa es la diferencia con un aviso.** Sin
 * workspaces detrás, lo que se ve es la pantalla del alta: una negativa que
 * acaba invitando a crear un workspace **en la carpeta que se negó a tocar** no
 * es una negativa. Es el mismo argumento por el que el alta es la única otra
 * pantalla que tapa el riel.
 *
 * No lleva botón. Lo que hay que hacer pasa fuera de esta ventana y un botón
 * que no puede hacerlo sería un botón que miente.
 */
export default function PantallaDeBloqueo(props: { frase: Frase }) {
  return (
    <div class="flex h-full flex-col items-center justify-center gap-3 bg-surface px-8">
      <TriangleAlert size={28} class="shrink-0 text-warning-strong" aria-hidden="true" />
      <p
        class="m-0 max-w-[46ch] text-center text-ui leading-relaxed text-neutral-700"
        role="status"
      >
        {prosa(props.frase)}
      </p>
    </div>
  );
}
