import type { MaquinasDeAjustes } from "../model/machines-port";
import type { PiezasDeAjustes } from "../model/features-port";
import { createEffect, createMemo, createSignal, For, Match, Show, Switch } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import { FREE_ROUTER_OPENCODE } from "../../../../ui/src/lib/tasks/index.ts";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { Button } from "../../../../ui/src/Button";
import { FailureNote } from "../../../../ui/src/Failure";
import { Skeleton } from "../../../../ui/src/Skeleton";
import { aiProvidersView, type SurfacesState } from "../model/ai-providers-view";
import { grupos, idsDeProveedor, opcionesDeAlta, routers, visible, visibles, type EstadoDeProveedor } from "../model/ai-providers-groups";
import { rotuloDeSuperficie, type Superficie } from "../../../../ui/src/lib/surfaces";
import { prosa } from "../../../../ui/src/lib/prose";
import { Badge } from "../../../../ui/src/Badge";
import { rotuloDeMarca } from "../../../../ui/src/lib/surfaceMarks";
import Accounts from "./Accounts";
import AddAccountPicker from "./AddAccountPicker";
import DanilBlock from "./DanilBlock";
import { SettingsPanel, SettingsSection } from "../../../../ui/src/SettingsLayout";

/**
 * Proveedores de IA: el bloque Danil, un solo «Agregar cuenta» y un grupo por
 * proveedor. Cada `Accounts` es dueño de su lista y avisa su estado; aquí solo
 * se decide qué grupo se ve (`ai-providers-groups.ts`). **Todos quedan
 * montados** y los que no se ven llevan `hidden`: desmontar uno cortaría un
 * login en curso. `For` sobre ids de proveedor (cadenas) une cada `Accounts` a
 * su proveedor aunque `list_surfaces` traiga objetos nuevos o cambie el orden.
 */
export default function AIProviders(props: { superficies: Superficie[]; estado?: SurfacesState; onRetry?: () => void; maquinas: MaquinasDeAjustes; piezas: PiezasDeAjustes }) {
  const vista = () => aiProvidersView(props.estado ?? { k: "ready" }, props.superficies.length);
  const [estados, setEstados] = createStore<Record<string, EstadoDeProveedor | undefined>>({});
  // Elegido en el selector y todavía sin estado que lo sostenga (descarga externa): se ve igual.
  const [pedidos, setPedidos] = createSignal<ReadonlySet<string>>(new Set());
  const controles = new Map<string, { agregar: () => void }>();
  let disparador: HTMLButtonElement | undefined;
  let focoEn: string | null = null; // El grupo donde estaba el foco; Kobalte lo mueve al cerrar de Configuración si su botón desaparece.
  const sinLista = () => vista() === "loading" || vista() === "failed";
  const ids = createMemo(() => (sinLista() ? [] : idsDeProveedor(props.superficies)));
  const porId = createMemo(() => new Map(grupos(props.superficies).map((g) => [g[0].provider, g])));
  const aLaVista = createMemo(() => visibles(props.superficies, estados));
  const seVe = (id: string) => pedidos().has(id) || aLaVista().ids.includes(id);
  const nombre = (id: string) => {
    const g = porId().get(id);
    return !g ? t(`settings.ai_providers.agent_${id}`) : g.length > 1 ? g[0].label : rotuloDeSuperficie(g[0]);
  };
  const sinPedido = (id: string) => setPedidos((p) => (p.has(id) ? new Set([...p].filter((x) => x !== id)) : p));
  const avisar = (id: string, e: EstadoDeProveedor) => {
    setEstados(id, reconcile(e));
    if (visible(e)) sinPedido(id);
  };
  function elegir(id: string) {
    setPedidos((p) => new Set(p).add(id));
    controles.get(id)?.agregar();
  }

  // Un grupo que se va con el foco dentro (quitar la última cuenta) lo devuelve a «Agregar cuenta».
  let antes = new Set<string>();
  createEffect(() => {
    const ahora = new Set(ids().filter(seVe));
    for (const id of antes) if (!ahora.has(id) && focoEn === id) disparador?.focus();
    antes = ahora;
  });

  return (
    <SettingsPanel>
      <DanilBlock routers={routers(props.superficies, FREE_ROUTER_OPENCODE)} maquinas={props.maquinas} piezas={props.piezas} />
      <SettingsSection
        title={t("settings.ai_providers.accounts")}
        aside={<AddAccountPicker opciones={sinLista() ? [] : opcionesDeAlta(props.superficies, estados)} nombre={nombre} onElegir={elegir} disabled={ids().length === 0} disparador={(el) => (disparador = el)} />}
        description={ids().length === 0 ? t("settings.ai_providers.add_unavailable") : undefined}
      >
        <div class="grid gap-6">
          <Switch>
            <Match when={vista() === "loading"}>
              <div class="grid gap-3" data-ai-providers="loading">
                <p role="status" class="m-0 text-ui text-neutral-500">{t("settings.ai_providers.loading")}</p>
                <Skeleton filas={3} class="h-12" />
              </div>
            </Match>
            <Match when={vista() === "failed" && props.estado?.k === "failed" ? props.estado.f : null}>
              {(f) => (
                <div class="grid gap-2" data-ai-providers="failed">
                  <FailureNote f={f()} />
                  <Show when={props.onRetry}>
                    {(retry) => <Button size="sm" variant="secondary" class="justify-self-start" onClick={() => retry()()}>{t("settings.ai_providers.retry")}</Button>}
                  </Show>
                </div>
              )}
            </Match>
            <Match when={vista() === "supported"}>
              <p role="status" class="m-0 text-ui text-neutral-500" data-ai-providers="supported">{t("settings.ai_providers.none_installed")}</p>
            </Match>
          </Switch>
          <Show when={aLaVista().vacio === "sin-cuentas" && pedidos().size === 0}>
            <p class="m-0 text-ui text-neutral-500" data-no-accounts="">{t("settings.ai_providers.no_accounts")}</p>
          </Show>
          <Show when={ids().length > 0 && aLaVista().vacio === "cargando" && pedidos().size === 0}>
            <Skeleton filas={2} class="h-12" />
          </Show>
          <For each={ids()}>
            {(id) => (
              <div onFocusIn={() => (focoEn = id)} onFocusOut={(e) => e.relatedTarget && (focoEn = null)} class={seVe(id) ? "grid min-w-0" : "hidden"} data-provider-slot={id}>
                <Accounts agente={id} titulo={nombre(id)} marca={<Show when={porId().get(id)?.[0]}>{(s) => <Marca superficie={s()} />}</Show>} sinAgregar onEstado={(e) => avisar(id, e)} onControl={(c) => controles.set(id, c)} maquinas={props.maquinas}>
                  <For each={porId().get(id)?.slice(1).map((s) => s.id) ?? []}>
                    {(sid) => <Show when={porId().get(id)?.find((s) => s.id === sid)}>{(s) => <Accounts agente={s().provider} nombre={rotuloDeSuperficie(s())} marca={<Marca superficie={s()} />} sinAgregar maquinas={props.maquinas} />}</Show>}
                  </For>
                </Accounts>
              </div>
            )}
          </For>
        </div>
      </SettingsSection>
    </SettingsPanel>
  );
}

function Marca(props: { superficie: Superficie }) {
  return (
    <Show when={props.superficie.marca}>
      {(marca) => <Badge forma="dato" class="shrink-0" title={((p) => (p ? prosa(p) : undefined))(props.superficie.porque)}>{rotuloDeMarca(marca())}</Badge>}
    </Show>
  );
}
