import { For } from "solid-js";
import { t } from "../../lib/i18n";
import { cn } from "../../lib/utils";
import { AstroAvatar, CUERPOS, type Cuerpo } from "./AstroAvatar";

/**
 * Las caras del catálogo y, primera, la que sale sola del nombre. La comparten
 * el perfil de un agente y el diálogo que lo crea.
 */
export function BodyPicker(props: {
  name: string;
  value: string | null;
  onChange: (body: Cuerpo | null) => void;
  /** El alta lo deja en una sola fila: tres filas de caras alargan el diálogo. */
  class?: string;
}) {
  return (
    <div class={cn("flex flex-wrap gap-1.5", props.class)}>
      <For each={[null, ...CUERPOS]}>
        {(option) => (
          <button
            type="button"
            class={cn(
              "grid size-11 place-items-center rounded-md border border-transparent bg-transparent outline-none hover:bg-surface-muted focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
              props.value === option && "border-border-strong bg-surface-muted",
            )}
            aria-pressed={props.value === option}
            aria-label={
              option ? t(`projects.agents.body.${option}`) : t("projects.agents.profile_face_from_name")
            }
            title={
              option ? t(`projects.agents.body.${option}`) : t("projects.agents.profile_face_from_name")
            }
            onClick={() => props.onChange(option)}
          >
            <AstroAvatar name={props.name} status="awake" body={option} size={30} />
          </button>
        )}
      </For>
    </div>
  );
}
