import type { ParentProps } from "solid-js";

export function TaskUserBubble(props: ParentProps) {
  return (
    <div class="min-w-0 ml-auto w-fit max-w-full rounded-lg border border-chat-user-border bg-chat-user p-3">
      {props.children}
    </div>
  );
}

/** El input de un encargado u otra tarea: neutro, para que no compita con el de la persona. */
export function TaskIncomingBubble(props: ParentProps) {
  return (
    <div class="min-w-0 w-fit max-w-full rounded-lg bg-chat-incoming p-3 shadow-sm">
      {props.children}
    </div>
  );
}

export const taskChatPresentation = {
  UserBubble: TaskUserBubble,
  IncomingBubble: TaskIncomingBubble,
  userMessage: "ml-auto w-fit max-w-[80%]",
  incomingMessage: "mr-auto w-fit max-w-[80%]",
  composerBar: "bg-transparent px-4 pt-3 pb-3",
  composer: "",
  compactQueue: false,
};
