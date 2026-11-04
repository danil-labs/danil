import { For, createEffect, createSignal, on, onCleanup, onMount } from "solid-js";
import { listen } from "../../lib/serviceEvents";
import { invoke } from "../../lib/invoke.ts";
import { leerPref } from "../../lib/prefs";
import { t } from "../../lib/i18n";
import { Button } from "../../ui/Button";
import { Toast } from "../../ui/Toast";
import { createWorkspaces } from "../settings/workspaces-store";
import type { AttentionState, WorkspaceAttention } from "./attention";
import { Dynamic } from "solid-js/web";
import { cn } from "../../lib/utils";
import { stateColor, stateIcon } from "../projects/TaskStatus";
import type { ChatEvent } from "@terminus/protocol";

/** Qué tareas avisan: todas, solo las que necesitan a la persona, o ninguna. */
export type NotifyChoice = "all" | "needs_you" | "off";
export const NOTIFY_PREF = "notify.tasks";

const NEEDS_YOU: AttentionState[] = ["approving", "asked", "failed"];

type Notice = { key: string; workspace: string; session: string; project: string; state: AttentionState; title: string };

/**
 * En la web cada máquina contesta a su ritmo: lo que llega justo tras recargar
 * ya esperaba, aunque aparezca después de la primera lista.
 */
const SETTLE_MS = import.meta.env.MODE === "web" ? 20_000 : 0;

/** Detener tareas a mano las cierra todas a la vez; eso no se avisa como si hubieran terminado. */
let quietUntil = 0;
export function quietFinished(ms = 15000) {
  quietUntil = Date.now() + ms;
}

/**
 * Avisa cuando una tarea pasa a necesitar a la persona o termina sin que nadie
 * la mire. Fuera de la pantalla, aviso del sistema; a la vista sin foco, parpadeo
 * si la necesita; con foco en otra tarea, un aviso dentro de la app.
 */
