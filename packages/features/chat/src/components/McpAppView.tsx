import type { AppBridge } from "@modelcontextprotocol/ext-apps/app-bridge";
import AppWindow from "lucide-solid/icons/app-window";
import { createSignal, onCleanup, onMount, Show } from "solid-js";
import { t } from "../../../../ui/src/lib/i18n";
import {
  hasMcpApp,
  readMcpApp,
  closeMcpApp,
  callMcpAppTool,
  readMcpAppResource,
  type AppView,
} from "../queries";
import { asFailure, type Failure, FailureNote } from "../../../../ui/src/Failure";
import DrawioMcpCanvas from "./DrawioMcpCanvas";
import ExcalidrawMcpCanvas from "./ExcalidrawMcpCanvas";
import { PROXY } from "../model/mcpAppProxy";
import type { McpAppCall } from "../model/transcript";
import { Pressable } from "../../../../ui/src/Pressable";

/** Excalidraw guarda su dibujo en el checkpoint del servidor: su vista sigue viva. */
function esExcalidraw(v: AppView, tool: string) {
  return v.resource_uri === "ui://excalidraw/mcp-app.html" && tool === "create_view";
}

/** draw.io pinta el XML de la llamada: no vuelve a hablar con el servidor. */
function esDrawio(v: AppView) {
  return v.resource_uri === "ui://drawio/mcp-app.html";
}

export default function McpAppView(props: { call: McpAppCall }) {
  let frame: HTMLIFrameElement | undefined;
  let bridge: AppBridge | undefined;
  let disposed = false;
  let starting = false;
  const [view, setView] = createSignal<AppView | null>(null);
  const [failure, setFailure] = createSignal<Failure | null>(null);
  const [noView, setNoView] = createSignal(true);
  const [loading, setLoading] = createSignal(false);

  onMount(() => void discover());

  async function discover() {
    setNoView(true);
    try {
      const supported = await hasMcpApp(props.call.server, props.call.tool);
      if (!disposed && supported) await open();
    } catch {
      // Sin metadatos de UI no hay una vista que abrir ni un error de vista.
    }
  }

  onCleanup(() => {
    disposed = true;
    void bridge?.close();
    const v = view();
    if (v && !esExcalidraw(v, props.call.tool) && !esDrawio(v))
      void closeMcpApp(v.connection_id);
  });

  async function open() {
    if (loading() || view()) return;
    setLoading(true);
    setFailure(null);
    setNoView(false);
    try {
      const resource = await readMcpApp(props.call.server, props.call.tool);
      if (!resource) {
        setNoView(true);
        return;
      }
      if (disposed) {
        void closeMcpApp(resource.connection_id);
        return;
      }
      setView(resource);
      if (esDrawio(resource)) void closeMcpApp(resource.connection_id);
    } catch (error) {
      setFailure(asFailure(error));
    } finally {
      setLoading(false);
    }
  }

  async function mounted() {
    if (starting || bridge || !frame?.contentWindow || !view()) return;
    starting = true;
    try {
      const { AppBridge, PostMessageTransport } = await import("@modelcontextprotocol/ext-apps/app-bridge");
      if (disposed || !frame?.contentWindow || !view()) return;
      const resource = view()!;
      const current = new AppBridge(null, { name: "Danil", version: "0.2.6" }, { serverTools: {} }, {
        hostContext: {
          toolInfo: { tool: resource.tool },
          theme: document.documentElement.dataset.theme === "dark" ? "dark" : "light",
        },
      });
      bridge = current;
      current.onsandboxready = () => {
        void current.sendSandboxResourceReady({ html: resource.html, sandbox: "allow-scripts" });
      };
      current.oncalltool = async ({ name, arguments: args }) =>
        await callMcpAppTool(resource.connection_id, name, args ?? {});
      current.onreadresource = async ({ uri }) => {
        if (uri === resource.resource_uri) return { contents: [{ uri, mimeType: "text/html;profile=mcp-app", text: resource.html }] };
        return await readMcpAppResource(resource.connection_id, uri);
      };
      current.oninitialized = () => {
        void (async () => {
          await current.sendToolInput({ arguments: props.call.arguments ?? {} });
          await current.sendToolResult((props.call.result ?? { content: [] }) as Parameters<typeof current.sendToolResult>[0]);
        })().catch((error) => setFailure(asFailure(error)));
      };
      await current.connect(new PostMessageTransport(frame.contentWindow, frame.contentWindow));
      frame.contentWindow.postMessage("__terminus_start", "*");
    } catch (error) {
      if (!disposed) setFailure(asFailure(error));
    } finally {
      starting = false;
    }
  }

  return (
    <Show when={!noView()}>
      <div class="mb-3 min-w-0">
        {/* Qué app es, antes de la app: la guía de apps de OpenAI pone ahí su nombre e ícono. */}
        <p class="m-0 mb-1.5 flex min-w-0 items-center gap-1.5 text-xs font-medium text-neutral-500">
          <AppWindow size={14} class="shrink-0 text-neutral-500" aria-hidden="true" />
          <span class="truncate">{view()?.title || props.call.server}</span>
        </p>
        <Show when={!view()}>
          <Show
            when={!loading() && !noView()}
            fallback={<Show when={loading()}><p class="m-0 text-xs text-neutral-500">{t("chat.mcp_app.loading")}</p></Show>}
          >
            <Pressable class="text-xs text-primary underline" onClick={() => void open()}>
              {t("chat.mcp_app.open")}
            </Pressable>
          </Show>
        </Show>
        <Show when={failure()}>{(f) => <FailureNote f={f()} />}</Show>
        <Show when={view() && esExcalidraw(view()!, props.call.tool)}>
          <ExcalidrawMcpCanvas call={props.call} connectionId={view()!.connection_id} />
        </Show>
        <Show when={view() && esDrawio(view()!)}>
          <DrawioMcpCanvas call={props.call} />
        </Show>
        <Show when={view() && !esExcalidraw(view()!, props.call.tool) && !esDrawio(view()!)}>
          <iframe
            ref={frame}
            title={t("chat.mcp_app.title", { name: view()?.title || props.call.tool })}
            class="h-80 w-full rounded-md border border-border bg-surface"
            sandbox="allow-scripts"
            srcdoc={PROXY}
            onLoad={() => void mounted()}
          />
        </Show>
      </div>
    </Show>
  );
}
