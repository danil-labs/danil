import { Show, createEffect, createSignal, onCleanup } from "solid-js";
import { Dynamic } from "solid-js/web";
import { ASTRO_BODIES, ASTRO_SHAPES, astroBody, type AstroBody, type AstroNode } from "@terminus/design";
import type { HandlerStatus } from "../../lib/model";
import { cn } from "../../lib/utils";
import { generacionDeAvatar, urlDeAvatar } from "./avatar-src";

export const CUERPOS = ASTRO_BODIES;
export type Cuerpo = AstroBody;

/** La clase que lleva los dos tonos del cuerpo. Literal para que se encuentre
 * desde `global.css` con `grep`: compuesta con plantilla, no la ve nadie. */
const CLASE: Record<Cuerpo, string> = {
  sun: "astro-sun",
  planet: "astro-planet",
  moon: "astro-moon",
  asteroid: "astro-asteroid",
  star: "astro-star",
  hole: "astro-hole",
  ringed: "astro-ringed",
  comet: "astro-comet",
  nebula: "astro-nebula",
  binary: "astro-binary",
  dwarf: "astro-dwarf",
  pulsar: "astro-pulsar",
  catplanet: "astro-catplanet",
  monkeyplanet: "astro-monkeyplanet",
};

/** Escondida o minimizada, la ventana apaga los astros (`global.css`). Perder el
 * foco no la apaga: es cuando se mira avanzar el trabajo desde otra app. */
function markWindowIdle() {
  document.documentElement.toggleAttribute("data-window-idle", document.visibilityState !== "visible");
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", markWindowIdle);
  markWindowIdle();
}

function AstroShape(props: { node: AstroNode }) {
  return <Dynamic component={props.node.tag} {...props.node.attrs}>
    {props.node.children?.map((node) => <AstroShape node={node} />)}
  </Dynamic>;
}

/**
 * La cara de un agente declarado: cuerpo determinista por nombre, ojos por
 * estado. Solo tres — «pensando» no existe, el backend no lo puede dar
 * (`docs/agents.md` § Interfaz). Los dos pares de ojos se pintan siempre y
 * `global.css` esconde el que no toca: alternarlos con `Show` remonta el nodo
 * y corta el parpadeo a media animación.
 */
export function AstroAvatar(props: {
  name: string;
  status: HandlerStatus;
  size?: number;
  class?: string;
  /** La cara elegida en su perfil. Sin ella manda el hash del nombre. */
  body?: string | null;
  /** Ruta de una imagen propia. Gana al cuerpo y no lleva sus trazos. */
  avatar?: string | null;
}) {
  const size = () => props.size ?? 34;
  const cuerpo = () => astroBody(props.name, props.body);
  const [url, setUrl] = createSignal<string | null | undefined>(undefined);
  createEffect(() => {
    const path = props.avatar;
    generacionDeAvatar();
    if (!path) {
      setUrl(undefined);
      return;
    }
    setUrl(undefined);
    let vivo = true;
    onCleanup(() => {
      vivo = false;
    });
    void urlDeAvatar(path).then((siguiente) => {
      if (vivo) setUrl(siguiente);
    });
  });
  return (
    <span
      class="astro-face relative inline-flex shrink-0"
      data-astro-working={props.status === "working" ? "true" : undefined}
    >
      <Show
        when={url()}
        fallback={
          <svg
            class={cn(
              "block shrink-0 overflow-visible",
              CLASE[cuerpo()],
              props.status === "asleep" && "opacity-[0.62]",
              props.class,
            )}
            width={size()}
            height={size()}
            viewBox="0 0 64 64"
            aria-hidden="true"
            data-astro-status={props.status}
          >
            {<AstroShape node={ASTRO_SHAPES[cuerpo()]} />}
            <g class="astro-ojos" fill="var(--astro-ojo)">
              <ellipse cx="26" cy="34" rx="2.7" ry="3.5" />
              <ellipse cx="38" cy="34" rx="2.7" ry="3.5" />
            </g>
            <g
              class="astro-ojos-cerrados"
              fill="none"
              stroke="var(--astro-ojo)"
              stroke-width="2.7"
              stroke-linecap="round"
            >
              <path d="M21.5 34q4.5 4 9 0" />
              <path d="M33.5 34q4.5 4 9 0" />
            </g>
          </svg>
        }
      >
        {(src) => (
          <img
            src={src()}
            alt=""
            width={size()}
            height={size()}
            draggable={false}
            class={cn(
              "block shrink-0 rounded-full object-contain",
              props.status === "asleep" && "opacity-[0.62]",
              props.class,
            )}
          />
        )}
      </Show>
    </span>
  );
}
