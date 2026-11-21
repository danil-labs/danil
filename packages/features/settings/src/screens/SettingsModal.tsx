import {
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
  type JSX,
} from "solid-js";
import { Dynamic } from "solid-js/web";
import {
  Badge,
  Button,
  Close,
  Dialog,
  DialogContent,
  DialogTitle,
  Select,
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  cn,
} from "@danil/ui";
import {
  idSub,
  idTab,
  SETTINGS_ENTRIES,
  SETTINGS_GROUPS,
  settingsTarget,
  TAB_NAMES,
  type SettingsEntryId,
  type SettingsGroup,
  type SettingsTab,
} from "../entries.ts";
import { ICONOS } from "../components/entry-icons.tsx";
import { AccountSection } from "../components/AccountSection.tsx";
import { PreferencesSection } from "../components/preferences/PreferencesSection.tsx";

export interface SettingsModalProps {
  open?: boolean;
  onClose: () => void;
  panel?: string;
  accountSlot?: JSX.Element;
  aiAccountsSlot?: JSX.Element;
  machinesSlot?: JSX.Element;
  preferencesSlot?: JSX.Element;
  sourceControlSlot?: JSX.Element;
  projectsSlot?: JSX.Element;
  agentsSkillsSlot?: JSX.Element;
  connectionsSlot?: JSX.Element;
  customPanels?: Partial<Record<string, () => JSX.Element>>;
}

interface Entrada {
  id: SettingsEntryId;
  group: SettingsGroup;
  name: string;
  icono: () => JSX.Element;
  tabs: SettingsTab[];
}



