import type { Accessor } from "solid-js";
import type { SenderTask } from "../../../../../apps/desktop/src/lib/recipients";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { Pressable } from "../../../../ui/src/Pressable";

/** « — Abrir»: el enlace a la tarea que escribió la fila (cola y bandeja). */
export function OpenSenderTask(props: {
  sender: Accessor<SenderTask>;
  onOpenTask?: (folder: string, task: string, machine?: string | null) => void;
}) {
  const { sender } = props;
  return (
    <>
      {" — "}
      <Pressable
        class="cursor-pointer underline underline-offset-2"
        aria-label={t("chat.recipients.open_task", { title: sender().title })}
        onClick={() => props.onOpenTask?.(sender().folder, sender().task, sender().machine)}
      >
        {t("chat.task_completed.open")}
      </Pressable>
    </>
  );
}
