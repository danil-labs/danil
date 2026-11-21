import { For } from "solid-js";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { Button } from "../../../../ui/src/Button";
import { Dialog, DialogContent, DialogTitle } from "../../../../ui/src/Dialog";

/** Cancelar recibe el foco: Enter por inercia no descarta ni guarda archivos. */
export function UnsavedCloseDialog(props: {
  files: readonly string[];
  onCancel: () => void;
  onDiscard: () => void;
  onSave: () => void;
}) {
  return (
    <Dialog open onOpenChange={(abierto) => { if (!abierto) props.onCancel(); }}>
      <DialogContent class="flex flex-col gap-3">
        <DialogTitle class="text-sm font-semibold">{t("projects.tabs.unsaved.title")}</DialogTitle>
        <p class="m-0 text-ui text-neutral-700">{t("projects.tabs.unsaved.body")}</p>
        <ul class="m-0 flex max-h-[40vh] list-none flex-col overflow-y-auto p-0">
          <For each={props.files}>{(ruta) => (
            <li class="shrink-0 truncate font-mono text-caption text-neutral-500" title={ruta}>{ruta}</li>
          )}</For>
        </ul>
        <div class="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={props.onCancel}>
            {t("projects.tabs.unsaved.cancel")}
          </Button>
          <Button variant="secondary" size="sm" onClick={props.onDiscard}>
            {t("projects.tabs.unsaved.discard")}
          </Button>
          <Button size="sm" onClick={props.onSave}>
            {t("projects.tabs.unsaved.save")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
