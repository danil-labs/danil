import { listen } from "../../../../../apps/desktop/src/lib/serviceEvents";
import { createSignal, onCleanup, onMount, Show } from "solid-js";
import { copyText } from "../../../../host/src/clipboard";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { readDrawioAsset, listIntegrations, openExternal } from "../queries";
import { Button } from "../../../../ui/src/Button";
import { asFailure, type Failure, FailureNote } from "../../../../ui/src/Failure";
import { MermaidDiagram } from "../../../../ui/src/Mermaid";
import { type DrawioAsset, type DrawioSource, drawioAssets, drawioCompressed, drawioExpandedXml, drawioEditUrl, drawioMermaid, drawioScene, drawioXml } from "../model/drawio";
import type { McpAppCall } from "../model/transcript";

/** Un archivo del visor que instala el plugin `drawio`: `environment/drawio.rs`. */
function asset(path: string): Promise<string> {
  return readDrawioAsset(path);
}

async function pluginActivo(): Promise<boolean> {
  const catalog = await listIntegrations();
  return catalog.plugins.some((plugin) => plugin.id === "drawio" && plugin.enabled);
}

async function sourcesFor(xml: string): Promise<DrawioSource[]> {
  const catalog: DrawioAsset[] = JSON.parse(await asset("catalog.json"));
  const loaded = new Set<string>();
  const sources: DrawioSource[] = [];
  async function loadReferences(text: string): Promise<void> {
    for (const entry of drawioAssets(text, catalog)) {
      if (loaded.has(entry.path)) continue;
      loaded.add(entry.path);
      const source = await asset(entry.path);
      sources.push({ kind: entry.kind, source });
      await loadReferences(source);
    }
  }
  await loadReferences(xml);
  return sources;
}

export default function DrawioMcpCanvas(props: { call: McpAppCall }) {
  let frame: HTMLIFrameElement | undefined;
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const [compressedUnavailable, setCompressedUnavailable] = createSignal(false);
  const [missing, setMissing] = createSignal(false);
  const [ready, setReady] = createSignal(false);
  const [failure, setFailure] = createSignal<Failure | null>(null);
  const [expanded, setExpanded] = createSignal(false);
  const xml = drawioXml(props.call.arguments);
  const compressed = xml ? drawioCompressed(xml) : false;
  const mermaid = xml ? null : drawioMermaid(props.call.arguments);

  function onMessage(event: MessageEvent) {
    if (event.source !== frame?.contentWindow) return;
    const data = event.data as { terminusDrawio?: string; detail?: string } | null;
    if (!data?.terminusDrawio) return;
    if (timer) clearTimeout(timer);
    if (data.terminusDrawio === "ok") setReady(true);
    if (data.terminusDrawio === "error") {
      setFailure({ what: t("chat.mcp_app.drawio_failed"), detail: data.detail ?? "" });
    }
  }

  async function pintar() {
    if (!xml || ready()) return;
    setFailure(null);
    try {
      if (!(await pluginActivo())) {
        if (!disposed) setMissing(true);
        return;
      }
      if (disposed) return;
      setMissing(false);
      let renderedXml = xml;
      if (compressed) {
        try {
          renderedXml = await drawioExpandedXml(xml);
        } catch {
          if (!disposed) setCompressedUnavailable(true);
          return;
        }
      }
      // El iframe es opaco: si el visor no llega a arrancar, no hay error que
      // escuchar. Sin este plazo la fila se queda en «Abriendo vista…» para siempre.
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (!ready() && !failure()) setFailure({ what: t("chat.mcp_app.drawio_failed"), detail: "" });
      }, 15000);
      const [viewer, sources] = await Promise.all([asset("viewer-static.min.js"), sourcesFor(renderedXml)]);
      const scene = drawioScene(viewer, renderedXml, sources);
      if (disposed || !frame) return;
      frame.srcdoc = scene;
    } catch (error) {
      if (timer) clearTimeout(timer);
      if (!disposed) setFailure(asFailure(error));
    }
  }

  // Activar el plugin desde Configuración pinta la vista que lo estaba esperando.
  const cambios = listen("integrations-changed", () => {
    if (missing()) void pintar();
  });

  onMount(() => {
    window.addEventListener("message", onMessage);
    void pintar();
  });

  onCleanup(() => {
    disposed = true;
    if (timer) clearTimeout(timer);
    window.removeEventListener("message", onMessage);
    void cambios.then((unlisten) => unlisten());
  });

  function instalar() {
    window.dispatchEvent(new CustomEvent("harness:open-settings", { detail: "plugins" }));
  }

  async function copiar() {
    if (!xml) return;
    await copyText(xml).catch((e) => setFailure(asFailure(e)));
  }

  async function abrir() {
    if (!xml) return;
    await openExternal(drawioEditUrl(xml)).catch((e) => setFailure(asFailure(e)));
  }

  return (
    <div class="min-w-0">
      <Show when={!xml && !mermaid && !failure()}>
        <p class="m-0 text-xs text-neutral-500">{t("chat.mcp_app.drawio_empty")}</p>
      </Show>
      <Show when={failure()}>{(value) => <FailureNote f={value()} />}</Show>
      <Show when={xml}>
        <div class="mb-2 flex items-center justify-end gap-2">
          <Button type="button" variant="outline" size="compact" onClick={() => void copiar()}>
            {t("chat.mcp_app.drawio_copy")}
          </Button>
          <Button type="button" variant="outline" size="compact" onClick={() => void abrir()}>
            {t("chat.mcp_app.drawio_open")}
          </Button>
          <Button type="button" variant="outline" size="compact" onClick={() => setExpanded(!expanded())}>
            {expanded() ? t("chat.mcp_app.collapse") : t("chat.mcp_app.expand")}
          </Button>
        </div>
      </Show>
      <Show when={compressedUnavailable()}>
        <p class="m-0 text-xs text-neutral-500">{t("chat.mcp_app.drawio_compressed")}</p>
      </Show>
      <Show when={missing()}>
        <div class="mb-2 flex flex-wrap items-center gap-2">
          <p class="m-0 text-xs text-neutral-500">{t("chat.mcp_app.drawio_missing")}</p>
          <Button type="button" variant="outline" size="compact" onClick={instalar}>
            {t("chat.mcp_app.drawio_install")}
          </Button>
        </div>
      </Show>
      <Show when={xml && !missing() && !compressedUnavailable() && !ready() && !failure()}>
        <p class="m-0 text-xs text-neutral-500">{t("chat.mcp_app.loading")}</p>
      </Show>
      <Show when={mermaid}>{(value) => <MermaidDiagram definition={value()} />}</Show>
      <Show when={xml && !missing() && !compressedUnavailable()}>
        <iframe
          ref={frame}
          title={t("chat.mcp_app.title", { name: "draw.io" })}
          class="w-full rounded-md border border-border bg-surface"
          sandbox="allow-scripts"
          style={{ height: expanded() ? "70vh" : "28rem" }}
        />
      </Show>
    </div>
  );
}
