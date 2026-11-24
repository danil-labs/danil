import CornerDownLeft from "lucide-solid/icons/corner-down-left";
import MessageCircle from "lucide-solid/icons/message-circle";
import MessageCircleQuestion from "lucide-solid/icons/message-circle-question-mark";
import X from "lucide-solid/icons/x";
import { Show } from "solid-js";
import { t } from "../../../../ui/src/lib/i18n";
import { Button } from "../../../../ui/src/Button";
import { type Failure, FailureNote } from "../../../../ui/src/Failure";
import { Markdown } from "../../../../ui/src/Markdown";
import { TeclaDeAtajo } from "../../../../ui/src/Shortcut";
import { Spinner } from "../../../../ui/src/Spinner";

/** Una pregunta al margen en pantalla. Vive en memoria: nada de esto se guarda. */
export type AlMargen = {
  session: string;
  question: string;
  answer: string | null;
  failure: Failure | null;
};

/** El panel de la pregunta al margen, dentro de la caja y encima del campo. */
export function PanelAlMargen(props: {
  estado: AlMargen;
  onCerrar: () => void;
  onPasarAlHilo: () => void;
  onSeguir: () => void;
}) {
  return (
    <section
      aria-label={t("chat.side.title")}
      aria-live="polite"
      class="mx-1 mt-1 flex min-w-0 flex-col gap-2 rounded-[10px] border border-side/35 bg-side/4 px-3 pt-2 pb-3"
    >
      <div class="flex min-w-0 items-center gap-2">
        <MessageCircleQuestion size={14} class="shrink-0 text-side" aria-hidden="true" />
        <span class="text-ui font-semibold text-side">{t("chat.side.title")}</span>
        <span class="rounded-[5px] bg-surface px-1.5 py-0.5 text-caption text-neutral-700">
          {t("chat.side.off_thread")}
        </span>
        <span class="flex-1" />
        <span class="text-neutral-500">
          <TeclaDeAtajo accion="closeSideQuestion" />
        </span>
        <Button
          type="button"
          variant="ghost"
          size="iconCompact"
          aria-label={t("chat.side.close")}
          title={t("chat.side.close")}
          onClick={() => props.onCerrar()}
        >
          <X size={15} />
        </Button>
      </div>
      <p class="m-0 font-mono text-ui break-words whitespace-pre-wrap text-neutral-950">
        {props.estado.question}
      </p>
      <Show
        when={props.estado.answer}
        fallback={
          <Show
            when={props.estado.failure}
            fallback={
              <span class="flex items-center gap-1.5 text-ui text-neutral-500">
                <Spinner size={13} class="text-side" />
                {t("chat.side.waiting")}
              </span>
            }
          >
            {(failure) => <FailureNote f={failure()} />}
          </Show>
        }
      >
        {(answer) => (
          <>
            <div class="max-h-[40vh] min-w-0 overflow-y-auto overscroll-contain text-ui text-neutral-700">
              <Markdown>{answer()}</Markdown>
            </div>
            <div class="flex min-w-0 justify-end gap-1">
              <Button type="button" variant="secondary" size="sm" onClick={() => props.onPasarAlHilo()}>
                <CornerDownLeft size={14} aria-hidden="true" />
                {t("chat.side.to_thread")}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => props.onSeguir()}>
                <MessageCircle size={14} aria-hidden="true" />
                {t("chat.side.keep_asking")}
              </Button>
            </div>
          </>
        )}
      </Show>
    </section>
  );
}
