import { t } from "../../../../ui/src/lib/i18n";
import type { Razonamiento } from "../model/messageTypes";

/** Reasoning belongs to the turn's single activity disclosure. */
export default function Reasoning(props: { bloques: Razonamiento[] }) {
  return <section class="px-1 py-2" data-reasoning-content="">
    <h4 class="m-0 mb-1 text-xs font-medium text-neutral-500">{t("chat.reasoning.title")}</h4>
    <div class="text-sm whitespace-pre-wrap text-neutral-500 select-text">{props.bloques.map(block => block.text).join("\n\n")}</div>
  </section>;
}
