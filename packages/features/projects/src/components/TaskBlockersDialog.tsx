import { For, Show } from "solid-js";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { Button } from "../../../../ui/src/Button";
import { Dialog, DialogContent, DialogTitle } from "../../../../ui/src/Dialog";
import { type Aviso, readableSessionTitle } from "../screens/Sessions";

/** Lo que estorba para terminar o archivar una tarea, y qué hacer con eso. */
export default function TaskBlockersDialog(props: {
  aviso: Aviso;
  onCerrar: () => void;
  onArchivar: (id: string) => void;
  onDescartar: () => void;
}) {
  return (
    <Dialog open onOpenChange={(abierto) => { if (!abierto) props.onCerrar(); }}>
      <DialogContent class="flex flex-col gap-3">
        <DialogTitle class="text-sm font-semibold">
          {props.aviso.finish ? t("projects.sessions.blockers_finish_title") : t("projects.sessions.blockers_archive_title")}
        </DialogTitle>
        <Show when={props.aviso.blockers.unsaved.length > 0}>
          <p class="m-0 text-ui text-neutral-700">
            {t("projects.sessions.blockers_unsaved")}
          </p>
          <ul class="m-0 flex max-h-[40vh] list-none flex-col gap-2 overflow-y-auto p-0">
            <For each={props.aviso.blockers.unsaved}>{(work) => (
              <li class="min-w-0">
                <span class="flex min-w-0 items-baseline gap-2 text-ui font-medium text-neutral-950">
                  <span class="min-w-0 truncate">{readableSessionTitle(work.title)}</span>
                  <span class="shrink-0 text-caption font-normal text-neutral-500">
                    {t("projects.sessions.blockers_files", { count: work.files.length })}
                  </span>
                </span>
                <ul class="m-0 list-none p-0">
                  <For each={work.files}>{(file) => (
                    <li class="font-mono text-caption break-all text-neutral-500">{file}</li>
                  )}</For>
                </ul>
              </li>
            )}</For>
          </ul>
        </Show>
        <Show when={props.aviso.blockers.not_finished}>
          <p class="m-0 text-ui text-neutral-700">
            {t("projects.sessions.blockers_not_finished")}
          </p>
        </Show>
        <div class="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => props.onCerrar()}>
            {t("projects.sessions.blockers_cancel")}
          </Button>
          <Show when={props.aviso.finish && props.aviso.blockers.not_finished}>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => props.onArchivar(props.aviso.id)}
            >
              {t("projects.sessions.archive")}
            </Button>
          </Show>
          <Show when={props.aviso.blockers.unsaved.length > 0 && !props.aviso.blockers.not_finished}>
            <Button variant="danger" size="sm" onClick={() => props.onDescartar()}>
              {t("projects.sessions.blockers_discard")}
            </Button>
          </Show>
        </div>
      </DialogContent>
    </Dialog>
  );
}
