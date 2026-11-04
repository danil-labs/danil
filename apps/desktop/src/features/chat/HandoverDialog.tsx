import { t } from "../../lib/i18n";
import "../../locales/handoverPhrases";
import { Button } from "../../ui/Button";
import { Dialog, DialogContent, DialogTitle } from "../../ui/Dialog";

export type HandoverDialogProps = {
  /** El CLI que la sesión tiene hoy, ya con su nombre visible. */
  from: string;
  /** El CLI confirmado, ya con su nombre visible. */
  to: string;
  onCancel: () => void;
  onConfirm: () => void;
};

/** La confirmación del traspaso; perezosa para no pesar en la carga inicial. */
export default function HandoverDialog(props: HandoverDialogProps) {
  return (
    <Dialog open onOpenChange={(abierto) => { if (!abierto) props.onCancel(); }}>
      <DialogContent class="flex flex-col gap-3">
        <DialogTitle class="text-sm font-semibold">{t("chat.handover.confirm.title")}</DialogTitle>
        <p class="m-0 text-ui text-neutral-700">
          {t("chat.handover.confirm.body", { from: props.from, to: props.to })}
        </p>
        <div class="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={props.onCancel}>
            {t("chat.handover.confirm.cancel")}
          </Button>
          <Button size="sm" onClick={props.onConfirm}>
            {t("chat.handover.confirm.accept")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
