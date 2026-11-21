import FolderOpen from "lucide-solid/icons/folder-open";
import { Button } from "../../../ui/src/Button";
import { t } from "../../../../apps/desktop/src/lib/i18n";

/**
 * Un workspace sin fuente de contexto. **Nace inerte**: sabe qué alcanza y no
 * tiene nada en disco.
 *
 * **No es una puerta.** Ocupando la ventana entera mientras `context_root` sea
 * `null`, sin señalar una carpeta no hay riel lateral, ni proyectos, ni forma de
 * escribir nada — y un proyecto no es un repo, así que trabajar no puede
 * depender de que exista uno. Vive al lado del selector de proyecto, que es
 * donde se decide de qué es esta conversación, y no impide empezar sin
 * material.
 *
 * No lleva párrafo. El renglón dice qué falta —que es estado, no glosa— y los
 * botones dicen por dónde se sale.
 */
export function EmptyContext(props: {
  onPickFolder: () => void;
  onConnect: () => void;
}) {
  return (
    <div class="flex flex-wrap items-center justify-center gap-1 text-xs text-neutral-500">
      <span class="px-1">{t("projects.context.empty")}</span>
      <Button variant="ghost" size="sm" onClick={props.onConnect}>
        {t("projects.context.connect")}
      </Button>
      <Button variant="ghost" size="sm" onClick={props.onPickFolder}>
        <FolderOpen size={14} />
        {t("projects.context.pick_folder")}
      </Button>
    </div>
  );
}