export function SettingsModal(props: SettingsModalProps) {
  let hoja: HTMLDivElement | undefined;

  const resolverPanel = (id: string, entryId: SettingsEntryId): (() => JSX.Element) | null => {
    if (props.customPanels?.[id]) {
      return props.customPanels[id]!;
    }
    if (entryId === "account") {
      if (id === "cuenta-danil") {
        return () => <AccountSection slot={props.accountSlot} part="profile" />;
      }
      if (id === "emails") {
        return () => <AccountSection part="emails" />;
      }
      if (id === "usage") {
        return () => <AccountSection part="usage" />;
      }
      if (id === "plan") {
        return () => <AccountSection part="plan" />;
      }
      if (id === "security") {
        return null;
      }
    }
    if (entryId === "preferences") {
      return () => (
        <PreferencesSection
          tab={id}
          slot={props.preferencesSlot}
        />
      );
    }
    if (entryId === "machines" && props.machinesSlot && id === "machines") {
      return () => <>{props.machinesSlot}</>;
    }
    if (id === "security") {
      return null;
    }
    return () => (
      <div class="py-8 text-center text-sm text-neutral-400">
        {TAB_NAMES[id] ?? id}
      </div>
    );
  };

  const entradas = (): Entrada[] =>
    SETTINGS_ENTRIES.map((e) => ({
      id: e.id,
      group: e.group,
      name: e.name,
      icono: ICONOS[e.id],
      tabs: e.tabs.map((tid) => ({
        id: tid,
        name: TAB_NAMES[tid] ?? tid,
        panel: resolverPanel(tid, e.id),
      })),
    }));

  const pedido = settingsTarget(props.panel);
  const todasEntradas = entradas();
  const inicial = todasEntradas.find((e) => e.id === pedido?.entry) ?? todasEntradas[0];

  const [activo, setActivo] = createSignal<SettingsEntryId>(inicial.id);
  const [foco, setFoco] = createSignal<SettingsEntryId>(inicial.id);
  const [subs, setSubs] = createSignal<Partial<Record<SettingsEntryId, string>>>(
    pedido?.tab && inicial.id === pedido.entry && inicial.tabs.some((p) => p.id === pedido.tab)
      ? { [inicial.id]: pedido.tab }
      : {},
  );

  onMount(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if ((e.target as Element | null)?.closest?.("[data-owns-escape]")) return;
        const otro = (e.target as Element | null)?.closest?.("[role=dialog]");
        if (otro && otro !== hoja) return;
        e.stopPropagation();
        props.onClose();
      }
    };
    window.addEventListener("keydown", alTeclear, true);
    onCleanup(() => window.removeEventListener("keydown", alTeclear, true));
  });

  function mover(paso: number | "inicio" | "fin") {
    const list = todasEntradas;
    const i = list.findIndex((d) => d.id === foco());
    const j =
      paso === "inicio"
        ? 0
        : paso === "fin"
          ? list.length - 1
          : (i + paso + list.length) % list.length;
    const id = list[j].id;
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
    document.getElementById(idTab(d.id))?.focus({ focusVisible: false } as FocusOptions);
    setActivo(d.id);
  }

  const entrada = () => todasEntradas.find((d) => d.id === activo()) ?? todasEntradas[0];
  const pestana = () => {
    const e = entrada();
    return (
      e.tabs.find((p) => p.id === subs()[e.id] && p.panel) ??
      e.tabs.find((p) => p.panel) ??
      e.tabs[0]
    );
  };

  const elegir = (p: SettingsTab) => {
    if (p.panel) setSubs((antes) => ({ ...antes, [entrada().id]: p.id }));
  };

  function moverPestana(e: KeyboardEvent) {
    const paso = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (paso === 0) return;
    e.preventDefault();
    const usables = entrada().tabs.filter((p) => p.panel);
    if (!usables.length) return;
    const i = usables.findIndex((p) => p.id === pestana().id);
    const siguiente = usables[(i + paso + usables.length) % usables.length];
    elegir(siguiente);
    document.getElementById(idSub(siguiente.id))?.focus();
  }

  return (
    <Dialog open={props.open ?? true} onOpenChange={(abierto) => !abierto && props.onClose()}>
      <DialogContent
        ref={hoja}
        class="flex h-[min(900px,100%)] w-[min(1120px,100%)] max-w-[1120px] flex-col overflow-hidden p-0"
        aria-label="Configuración"
      >
        <div class="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)] md:grid-cols-[224px_minmax(0,1fr)] md:grid-rows-[minmax(0,1fr)]">
          <header class="grid gap-3 border-b border-border bg-rail px-4 py-3 md:hidden">
            <div class="flex items-center justify-between gap-3">
              <DialogTitle class="m-0 text-lead font-semibold">Configuración</DialogTitle>
              <Button
                variant="ghost"
                size="iconCompact"
                onClick={props.onClose}
                aria-label="Cerrar configuración (Esc)"
              >
                <Close size={16} />
              </Button>
            </div>
            <Select
              aria-label="Secciones de configuración"
              value={activo()}
              onChange={(event) => {
                const id = event.currentTarget.value as SettingsEntryId;
                setFoco(id);
                setActivo(id);
              }}
            >
              <For each={SETTINGS_GROUPS}>
                {(group) => (
                  <optgroup label={group.nombre}>
                    <For each={todasEntradas.filter((entry) => entry.group === group.id)}>
                      {(entry) => <option value={entry.id}>{entry.name}</option>}
                    </For>
                  </optgroup>
                )}
              </For>
            </Select>
          </header>
          <Sidebar
            role="tablist"
            aria-orientation="vertical"
            aria-label="Secciones de configuración"
            class="hidden border-0 bg-rail md:grid"
          >
            <SidebarHeader class="pb-6 pl-5 pr-3 pt-4">
              <h2 class="m-0 text-lead font-semibold">Configuración</h2>
            </SidebarHeader>

            <SidebarContent class="flex flex-col gap-6 overflow-y-auto px-0 pb-4 pl-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <For each={SETTINGS_GROUPS}>
                {(g) => (
                  <Show when={todasEntradas.some((e) => e.group === g.id)}>
                    <div role="presentation" class="flex flex-col gap-3">
                      <p class="m-0 px-3 text-xs text-neutral-500">{g.nombre}</p>
                      <SidebarMenu role="presentation" class="gap-1.5">
                        <For each={todasEntradas.filter((e) => e.group === g.id)}>
                          {(d) => (
                            <SidebarMenuItem role="presentation">
                              <SidebarMenuButton
                                id={idTab(d.id)}
                                role="tab"
                                aria-selected={activo() === d.id}
                                aria-controls="cfg-panel"
                                tabindex={foco() === d.id ? 0 : -1}
                                isActive={activo() === d.id}
                                selectionMark={false}
                                class="pestana-fundida h-10 min-h-10 grid-cols-[18px_minmax(0,1fr)] gap-2.5 rounded-l-[10px] rounded-r-none border-0 py-0 pl-3.5 pr-3 focus-visible:outline-offset-[-2px] data-[active=true]:bg-surface data-[active=true]:font-semibold data-[active=true]:hover:bg-surface"
                                onClick={() => abrir(d)}
                                onKeyDown={teclas}
                              >
                                <span class="flex size-4 items-center justify-center">
                                  {d.icono()}
                                </span>
                                <span class="truncate">{d.name}</span>
                              </SidebarMenuButton>
                            </SidebarMenuItem>
                          )}
                        </For>
                      </SidebarMenu>
                    </div>
                  </Show>
                )}
              </For>
            </SidebarContent>
          </Sidebar>

          <div class="relative min-h-0 min-w-0 bg-surface">
            <div
              id="cfg-panel"
              role="tabpanel"
              aria-labelledby={idTab(entrada().id)}
              class="h-full min-h-0 min-w-0 overflow-auto md:flex md:flex-col md:overflow-hidden"
            >
              <div class="px-4 pt-5 md:shrink-0 md:px-8 md:pt-6">
                <header
                  class={cn(
                    "grid grid-cols-[minmax(0,1fr)] items-center gap-3 md:grid-cols-[minmax(0,1fr)_auto]",
                    entrada().tabs.length > 1
                      ? "mb-5"
                      : "border-0 border-b border-solid border-border pb-4",
                  )}
                >
                  <h2 class="m-0 text-lg font-semibold">{entrada().name}</h2>
                  <Button
                    variant="ghost"
                    size="iconCompact"
                    class="hidden size-7 md:inline-flex"
                    onClick={props.onClose}
                    aria-label="Cerrar configuración (Esc)"
                  >
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
                    <For each={entrada().tabs}>
                      {(p) => (
                        <button
                          type="button"
                          role="tab"
                          id={idSub(p.id)}
                          aria-selected={pestana().id === p.id}
                          aria-controls="cfg-subpanel"
                          aria-disabled={p.panel ? undefined : true}
                          title={p.panel ? undefined : "Todavía no está en la app"}
                          tabindex={pestana().id === p.id ? 0 : -1}
                          onClick={() => elegir(p)}
                          class={cn(
                            "-mb-px inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border-0 border-b-2 border-solid border-transparent bg-transparent px-0 pt-0 pb-2 text-sm text-neutral-500 hover:text-neutral-950 aria-disabled:cursor-default aria-disabled:hover:text-neutral-500",
                            pestana().id === p.id &&
                              "border-neutral-950 font-semibold text-neutral-950",
                          )}
                        >
                          {p.name}
                          <Show when={!p.panel}>
                            <Badge forma="dato">pronto</Badge>
                          </Show>
                        </button>
                      )}
                    </For>
                  </div>
                </Show>
              </div>
              <div
                id="cfg-subpanel"
                role={entrada().tabs.length > 1 ? "tabpanel" : undefined}
                aria-labelledby={entrada().tabs.length > 1 ? idSub(pestana().id) : undefined}
                class="min-w-0 px-4 pb-10 pt-5 md:min-h-0 md:flex-1 md:overflow-auto md:px-8"
              >
                <Dynamic component={pestana().panel ?? (() => null)} />
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
