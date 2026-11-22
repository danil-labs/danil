import { createSignal, onCleanup, onMount, Show } from "solid-js";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { callMcpAppTool, closeMcpApp } from "../queries";
import { Button } from "../../../../ui/src/Button";
import { asFailure, type Failure, FailureNote } from "../../../../ui/src/Failure";
import type { McpAppCall } from "../model/transcript";

type ToolResult = {
  content?: { type: string; text?: string }[];
  structuredContent?: { checkpointId?: string };
  isError?: boolean;
};

function checkpointId(result: McpAppCall["result"]): string | null {
  const value = result as ToolResult | null | undefined;
  if (value?.structuredContent?.checkpointId) return value.structuredContent.checkpointId;
  const text = value?.content?.find((part) => part.type === "text")?.text;
  const said = text?.match(/Checkpoint id: "([^"]+)"/)?.[1];
  if (said) return said;
  // Claude Code guarda `structuredContent` como el texto del resultado:
  // `{"checkpointId":"…"}`, sin la frase ni el campo aparte.
  try {
    const parsed: unknown = text ? JSON.parse(text) : null;
    if (parsed && typeof parsed === "object" && "checkpointId" in parsed && typeof parsed.checkpointId === "string")
      return parsed.checkpointId;
  } catch {
    // Texto libre sin id.
  }
  return null;
}

function sceneFrom(result: ToolResult): { elements: unknown[]; appState?: unknown; files?: unknown } {
  if (result.isError) throw new Error(result.content?.[0]?.text ?? "MCP");
  const text = result.content?.find((part) => part.type === "text")?.text;
  const value: unknown = text ? JSON.parse(text) : null;
  if (!value || typeof value !== "object" || !("elements" in value) || !Array.isArray(value.elements)) {
    throw new Error(t("chat.mcp_app.invalid_scene"));
  }
  // `cameraUpdate` es una orden del servidor para su propia vista, no un
  // elemento: Excalidraw no la conoce.
  const scene = value as { elements: unknown[]; appState?: unknown; files?: unknown };
  return {
    ...scene,
    elements: scene.elements.filter(
      (element) => !(element && typeof element === "object" && "type" in element && element.type === "cameraUpdate"),
    ),
  };
}

export default function ExcalidrawMcpCanvas(props: { call: McpAppCall; connectionId: string }) {
  let node: HTMLDivElement | undefined;
  let dispose: (() => void) | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: string | undefined;
  let saving = Promise.resolve();
  let closed = false;
  const [failure, setFailure] = createSignal<Failure | null>(null);
  const [expanded, setExpanded] = createSignal(false);
  const [ready, setReady] = createSignal(false);
  const [saveState, setSaveState] = createSignal<"saved" | "saving" | "unsaved">("saved");
  const id = checkpointId(props.call.result);

  function flush() {
    if (!pending || !id) return saving;
    if (!closed) setFailure(null);
    const data = pending;
    pending = undefined;
    if (!closed) setSaveState("saving");
    saving = saving.then(async () => {
      const result = await callMcpAppTool<ToolResult>(
        props.connectionId,
        "save_checkpoint",
        { id, data },
      );
      if (result.isError) throw new Error(result.content?.[0]?.text ?? "MCP");
      if (!closed && !pending) setSaveState("saved");
    }).catch((error) => {
      pending ??= data;
      if (!closed) {
        setSaveState("unsaved");
        setFailure(asFailure(error));
      }
    });
    return saving;
  }

  onMount(() => {
    void (async () => {
      if (!id) throw new Error(t("chat.mcp_app.missing_checkpoint"));
      const result = await callMcpAppTool<ToolResult>(
        props.connectionId,
        "read_checkpoint",
        { id },
      );
      const scene = sceneFrom(result);
      if (closed || !node) return;
      (window as Window & { EXCALIDRAW_ASSET_PATH?: string }).EXCALIDRAW_ASSET_PATH =
        new URL(`${import.meta.env.BASE_URL}excalidraw/`, window.location.href).href;
      const { mountExcalidraw } = await import("../model/excalidrawReact");
      if (closed || !node) return;
      dispose = mountExcalidraw(node, scene, (next) => {
        pending = next;
        setSaveState("unsaved");
        setFailure(null);
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => void flush(), 900);
      });
      setReady(true);
    })().catch((error) => {
      if (!closed) setFailure(asFailure(error));
    });
  });

  onCleanup(() => {
    closed = true;
    if (timer) clearTimeout(timer);
    dispose?.();
    void flush().finally(() => closeMcpApp(props.connectionId));
  });

  return (
    <div class="min-w-0">
      <Show when={!ready() && !failure()}>
        <p class="m-0 text-xs text-neutral-500">{t("chat.mcp_app.loading")}</p>
      </Show>
      <Show when={failure()}>{(value) => <FailureNote f={value()} />}</Show>
      <Show when={ready() && pending && failure()}>
        <Button type="button" variant="outline" size="compact" onClick={() => void flush()}>
          {t("chat.mcp_app.retry_save")}
        </Button>
      </Show>
      <Show when={ready()}>
        <div class="mb-2 flex items-center justify-end gap-2">
          <span class="text-xs text-neutral-500">{
            saveState() === "saved" ? t("chat.mcp_app.save_saved")
              : saveState() === "saving" ? t("chat.mcp_app.save_saving")
                : t("chat.mcp_app.save_unsaved")
          }</span>
          <Button type="button" variant="outline" size="compact" onClick={() => setExpanded(!expanded())}>
            {expanded() ? t("chat.mcp_app.collapse") : t("chat.mcp_app.expand")}
          </Button>
        </div>
      </Show>
      <div
        ref={node}
        class="w-full overflow-hidden rounded-md border border-border bg-surface"
        style={{ height: expanded() ? "70vh" : "28rem", display: ready() ? "block" : "none" }}
      />
    </div>
  );
}
