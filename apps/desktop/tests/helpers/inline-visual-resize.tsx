import { createSignal, onMount } from "solid-js";
import { render } from "solid-js/web";
import ChatVisual from "../../../../packages/features/chat/src/components/ChatVisual";
import { createVisualBudget } from "../../../../packages/features/chat/src/model/visualBudget";
import { seguirElFondo } from "../../../../packages/features/chat/src/model/paste";
import metrics from "./fixtures/inline-visual-metrics.html?raw";
import "../../../../packages/ui/src/styles/global.css";

const samples: { height: number; scroll: number }[] = [];
let reads = 0;
const fixture = new URLSearchParams(location.search).get("fixture");
const html = fixture ? await fetch(fixture).then((response) => response.text()) : metrics;

function Probe() {
  const [running, setRunning] = createSignal(false);
  const [tail, setTail] = createSignal("Mensaje posterior. ".repeat(100));
  const sticky = seguirElFondo(running);
  const budget = createVisualBudget();
  onMount(() => {
    Object.assign(window, { probe: { sticky, setRunning, setTail, samples, reads: () => reads } });
  });
  return <div id="scroller" ref={sticky.contenedor} class="mx-auto overflow-auto [overflow-anchor:none] text-sm" style="height:600px;width:680px">
    <div ref={sticky.contenido} class="grid grid-cols-[minmax(0,1fr)] gap-y-4 px-[52px]">
      <p style="height:800px">Mensaje anterior</p>
      <article>
        <p>Métricas</p>
        <ChatVisual visual={{ kind: "visual", id: "metrics", file: "metrics.html", title: "Métricas" }}
          owner="resize-test" budget={budget} read={async () => { reads++; return html; }} />
      </article>
      <p id="tail">{tail()}</p>
      <div style="height:26px" />
    </div>
  </div>;
}
window.addEventListener("message", (event) => {
  if (event.data?.type === "terminus:visual-height") {
    samples.push({ height: event.data.height, scroll: document.querySelector("#scroller")!.scrollTop });
  }
});
render(Probe, document.getElementById("root")!);
