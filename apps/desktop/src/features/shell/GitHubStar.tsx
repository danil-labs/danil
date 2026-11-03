import X from "lucide-solid/icons/x";
import { Show } from "solid-js";
import { t } from "../../lib/i18n";
import { invoke } from "../../lib/invoke.ts";
import { createPref } from "../../lib/prefs";
import { Button } from "../../ui/Button";
import { GitHubMark } from "../../ui/icons";
import { RETARDO_TOOLTIP, TooltipContent, TooltipRoot, TooltipTrigger } from "../../ui/Tooltip";

const REPOSITORIO = "https://github.com/danil-labs/danil";

/**
 * La invitación a la estrella, a la derecha de la franja de pestañas.
 *
 * Se va al abrir el repositorio y también con la X. La preferencia es de
 * esta máquina (`github.star.dismissed`): quien ya la ocultó no la vuelve a ver.
 * Al quitarla, el foco vuelve al espacio o a la búsqueda de la misma franja:
 * el nombre del workspace ya no vive aquí.
 */
export default function GitHubStar() {
  const [oculto, setOculto] = createPref("github.star.dismissed", false);
  let grupo: HTMLDivElement | undefined;
  let abriendo = false;
  const ocultar = () => {
    const devolver = document.hasFocus() && !!grupo?.contains(document.activeElement);
    setOculto(true);
    if (!devolver) return;
    grupo
      ?.closest("[data-title-bar]")
      ?.querySelector<HTMLButtonElement>("[data-space-menu], [data-global-search-open]")
      ?.focus();
  };
  const abrir = () => {
    if (abriendo) return;
    abriendo = true;
    void invoke("site_open_external", { url: REPOSITORIO })
      .then(ocultar)
      .catch(() => {})
      .finally(() => {
        abriendo = false;
      });
  };

  return (
    <Show when={!oculto()}>
      <div ref={grupo} data-github-star="" class="flex shrink-0 items-center">
        <TooltipRoot openDelay={RETARDO_TOOLTIP} placement="bottom-end" gutter={8}>
          <TooltipTrigger
            as={Button}
            type="button"
            variant="chrome"
            size="compact"
            class="h-[30px] gap-1.5 px-2 text-ui"
            aria-label={t("shell.github.star.title")}
            onClick={abrir}
          >
            <span aria-hidden="true">
              <GitHubMark size={14} />
            </span>
            {t("shell.github.star")}
          </TooltipTrigger>
          <TooltipContent>{t("shell.github.star.help")}</TooltipContent>
        </TooltipRoot>
        <Button
          type="button"
          variant="chrome"
          size="compact"
          class="size-[30px] p-0 text-neutral-500"
          aria-label={t("shell.github.star.dismiss")}
          title={t("shell.github.star.dismiss")}
          onClick={ocultar}
        >
          <X size={14} aria-hidden="true" />
        </Button>
      </div>
    </Show>
  );
}
