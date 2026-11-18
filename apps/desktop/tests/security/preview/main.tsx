import { createSignal, Show } from "solid-js";
import { render } from "solid-js/web";
import { edgeTransport, previewClient } from "@terminus/computers";
import Site from "../../../src/features/sites";
import { Markdown } from "../../../src/ui/Markdown";
import { setCapabilities } from "../../../src/lib/platform";
import { aplicarLengua } from "../../../src/lib/i18n";
import { WEB_PREVIEW_DOMAIN } from "../../../src/web/preview-config";
import "../../../src/locales/catalogs";
import "../../../src/styles/global.css";

const fixture = await fetch("/__lab/config").then(response => response.json());
setCapabilities({ nativeWindow: false, updater: false, localSetup: false, computerStatus: true,
  machinePreview: previewClient(edgeTransport({ origin: location.origin, timeoutMs: 15_000 }), WEB_PREVIEW_DOMAIN, { workspace: fixture.platformWorkspace }),
});
aplicarLengua();
render(() => {
  const [url, setUrl] = createSignal("");
  window.addEventListener("harness:abrir-sitio", event => setUrl((event as CustomEvent<string>).detail));
  return <main class="flex h-screen flex-col bg-surface text-neutral-950">
    <div class="flex gap-4 border-b border-border p-4"><Markdown>{`[Servidor](http://localhost:${fixture.port}/)`}</Markdown><button type="button" onClick={() => setUrl("")}>Cerrar vista</button></div>
    <div class="min-h-0 flex-1"><Show when={url()}><Site url={url()} visible context={{ machine: fixture.machine, workspace: fixture.workspace, session: "task_1" }} /></Show></div>
  </main>;
}, document.getElementById("root")!);