export default function TaskNotifier(props: {
  attention: WorkspaceAttention[];
  workspace: string | null;
  /** Si la tarea se ve en alguna ventana del reparto, no solo en la activa. */
  inView: (session: string) => boolean;
  title: (session: string) => string | undefined;
  open: (project: string, session: string) => void;
}) {
  const ws = createWorkspaces();
  const [notices, setNotices] = createSignal<Notice[]>([]);
  let before: Map<string, AttentionState> | null = null;
  const settledAt = Date.now() + SETTLE_MS;
  /** Los avisos del sistema recientes, para abrir su tarea al pulsarlos. */
  const sent = new Map<string, Notice>();
  const failed = new Set<string>();
  const pending = new Map<string, Notice>();
  const inView = (notice: Notice) => notice.workspace === props.workspace && props.inView(notice.session);

  function dismiss(notice: Notice) {
    pending.delete(notice.key);
    setNotices((list) => list.filter((n) => n.key !== notice.key));
  }

  const titleOf = (workspace: string, session: string) => {
    if (workspace === props.workspace) return props.title(session)?.trim() || t("shell.close.untitled");
    const name = ws.lista()?.find((w) => w.id === workspace)?.name;
    return name ? t("shell.notify.task_in", { name }) : t("shell.close.untitled");
  };

  const heading = (state: AttentionState, title: string) =>
    state === "approving" ? t("shell.notify.approving", { title })
    : state === "asked" ? t("shell.notify.waiting", { title })
    : state === "failed" ? t("shell.notify.failed", { title })
    : t("shell.notify.finished", { title });
  const hint = (state: AttentionState) =>
    state === "approving" ? t("shell.notify.approving_hint")
    : state === "asked" ? t("shell.notify.waiting_hint")
    : state === "failed" ? t("shell.notify.failed_hint")
    : t("shell.notify.finished_hint");

  async function announce(notice: Notice) {
    const choice = leerPref<NotifyChoice>(NOTIFY_PREF, "all");
    if (choice === "off" || (choice === "needs_you" && !NEEDS_YOU.includes(notice.state))) return;
    if (notice.state === "unseen" && Date.now() < quietUntil) return;
    pending.set(notice.key, notice);
    // Rust decide con el foco nativo: aviso del sistema, parpadeo, o este panel.
    const where = await invoke<string>("tray_notify", {
      title: heading(notice.state, notice.title),
      body: hint(notice.state),
      needsYou: NEEDS_YOU.includes(notice.state),
      key: notice.key,
    }).catch(() => "focused");
    if (where === "system") {
      sent.delete(notice.key);
      sent.set(notice.key, notice);
      if (sent.size > 20) sent.delete(sent.keys().next().value!);
    }
    if (pending.get(notice.key) !== notice || before?.get(notice.key) !== notice.state) return;
    pending.delete(notice.key);
    if (where !== "focused" || inView(notice)) return;
    if (!NEEDS_YOU.includes(notice.state)) return;
    setNotices((list) => [...list.filter((n) => n.key !== notice.key), notice].slice(-3));
  }

  createEffect(
    on(
      () => props.attention,
      (list) => {
        const now = new Map<string, AttentionState>();
        for (const w of list) for (const task of w.tasks) now.set(`${w.workspace}/${task.session}`, task.state);
        // La primera lista es lo que ya esperaba al abrir: eso no es nuevo.
        if (before && Date.now() >= settledAt) {
          for (const w of list) {
            for (const task of w.tasks) {
              const key = `${w.workspace}/${task.session}`;
              if (before.get(key) === task.state) continue;
              if (task.state === "failed") {
                if (failed.has(key)) continue;
                failed.add(key);
              }
              // Sin título no hay nada legible que avisar.
              if (w.workspace === props.workspace && !props.title(task.session)?.trim()) continue;
              void announce({ key, workspace: w.workspace, session: task.session, project: task.project, state: task.state, title: titleOf(w.workspace, task.session) });
            }
          }
        } else {
          for (const [key, state] of now) if (state === "failed") failed.add(key);
        }
        before = now;
        for (const [key, notice] of pending) if (now.get(key) !== notice.state) pending.delete(key);
        setNotices((shown) => {
          const still = shown.filter((n) => now.get(n.key) === n.state);
          return still.length === shown.length ? shown : still;
        });
      },
    ),
  );

  createEffect(() => {
    for (const w of props.attention) {
      for (const task of w.tasks) {
        if (w.workspace === props.workspace && props.inView(task.session)) pending.delete(`${w.workspace}/${task.session}`);
      }
    }
    for (const notice of notices()) if (inView(notice)) dismiss(notice);
  });

  onMount(() => {
    const chat = listen<ChatEvent>("chat", (e) => {
      const workspace = e.payload.workspace ?? props.workspace;
      if (e.payload.kind !== "started" || !workspace) return;
      const key = `${workspace}/${e.payload.session}`;
      failed.delete(key);
      pending.delete(key);
      setNotices((list) => list.filter((n) => n.key !== key));
    });
    const unlisten = listen<string>("notice-clicked", (e) => {
      const notice = sent.get(e.payload);
      if (notice) go(notice);
    });
    onCleanup(() => {
      pending.clear();
      void chat.then((off) => off());
      void unlisten.then((off) => off());
    });
  });

  function go(notice: Notice) {
    dismiss(notice);
    if (notice.workspace === props.workspace) props.open(notice.project, notice.session);
    else void ws.cambiarA(notice.workspace);
  }

  return (
    <For each={notices()}>
      {(notice) => (
        <Toast data-task-notice={notice.state} onDismiss={() => dismiss(notice)}>
          <div class="flex items-start gap-2">
            <Dynamic component={stateIcon(notice.state)} size={14} aria-hidden="true" class={cn("mt-px shrink-0", stateColor(notice.state))} />
            <p class="m-0 min-w-0 break-words text-xs text-neutral-950">{heading(notice.state, notice.title)}</p>
          </div>
          <div>
            <Button variant="outline" size="compact" onClick={() => go(notice)}>
              {t("shell.notify.open")}
            </Button>
          </div>
        </Toast>
      )}
    </For>
  );
}
