import SettingsIcon from "lucide-solid/icons/settings";
import { children, createEffect, createSignal, For, type JSX, Show } from "solid-js";
import { t } from "../../lib/i18n";
import { createNavigationReorder } from "../../lib/navigation-order";
import { capabilities, type OtherAccount, type OtherWorkspace } from "../../lib/platform";
import { cn } from "../../lib/utils";
import { ITEM_DE_MENU, Popover, PopoverAnchor, PopoverContent } from "../../ui/Popover";
import { RETARDO_TOOLTIP, TooltipContent, TooltipRoot, TooltipTrigger } from "../../ui/Tooltip";
import type { RailWorkspace } from "../machines/engine-workspaces";
import { taskLabel } from "../projects/TaskStatus";
import { cerrarConEscape, createRail } from "../settings/workspaces-store";
import { AccountHeader } from "./AccountHeader";
import AddWorkspaceMenu, { menuArrows } from "./AddWorkspaceMenu";
import { type AttentionState, topState, type WorkspaceAttention } from "./attention";
import { columnDanil, danilMenuOf, tileLabel } from "./danil-rail";
import { createHiddenWorkspaces, keepSlots } from "./hidden-workspaces";
import KeepAwake from "./KeepAwake";
import { AttentionBadge, MarcaDeWorkspace } from "./WorkspaceMarks";

export { AttentionBadge, MarcaDeWorkspace, monogram } from "./WorkspaceMarks";

import { organizationStartTarget, requestedStartTarget } from "./organization-start-target";
import ProfileMenu from "./ProfileMenu";
import { SessionWorkspaceRows } from "./SessionWorkspaceRows";
import { sessionRail } from "./session-groups";
import { sessionVisible } from "./session-rail-view";

/** Cambiar de workspace con un clic y ver, sin entrar, qué espera en cada uno. */

