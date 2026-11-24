import { createMemo, createResource, createSignal, For, type JSX, onCleanup, onMount, Show } from "solid-js";
import { Dynamic } from "solid-js/web";
import { lockedBy } from "../../../../../apps/desktop/src/lib/governance";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { displayWorkspaceContext } from "../../../../../apps/desktop/src/lib/workspace-context";
import { capabilities } from "../../../../host/src/platform";
import { flechaDeLista } from "../../../../ui/src/lib/shortcuts";
import { cn } from "../../../../ui/src/lib/utils";
import { Badge } from "../../../../ui/src/Badge";
import { Button } from "../../../../ui/src/Button";
import { Dialog, DialogContent, DialogTitle } from "../../../../ui/src/Dialog";
import { Close } from "../../../../ui/src/icons";
import type { ModelChoices } from "../../../../ui/src/lib/model-choices";
import { Pressable } from "../../../../ui/src/Pressable";
import { Select } from "../../../../ui/src/Select";
import { Sidebar, SidebarContent, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "../../../../ui/src/sidebar";
import { SettingsWorkspaceSelector } from "../components/SettingsWorkspaceSelector";
import type { PiezasDeAjustes } from "../model/features-port";
import type { MaquinasDeAjustes } from "../model/machines-port";
import type { SesionesDeAjustes } from "../model/sessions-port";
import { type SettingsEntryId, settingsTarget } from "../model/settings-entries";
import {
  governedSectionFor,
  resolveSettingsWorkspaces,
  settingsScopeBadge,
  type SettingsWorkspaceOption,
} from "../model/settings-workspaces";
import { createWorkspaces } from "../queries/workspaces-store";
import { createSuperficiesDeAjustes } from "./SettingsSurfaces";
import { AdminLink, type Entrada, idSub, idTab, type Pestana, SIN_PESTANA } from "./SettingsTabs";

export default function Settings(props: {
  workspace?: string | null;
  onClose: () => void;
  /** Con qué entrada o pestaña abrir: un id de `settings-entries.ts`, viejo o nuevo. */
  panel?: string;
  /** Con qué se crea un agente desde Agentes: lo mismo que ofrece el riel. */
  modelos: ModelChoices;
  /** La carpeta abierta, donde nace por omisión un agente nuevo. */
  proyecto?: string;
  /** Los agentes de las tareas abiertas. */
  agentesEnUso?: string[];
  /** Abre el perfil de un agente en esa carpeta; quien llama cierra la hoja. */
  onAgentProfile?: (project: string, name: string) => void;
  integraciones?: (p: { solo: string[]; onCambio: () => void }) => JSX.Element;
  /** Lo de máquinas que usan las pestañas: lo enchufa el shell. */
  maquinas: MaquinasDeAjustes;
  /** Lo de projects y chat que pintan las pestañas: lo enchufa el shell. */
  piezas: PiezasDeAjustes;
  /** Lo del riel de sesiones y de cuentas que leen las pestañas: lo enchufa el shell. */
  sesiones: SesionesDeAjustes;
}) {
  const ws = createWorkspaces();
  const webAccounts = capabilities().webAccounts;
  const activeWorkspaceId = () => props.workspace ?? ws.activo() ?? null;
  const activeContext = () =>
    props.workspace !== undefined ? displayWorkspaceContext() : ws.activoContexto();
  const subpanelKey = createMemo(() => JSON.stringify([activeWorkspaceId(), activeContext()]));

  const workspaceSelection = createMemo(() =>
    resolveSettingsWorkspaces({
      activeId: activeWorkspaceId(),
      activeContext: activeContext(),
      engineWorkspaces: ws.lista() ?? [],
      groups: props.sesiones.sessionRailState()?.groups(),
      otherAccounts: webAccounts?.others(),
    }),
  );

  const [desktopSelectorOpen, setDesktopSelectorOpen] = createSignal(false);
  const [mobileSelectorOpen, setMobileSelectorOpen] = createSignal(false);

  function selectWorkspace(option: SettingsWorkspaceOption) {
    if (option.otherAccount) {
      if (option.otherAccount.signedIn) webAccounts?.open(option.id);
      else webAccounts?.add?.(option.otherAccount.email);
      return;
    }
    void ws.cambiarA(option.id, option.context ?? undefined);
  }

  const { ENTRADAS } = createSuperficiesDeAjustes(props);
  const [personal] = createResource(
    subpanelKey,
    async () => (await capabilities().personalAccount?.isPersonal().catch(() => false)) ?? false,
  );
  const dePersonal = (p: Pestana) => p.id === "support" || (p.id === "plan" && !capabilities().nativeWindow);
  const pestanaVisible = (p: Pestana) => (!dePersonal(p) || personal() === true);
  const pedido = settingsTarget(props.panel);
  const inicial = ENTRADAS.find((e) => e.id === pedido?.entry) ?? ENTRADAS[0];
  const [activo, setActivo] = createSignal<SettingsEntryId>(inicial.id);
  // La pestaña elegida en cada entrada: volver a una entrada la deja como estaba.
  const [subs, setSubs] = createSignal<Partial<Record<SettingsEntryId, string>>>(
    pedido?.tab && inicial.id === pedido.entry && inicial.tabs.some((p) => p.id === pedido.tab && p.panel) ? { [inicial.id]: pedido.tab } : {},
  );
  let hoja: HTMLDivElement | undefined;
  // El foco viaja con las flechas sin arrastrar la selección.
  const [foco, setFoco] = createSignal<SettingsEntryId>(inicial.id);
  onMount(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // Si el selector de workspace está desplegado, Esc solo lo cierra a él.
        if (desktopSelectorOpen() || mobileSelectorOpen()) {
          e.preventDefault();
          e.stopPropagation();
          setDesktopSelectorOpen(false);
          setMobileSelectorOpen(false);
          return;
        }
        // Un campo marcado cancela lo suyo con Esc y se queda con la tecla:
        // esta escucha va en captura y de otro modo llega antes que él.
        if ((e.target as Element | null)?.closest?.("[data-owns-escape]")) return;
        // Un diálogo abierto encima, como «Añadir un proyecto», cierra él solo.
        const otro = (e.target as Element | null)?.closest?.("[role=dialog]");
        if (otro && otro !== hoja) return;
        // La superficie está encima de todo: se queda con el Esc y no deja que
        // llegue a cerrar la columna de artefactos que hay detrás.
        e.stopPropagation();
        props.onClose();
      }
    };
    window.addEventListener("keydown", alTeclear, true);
    onCleanup(() => window.removeEventListener("keydown", alTeclear, true));
  });
  // Con la hoja ya abierta, `panel` no vuelve a leerse: un enlace interno cambia de destino por aquí.
  onMount(() => {
    const alPedir = (e: Event) => {
      const id = (e as CustomEvent<unknown>).detail;
      const target = settingsTarget(typeof id === "string" ? id : undefined);
      const d = ENTRADAS.find((x) => x.id === target?.entry);
      if (!d) return;
      if (target?.tab) setSubs((s) => ({ ...s, [d.id]: target.tab! }));
      abrir(d);
    };
    window.addEventListener("harness:open-settings", alPedir);
    onCleanup(() => window.removeEventListener("harness:open-settings", alPedir));
  });

  function mover(paso: number | "inicio" | "fin") {
    const i = ENTRADAS.findIndex((d) => d.id === foco());
    const j =
      paso === "inicio"
        ? 0
        : paso === "fin"
          ? ENTRADAS.length - 1
          : (i + paso + ENTRADAS.length) % ENTRADAS.length;
    const id = ENTRADAS[j].id;
    setFoco(id);
    document.getElementById(idTab(id))?.focus();
  }

  function teclas(e: KeyboardEvent) {
    const pasos: Record<string, number | "inicio" | "fin"> = {
      ArrowDown: 1,
      ArrowUp: -1,
      Home: "inicio",
      End: "fin",
    };
    const paso = pasos[e.key];
    if (paso === undefined) return;
    e.preventDefault();
    mover(paso);
  }

  function abrir(d: Entrada) {
    setFoco(d.id);
    // WebKit no le da el foco a un botón al pulsarlo, así que sin esto el
    // primer clic deja las flechas sin punto de partida.
    document.getElementById(idTab(d.id))?.focus({ focusVisible: false } as FocusOptions);
    setActivo(d.id);
  }

  const entrada = () => ENTRADAS.find((d) => d.id === activo()) ?? ENTRADAS[0];
  const pestana = () => {
    const e = entrada();
    return e.tabs.find((p) => p.id === subs()[e.id] && p.panel && (!dePersonal(p) || pestanaVisible(p))) ?? e.tabs.find((p) => p.panel && pestanaVisible(p)) ?? SIN_PESTANA;
  };
  const elegir = (p: Pestana) => {
    if (p.panel) setSubs((antes) => ({ ...antes, [entrada().id]: p.id }));
  };

  const scopeBadge = createMemo(() => {
    const section = governedSectionFor(entrada().id, pestana().id);
    const governed = section !== null && lockedBy(section) !== null;
    return settingsScopeBadge({
      entryId: entrada().id,
      workspace: workspaceSelection().active,
      governed,
      labels: {
        orgPolicy: t("settings.scope.org_policy"),
        organization: t("settings.scope.organization"),
        workspace: t("settings.scope.workspace"),
      },
    });
  });

  // Las flechas mueven entre pestañas, que es lo que un `tablist` promete.
  function moverPestana(e: KeyboardEvent) {
    if (!flechaDeLista(e)) return;
    const paso = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (paso === 0) return;
    e.preventDefault();
    const usables = entrada().tabs.filter((p) => p.panel && pestanaVisible(p));
    const i = usables.findIndex((p) => p.id === pestana().id);
    const siguiente = usables[(i + paso + usables.length) % usables.length];
    elegir(siguiente);
    document.getElementById(idSub(siguiente.id))?.focus();
  }

  const principales = () => ENTRADAS.filter((e) => !e.footer);
  const pie = () => ENTRADAS.filter((e) => e.footer);

  function Fila(p: { d: Entrada }) {
    return (
      <SidebarMenuItem role="presentation">
        <SidebarMenuButton
          id={idTab(p.d.id)}
          role="tab"
          aria-selected={activo() === p.d.id}
          aria-controls="cfg-panel"
          tabindex={foco() === p.d.id ? 0 : -1}
          isActive={activo() === p.d.id}
          selectionMark={false}
          // El fondo del activo vive en el átomo; la barra de acento pertenece a
          // la navegación principal y aquí duplicaba una señal sobre una lista corta.
          class="pestana-fundida h-10 min-h-10 grid-cols-[18px_minmax(0,1fr)] gap-2.5 rounded-l-[10px] rounded-r-none border-0 py-0 pl-3.5 pr-3 outline-none focus:outline-none focus-visible:outline-none data-[active=true]:bg-surface data-[active=true]:font-semibold data-[active=true]:hover:bg-surface"
          onClick={() => abrir(p.d)}
          onKeyDown={teclas}
        >
          {/* Sin color propio: hereda el del botón, que sale de `@theme` y se
              invierte con el tema. */}
          <span class="flex size-4 items-center justify-center">{p.d.icono()}</span>
          <span class="truncate">{p.d.name}</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  }
  return (
    <Dialog open onOpenChange={(abierto) => !abierto && props.onClose()}>
      <DialogContent
        // El ancho conserva tope porque el panel es prosa y controles; el alto
        // crece con la ventana.
        ref={hoja}
        class="flex h-[min(900px,100%)] w-[min(1120px,100%)] max-w-[1120px] flex-col overflow-hidden p-0"
        aria-label={t("settings.title")}
      >
        {/* **La fila tiene que ser `minmax(0,1fr)` y no la implícita.** Con
            `grid-auto-rows: auto` el riel crece por debajo de la hoja y su
            `overflow-y-auto` no tiene nada que desplazar. */}
        <div class="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)] md:grid-cols-[236px_minmax(0,1fr)] md:grid-rows-[minmax(0,1fr)]">
          <header class="grid gap-3 border-b border-border bg-rail px-4 py-3 md:hidden">
            <div class="flex items-center justify-between gap-3">
              <DialogTitle class="m-0 text-lead font-semibold">{t("settings.title")}</DialogTitle>
              <Button variant="ghost" size="iconCompact" onClick={props.onClose} aria-label={t("settings.close")}>
                <Close size={16} />
              </Button>
            </div>
            <SettingsWorkspaceSelector
              options={workspaceSelection().options}
              active={workspaceSelection().active}
              open={mobileSelectorOpen()}
              onOpenChange={setMobileSelectorOpen}
              onSelect={selectWorkspace}
              failure={ws.fallo()}
              sesiones={props.sesiones}
            />
            <Select
              aria-label={t("settings.nav.label")}
              value={activo()}
              onChange={(event) => {
                const id = event.currentTarget.value as SettingsEntryId;
                setFoco(id);
                setActivo(id);
              }}
            >
              <For each={ENTRADAS}>
                {(entry) => <option value={entry.id}>{entry.name}</option>}
              </For>
            </Select>
            <AdminLink />
          </header>
          <Sidebar
            role="tablist"
            aria-orientation="vertical"
            aria-label={t("settings.nav.label")}
            class="hidden border-0 bg-rail md:grid"
          >
            <SidebarHeader class="flex flex-col gap-3 px-3 pt-4 pb-4">
              <h2 class="m-0 px-2 text-lead font-semibold">
                {t("settings.title")}
              </h2>
              <SettingsWorkspaceSelector
                options={workspaceSelection().options}
                active={workspaceSelection().active}
                open={desktopSelectorOpen()}
                onOpenChange={setDesktopSelectorOpen}
                onSelect={selectWorkspace}
                failure={ws.fallo()}
                sesiones={props.sesiones}
              />
            </SidebarHeader>

            {/* Sin barra visible: su canal separaba la pestaña activa del panel
                en cuanto el riel desbordaba, por ejemplo con zoom. */}
            <SidebarContent class="flex flex-col overflow-y-auto px-0 pb-4 pl-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <SidebarMenu role="presentation" class="gap-1.5">
                <For each={principales()}>{(d) => <Fila d={d} />}</For>
              </SidebarMenu>
            </SidebarContent>
            <Show when={pie().length > 0 || !!capabilities().adminPage}>
              <div
                role="presentation"
                data-settings-footer=""
                class="mt-auto border-0 border-t border-solid border-border px-0 pb-3 pl-2 pt-2.5"
              >
                <SidebarMenu role="presentation" class="gap-1.5">
                  <For each={pie()}>{(d) => <Fila d={d} />}</For>
                  <AdminLink embedded />
                </SidebarMenu>
              </div>
            </Show>
          </Sidebar>

          <div class="relative min-h-0 min-w-0 bg-surface">
            {/* Cada panel debe montarse como componente: invocarlo aquí
                metería sus señales en el efecto de selección y lo repintaría
                cuando cambian sus propios controles. */}
            <div
              id="cfg-panel"
              role="tabpanel"
              aria-labelledby={idTab(entrada().id)}
              class="h-full min-h-0 min-w-0 overflow-auto md:flex md:flex-col md:overflow-hidden"
            >
              {/* En escritorio el encabezado y sus pestañas quedan fuera del scroll: así el cerrar no comparte lugar con el contenido. */}
              <div class="px-4 pt-5 md:shrink-0 md:px-8 md:pt-6">
                <header class={cn("grid grid-cols-[minmax(0,1fr)] items-center gap-3 md:grid-cols-[minmax(0,1fr)_auto]", entrada().tabs.length > 1 ? "mb-5" : "border-0 border-b border-solid border-border pb-4")}>
                  <div class="flex min-w-0 flex-wrap items-center gap-2">
                    <h2 class="m-0 text-lg font-semibold">{entrada().name}</h2>
                    <Show when={scopeBadge()}>
                      {(badge) => (
                        <Badge tone={badge().tone} data-settings-scope-badge={badge().kind}>
                          {badge().label}
                        </Badge>
                      )}
                    </Show>
                  </div>
                  <Button variant="ghost" size="iconCompact" class="hidden size-7 md:inline-flex" onClick={props.onClose} aria-label={t("settings.close")}>
                    <Close size={16} />
                  </Button>
                </header>
                <Show when={entrada().tabs.length > 1}>
                  <div
                    role="tablist"
                    aria-label={entrada().name}
                    onKeyDown={moverPestana}
                    class="flex items-end gap-5 overflow-x-auto border-0 border-b border-solid border-border"
                  >
                    <For each={entrada().tabs.filter(pestanaVisible)}>
                      {(p) => (
                        <Pressable
                          role="tab"
                          id={idSub(p.id)}
                          aria-selected={pestana().id === p.id}
                          aria-controls="cfg-subpanel"
                          aria-disabled={p.panel ? undefined : true}
                          title={p.panel ? undefined : t("settings.nav.soon_why")}
                          tabindex={pestana().id === p.id ? 0 : -1}
                          onClick={() => elegir(p)}
                          class={cn(
                            "-mb-px inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border-0 border-b-2 border-solid border-transparent bg-transparent px-0 pt-0 pb-2 text-sm text-neutral-500 outline-none hover:text-neutral-950 focus:outline-none focus-visible:bg-surface-muted focus-visible:outline-none aria-disabled:cursor-default aria-disabled:hover:text-neutral-500",
                            pestana().id === p.id && "border-neutral-950 font-semibold text-neutral-950",
                          )}
                        >
                          {p.name}
                          <Show when={!p.panel}>
                            <Badge forma="dato">{t("settings.nav.soon")}</Badge>
                          </Show>
                        </Pressable>
                      )}
                    </For>
                  </div>
                </Show>
              </div>
              <div id="cfg-subpanel" role={entrada().tabs.length > 1 ? "tabpanel" : undefined} aria-labelledby={entrada().tabs.length > 1 ? idSub(pestana().id) : undefined} class="min-w-0 px-4 pb-10 pt-5 md:min-h-0 md:flex-1 md:overflow-auto md:px-8">
                <Show when={subpanelKey()} keyed>
                  <Dynamic component={pestana().panel ?? (() => null)} />
                </Show>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
