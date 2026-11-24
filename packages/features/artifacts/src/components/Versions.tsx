import { For, Show } from "solid-js";
import { Popover, PopoverContent, PopoverTrigger } from "../../../../ui/src/Popover";
import { Button } from "../../../../ui/src/Button";
import { Pressable } from "../../../../ui/src/Pressable";
import {
  cuando,
  mismaVersion,
  NOMBRE_VIA,
  quien,
  type History,
  type Publicacion,
  type VersionRef,
} from "../queries/history";
import { t } from "../../../../ui/src/lib/i18n";

/**
 * La cadena de versiones de un artefacto, y cuál se está mirando.
 *
 * **Existe porque editar no puede seguir siendo invisible.** Un artefacto es una
 * instantánea y el gate aprueba esa instantánea; en cuanto se deja retocarlo a
 * mano hay que poder decir qué se aprobó y qué vino después. Editar no muta: cada
 * cambio —del agente o de la persona— es una versión más, y ninguna se pierde.
 *
 * Por eso el disparador no es un adorno: cuando lo que se ve no es la versión que
 * está en disco, **lo dice él mismo** (`2 de 4`, marcado) en vez de dejar que la
 * pantalla mienta por omisión. Es retroalimentación de estado, no glosa.
 */
export default function Versiones(props: {
  historia: History;
  /** La que se está mirando, o `null` si es la que está en disco. */
  viendo: VersionRef | null;
  /** Lo que ya salió de este artefacto, por versión. */
  publicaciones: Publicacion[];
  onVer: (v: VersionRef | null) => void;
}) {
  const total = () => props.historia.versions.length;
  const actual = () => props.historia.current;
  const enLaActual = () => props.viendo === null;
  const salidas = (r: VersionRef) =>
    props.publicaciones.filter((p) => mismaVersion(p.version, r));

  return (
    <Show when={total() > 0}>
      <Popover placement="bottom-start">
        <PopoverTrigger
          as={(p: object) => (
            <Button
              {...p}
              variant="outline"
              size="compact"
              class={enLaActual() ? undefined : "text-warning-strong"}
              title={
                enLaActual()
                  ? t("artifacts.versions.title")
                  : t("artifacts.versions.title_old")
              }
            >
              <span class="font-mono">
                {enLaActual()
                  ? t("artifacts.versions.current", { n: actual()?.n ?? total() })
                  : t("artifacts.versions.of", {
                      n: props.viendo!.n,
                      total: total(),
                    })}
              </span>
            </Button>
          )}
        />

        <PopoverContent class="w-64 p-1">
          <ul class="max-h-64 overflow-y-auto">
            {/* De la más nueva a la más vieja: al abrir el historial se busca lo
                último que pasó, no el principio de los tiempos. */}
            <For each={[...props.historia.versions].reverse()}>
              {(v) => {
                const esActual = () => mismaVersion(v.referencia, actual());
                const mirando = () =>
                  enLaActual()
                    ? esActual()
                    : mismaVersion(v.referencia, props.viendo);
                const vias = () =>
                  salidas(v.referencia)
                    .map((s) => NOMBRE_VIA[s.via] ?? s.via)
                    .filter((x, i, a) => a.indexOf(x) === i);

                return (
                  <li>
                    <Pressable
                      aria-current={mirando() ? "true" : undefined}
                      onClick={() => props.onVer(esActual() ? null : v.referencia)}
                      class={`flex w-full items-baseline gap-2 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-surface-muted ${
                        mirando() ? "bg-surface-muted" : ""
                      }`}
                    >
                      <span class="font-mono text-neutral-950">
                        {t("artifacts.versions.current", { n: v.referencia.n })}
                      </span>
                      <span class="min-w-0 flex-1 truncate text-neutral-500">
                        {cuando(v.ts)} · {quien(v.author)}
                      </span>
                      {/* Cuál es la que hay en el documento ahora mismo — o sea,
                          la que se publicaría si se publicara hoy. */}
                      <Show when={esActual()}>
                        <span class="text-neutral-500">
                          {t("artifacts.versions.is_current")}
                        </span>
                      </Show>
                    </Pressable>
                    {/* Lo que salió de esta versión. Va debajo de la versión y no
                        en una pantalla aparte porque es un hecho SOBRE ella: la
                        pregunta que contesta —qué se publicó y cuándo— solo tiene
                        sentido pegada a lo que se publicó. */}
                    <Show when={vias().length > 0}>
                      <p class="px-2 pb-1.5 text-xs text-neutral-500">
                        {t("artifacts.versions.published_as", {
                          vias: vias().join(", "),
                        })}
                      </p>
                    </Show>
                  </li>
                );
              }}
            </For>
          </ul>
        </PopoverContent>
      </Popover>
    </Show>
  );
}