export default function WorkspaceColumn(props: {
  attention: WorkspaceAttention[];
  onManage: () => void;
  /** Ajustes, en su sección si se da. */
  onSettings: (panel?: string) => void;
  onReportarBug: () => void;
  /** Archivadas, Conexiones, Puertos y Almacenamiento: lo que avisa de algo. */
  tools?: JSX.Element;
}) {
  const ws = createRail();
  const hidden = createHiddenWorkspaces();
  const { danil, view: danilView, visible, hiddenRows } = columnDanil(hidden, ws);
  // Los ocultos y los de Danil sin agregar solo se ven mientras están abiertos.
  const sessions = sessionRail(hidden.ids, (ids) => ids.forEach(hidden.show));
  const visibles = () => sessions.groups() === null ? visible(ws.lista() ?? [], ws.activo() ?? null) : sessionVisible(ws.lista() ?? [], ws.activo() ?? null, hidden.ids(), sessions.groups() ?? [], sessions.known);
  createEffect(() => {
    const open = ws.activo();
    if (sessions.groups() === null || !open || !sessions.known.has(open)) return;
    const rows = visibles();
    if (!rows.some((w) => w.id === open) || (ws.activoContexto() && !sessions.groups()?.some((group) => group.context_id === ws.activoContexto()))) { const target = organizationStartTarget(sessions.groups() ?? [], open, ws.activoContexto(), sessions.sessions.defaultContext()); void ws.cambiarA(target?.id ?? rows.find((row) => !sessions.known.has(row.id))?.id ?? null, target?.context); }
  });
  let sessionsSettled = false;
  // La web abre al arrancar el de la URL (W6) o el primero agregado, aunque ninguna máquina diga un activo.
  const asked = capabilities().nativeWindow ? "" : window.location.search;
  createEffect(() => {
    const groups = sessions.groups();
    if (sessionsSettled || !groups?.length || groups.some((g) => !g.available || !g.added) || (!ws.activo() && capabilities().nativeWindow)) return;
    sessionsSettled = true;
    const open = ws.activo();
    const next = requestedStartTarget(groups, sessions.sessions.families(), asked) ?? (open ? (sessions.known.has(open) ? organizationStartTarget(groups, open, ws.activoContexto(), sessions.sessions.defaultContext()) : null) : organizationStartTarget(groups, "", null, sessions.sessions.defaultContext()));
    if (next && (next.id !== ws.activo() || next.context !== ws.activoContexto())) void ws.cambiarA(next.id, next.context);
  });
  let list: HTMLDivElement | undefined;
  const reorder = createNavigationReorder({
    scope: () => ws.activo() ?? "",
    list: () => list,
    attribute: "data-workspace-tile",
    axis: "y",
    ids: () => visibles().map(w => w.id),
    // Los que la barra no muestra conservan su lugar.
    save: (ids) => ws.reorder(keepSlots((ws.lista() ?? []).map(w => w.id), ids)),
  });
  const [menuOf, setMenuOf] = createSignal<string | null>(null);
  cerrarConEscape(() => menuOf() !== null, () => setMenuOf(null));

  const tasksOf = (id: string) => props.attention.find((w) => w.workspace === id)?.tasks ?? [];
  const stateOf = (id: string) => topState(tasksOf(id));

  const Tile = (p: { w: RailWorkspace }) => {
    const active = () => p.w.id === ws.activo();
    const state = () => stateOf(p.w.id);
    const label = () => tileLabel(p.w.name, danil.isDanil(p.w.id), state() ? taskLabel(state() as AttentionState, true) : null, t);
    let anchor: HTMLButtonElement | undefined;
    return (
      <Popover
        open={menuOf() === p.w.id}
        onOpenChange={(open) => setMenuOf(open ? p.w.id : null)}
        placement="right-start"
        gutter={4}
      >
        <PopoverAnchor class="w-full">
          {/* El monograma no basta para distinguir dos workspaces; `title` casi no se ve en el webview. */}
          <TooltipRoot openDelay={RETARDO_TOOLTIP} placement="right" gutter={6} disabled={menuOf() === p.w.id || reorder.source() !== null}>
          <TooltipTrigger
            as="button"
            ref={anchor}
            type="button"
            data-workspace-tile={p.w.id}
            data-attention={state() ?? undefined}
            class={cn("marca-seleccion group relative grid h-10 w-full shrink-0 touch-none place-items-center outline-none select-none", reorder.source() === p.w.id && "cursor-grabbing opacity-40")}
            aria-current={active() ? "true" : undefined}
            aria-label={label()}
            onPointerDown={(e: PointerEvent) => reorder.start(p.w.id, e)}
            onClick={() => void ws.cambiarA(p.w.id)}
            onContextMenu={(e: MouseEvent) => {
              e.preventDefault();
              setMenuOf(p.w.id);
            }}
            onKeyDown={(e: KeyboardEvent) => {
              if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) {
                e.preventDefault();
                setMenuOf(p.w.id);
              }
            }}
          >
            <Show when={reorder.edge(p.w.id)}>
              {(edge) => <span aria-hidden="true" class={cn("pointer-events-none absolute right-2 left-2 h-0.5 bg-primary", edge() === "before" ? "top-0" : "bottom-0")} />}
            </Show>
            <span
              aria-hidden="true"
              data-active={active() ? "" : undefined}
              class={cn(
                danil.isDanil(p.w.id) && "danil-mark",
                "relative grid size-8 place-items-center rounded-md border text-label font-semibold group-focus-visible:outline-solid group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-primary",
                active()
                  ? "border-border-strong bg-surface-raised text-neutral-950"
                  : "border-border bg-surface text-neutral-700 group-hover:bg-neutral-200 group-hover:text-neutral-950",
              )}
            >
              <span class="absolute inset-0 overflow-hidden rounded-[inherit]">
                <span class="relative grid size-full place-items-center">
                  <MarcaDeWorkspace id={p.w.id} name={p.w.name} logo={p.w.logo} />
                </span>
              </span>
              <Show when={state()}>
                {(s) => <AttentionBadge state={s()} class="absolute -top-1 -right-1" />}
              </Show>
            </span>
          </TooltipTrigger>
          {/* Solo el nombre: el estado ya lo dice el distintivo, y repetirlo en
              palabras estorbaba. `aria-label` sí lo lleva, que no ve el distintivo. */}
          <TooltipContent>{p.w.name}</TooltipContent>
          </TooltipRoot>
        </PopoverAnchor>
        {/* Sin `Popover.Trigger` el foco no vuelve solo al cuadro. */}
        <PopoverContent
          role="menu"
          class="w-56 p-1"
          onKeyDown={menuArrows}
          onCloseAutoFocus={(e: Event) => {
            e.preventDefault();
            anchor?.focus();
          }}
        >
          <p class="m-0 truncate px-2 pt-1 pb-1 text-caption font-medium text-neutral-500">{p.w.name}</p>
          <button
            role="menuitem"
            class={ITEM_DE_MENU}
            onClick={() => {
              setMenuOf(null);
              props.onManage();
            }}
          >
            {t("settings.workspaces.manage")}
          </button>
          <Show when={!active()}>
            <button role="menuitem" class={ITEM_DE_MENU} onClick={() => (setMenuOf(null), danil.isDanil(p.w.id) ? danil.remove(p.w.id) : hidden.hide(p.w.id))}>
              {danil.isDanil(p.w.id) ? t("shell.workspaces.remove") : t("shell.workspaces.hide")}
            </button>
          </Show>
        </PopoverContent>
      </Popover>
    );
  };

  // Las otras cuentas de Danil de este navegador (solo la web): sus workspaces van debajo, por cuenta.
  const accounts = capabilities().webAccounts;
  const others = () => accounts?.others() ?? [];

  /** Un workspace de otra cuenta: abrirlo recarga la página con esa cuenta; con la sesión caducada, pide volver a entrar. */
  const OtherTile = (p: { w: OtherWorkspace; account: OtherAccount }) => {
    const label = () => {
      const values = { name: p.w.name, email: p.account.email ?? "" };
      return p.account.signedIn ? t("shell.workspaces.other_tile", values) : t("shell.workspaces.expired_tile", values);
    };
    return (
      <TooltipRoot openDelay={RETARDO_TOOLTIP} placement="right" gutter={6}>
        <TooltipTrigger
          as="button"
          type="button"
          data-other-workspace-tile={p.w.id}
          class={cn("group relative grid h-10 w-full shrink-0 place-items-center outline-none select-none", !p.account.signedIn && "opacity-50")}
          aria-label={label()}
          onClick={() => (p.account.signedIn ? accounts?.open(p.w.id) : accounts?.add?.(p.account.email))}
        >
          <span
            aria-hidden="true"
            class="relative grid size-8 place-items-center rounded-md border border-border bg-surface text-label font-semibold text-neutral-700 group-hover:bg-neutral-200 group-hover:text-neutral-950 group-focus-visible:outline-solid group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-primary"
          >
            <span class="absolute inset-0 overflow-hidden rounded-[inherit]">
              <span class="relative grid size-full place-items-center">
                <MarcaDeWorkspace name={p.w.name} load={p.w.logo} />
              </span>
            </span>
          </span>
        </TooltipTrigger>
        <TooltipContent>{label()}</TooltipContent>
      </TooltipRoot>
    );
  };

  // Siempre a la vista: es el único sitio donde se cambia de workspace.
  return (
    <nav
      aria-label={t("shell.workspaces.label")}
      data-workspace-column=""
      class="flex h-full w-12 shrink-0 flex-col"
    >
      <div ref={list} class="flex min-h-0 flex-1 flex-col items-center gap-1 overflow-x-hidden overflow-y-auto pt-2 pb-2">
        <Show when={accounts && others().length > 0}>
          <AccountHeader accounts={accounts} id={accounts!.current.user_id} email={accounts!.current.email} extra={accounts!.current.extra} signedIn />
        </Show>
        <SessionWorkspaceRows sessions={sessions} rows={visibles()} render={(w) => <Tile w={w()} />} active={ws.activo() && ws.activoContexto() ? { workspace: ws.activo()!, context: ws.activoContexto()! } : null} tasksOf={(id, context) => props.attention.find((row) => row.workspace === id && row.context === context)?.tasks ?? []} staleOf={(id, context) => props.attention.find((row) => row.workspace === id && row.context === context)?.stale ?? false} stateLabel={(state) => state ? taskLabel(state, true) : ""} onOpen={(id, context) => void ws.cambiarA(id, context)} onManage={() => props.onManage()} />
        <AddWorkspaceMenu
          sessions={sessions}
          hidden={hiddenRows(ws.lista() ?? [])}
          danil={danilMenuOf(danil, danilView(), (id) => void ws.cambiarA(id))}
          open={ws.activo() ?? null}
          tasksOf={tasksOf}
          badge={AttentionBadge}
          labelOf={(s) => taskLabel(s, true)}
          onOpen={(id, context) => void ws.cambiarA(id, context)}
          onShow={hidden.show}
        />
        <For each={others()}>
          {(account) => (
            <>
              <AccountHeader accounts={accounts} id={account.user_id} email={account.email} extra={account.extra} signedIn={account.signedIn} stale={account.stale} />
              <For each={account.workspaces}>{(w) => <OtherTile w={w} account={account} />}</For>
            </>
          )}
        </For>
      </div>
      <ColumnFoot tools={props.tools} open={ws.activo() ?? null} onSettings={props.onSettings} onReportarBug={props.onReportarBug} />
    </nav>
  );
}

