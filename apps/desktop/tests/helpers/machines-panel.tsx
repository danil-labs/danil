/**
 * El panel «Máquinas» sin motor, con la fixture de vm-alberto
 * (`fixtures/machine-usage.ts`). Con `pnpm dev`, abre
 * `/tests/helpers/machines-panel.html?mode=high&theme=dark&open=vm-alberto`:
 * `mode` es normal, high o critical; `open`, la tarjeta que se despliega.
 */
import "../../src/locales/catalogs";
import { render } from "solid-js/web";
import Almacenamiento from "../../../../packages/shell/src/shell/Storage";
import { setMachineRoute } from "../../../../packages/engine-client/src/client";
import { refetchMachines } from "../../../../packages/features/machines/src/queries/store";
import { type Mode, WORKSPACE, resources, route } from "./fixtures/machine-usage";
import "../../../../packages/ui/src/styles/global.css";

const params = new URLSearchParams(location.search);
const mode = (params.get("mode") ?? "high") as Mode;
document.documentElement.dataset.theme = params.get("theme") === "dark" ? "dark" : "light";
setMachineRoute(route(mode) as never);
void refetchMachines();

const titles = Object.fromEntries((resources(mode).local.tasks ?? []).map((x) => [x.session, { title: x.title ?? x.session, project: x.project }]));

render(() => (
  <div class="flex h-[1400px] items-end bg-surface-raised p-2">
    <nav class="flex h-full w-12 flex-col items-center gap-1.5 rounded-[10px] py-2" aria-label="Columna de organizaciones">
      <div class="grid size-8 place-items-center rounded-lg bg-primary text-sm font-bold text-neutral-950">D</div>
      <div class="flex-1" />
      <Almacenamiento vertical workspace={WORKSPACE} trabajando={["s-machines"]} conPestana={[]} onAbrirTarea={() => {}}
        lookup={(session) => titles[session]} />
    </nav>
  </div>
), document.getElementById("root")!);