/** Lo que avisa de algo, Configuración y el perfil, al pie de la columna. */
function ColumnFoot(props: {
  tools?: JSX.Element;
  onSettings: (panel?: string) => void;
  onReportarBug: () => void;
  open: string | null;
}) {
  const boton = "grid size-8 shrink-0 place-items-center rounded-md text-neutral-500 outline-none hover:bg-neutral-200 hover:text-neutral-950 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
  // Leer `props.tools` dos veces montaría dos copias, y cada una consulta por su cuenta.
  const tools = children(() => props.tools);
  return (
    <div class="flex shrink-0 flex-col items-center gap-1 pt-1 pb-2" data-workspace-column-foot="">
      <Show when={tools.toArray().length > 0}>
        {tools()}
        <span aria-hidden="true" class="my-1 h-px w-6 shrink-0 bg-border-strong" />
      </Show>
      {/* Sólo la computadora de esta ventana: en la web la orden iría a una máquina remota. */}
      <Show when={import.meta.env.MODE !== "web"}><KeepAwake /></Show>
      <button type="button" class={boton} aria-label={t("settings.title")} title={t("settings.title")} onClick={() => props.onSettings()}>
        <SettingsIcon size={17} aria-hidden="true" />
      </button>
      <ProfileMenu open={props.open} onAccount={() => props.onSettings("cuenta-danil")} onReportarBug={props.onReportarBug} />
    </div>
  );
}
