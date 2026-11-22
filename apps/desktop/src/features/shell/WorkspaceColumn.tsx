import SettingsIcon from "lucide-solid/icons/settings";
import { children, createEffect, createSignal, For, type JSX, Show } from "solid-js";
import { t } from "../../lib/i18n";
import { createNavigationReorder } from "../../lib/navigation-order";
import { capabilities, type OtherAccount, type OtherWorkspace } from "../../lib/platform";
import { deleteLayout, spacesWithLayout } from "../../lib/panels";
import { createPref } from "../../lib/prefs";
import { workspaceViewKey } from "../../lib/workspace-view-scope";
import { cn } from "../../lib/utils";
import { Popover, PopoverAnchor, PopoverContent } from "../../ui/Popover";
import { Toast, ToastPortal } from "../../ui/Toast";
import { RETARDO_TOOLTIP, TooltipContent, TooltipRoot, TooltipTrigger } from "../../ui/Tooltip";
import type { RailWorkspace } from "../machines/engine-workspaces";
import { taskLabel } from "../projects/TaskStatus";
import { cerrarConEscape, createRail } from "../settings/workspaces-store";
import { AccountHeader } from "./AccountHeader";
import AddWorkspaceMenu from "./AddWorkspaceMenu";
import { menuArrows } from "./menu-focus";
import { OrganizationAccountMenu } from "./OrganizationAccountMenu";
import { RemoveWorkspaceDialog } from "./RemoveWorkspaceDialog";
import { type RailWorkspaceTarget, removeRailWorkspace } from "./remove-rail-workspace";
import { type AttentionState, topState, type WorkspaceAttention } from "./attention";
import { columnDanil, tileLabel } from "./danil-rail";
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
  /** Ajustes, en su sección si se da. */
  onSettings: (panel?: string) => void;
  onReportarBug: () => void;
  /** Archivadas, Conexiones, Puertos y Almacenamiento: lo que avisa de algo. */
  tools?: JSX.Element;
}) {
  const ws = createRail();
  const hidden = createHiddenWorkspaces();
  const { danil, visible } = columnDanil(hidden, ws);
  const [legacyRemoved, setLegacyRemoved] = createPref<string[]>("workspaces.removed", []);
  const [removing, setRemoving] = createSignal<RailWorkspaceTarget | null>(null);
  const [revokeUnavailable, setRevokeUnavailable] = createSignal(false);
  const sessions = sessionRail(hidden.ids, (ids) => ids.forEach(hidden.show));
  const groupOf = (context?: string) => sessions.groups()?.find((g) => g.context_id === context);
  const hiddenKey = (id: string, context?: string) => {
    const group = groupOf(context);
    if (!group) return id;
    const family = sessions.sessions.families().find((f) => f.family === group.family);
    return JSON.stringify([family?.sub ?? group.email ?? group.family, group.org, id]);
  };
  const isHidden = (id: string, context?: string) => hidden.ids().has(hiddenKey(id, context));
  const visibleGroups = () => (sessions.groups() ?? []).map((g) => ({
    ...g, available: g.available?.filter((w) => !isHidden(w.id, g.context_id)) ?? null,
  }));
  const localRows = () => (ws.lista() ?? []).filter((w) => !legacyRemoved().includes(w.id));
  const visibles = () => sessions.groups() === null
    ? visible(localRows(), ws.activo() ?? null)
    : sessionVisible(localRows(), ws.activo() ?? null, hidden.ids(), visibleGroups(), sessions.known);
  const hiddenRows = (): RailWorkspaceTarget[] => [
    ...localRows().filter((w) => !sessions.known.has(w.id) && isHidden(w.id)),
    ...(sessions.groups() ?? []).flatMap((g) => (g.available ?? [])
      .filter((w) => g.added?.has(w.id) && isHidden(w.id, g.context_id))
      .map((w) => ({ id: w.id, name: w.name, context: g.context_id }))),
  ];
  const isActive = (target: RailWorkspaceTarget) => ws.activo() === target.id && ws.activoContexto() === (target.context ?? null);
  async function moveAway(target: RailWorkspaceTarget) {
    if (!isActive(target)) return;
    const fallback = visibles().find((w) => w.id !== target.id && !sessions.known.has(w.id));
    const next = organizationStartTarget(visibleGroups().map((g) => ({
      ...g, available: g.available?.filter((w) => w.id !== target.id || g.context_id !== target.context) ?? null,
    })), target.id, target.context ?? null, sessions.sessions.defaultContext());
    await ws.cambiarA(next?.id ?? fallback?.id ?? null, next?.context);
    if (isActive(target)) throw new Error("workspace_still_active");
  }
  function hide(target: RailWorkspaceTarget) {
    void moveAway(target).then(() => hidden.hide(hiddenKey(target.id, target.context))).catch(() => {});
  }
  async function remove(target: RailWorkspaceTarget) {
    const key = hiddenKey(target.id, target.context);
    const forgetView = async () => {
      await moveAway(target);
      hidden.show(key);
      const view = workspaceViewKey(target.id, target.context ?? null);
      for (const space of spacesWithLayout(view)) deleteLayout(view, space);
      if (!sessions.groups()?.some((g) => g.context_id !== target.context && g.added?.has(target.id))) {
        ws.reorder(localRows().map((w) => w.id).filter((id) => id !== target.id));
      }
    };
    if (!target.context) {
      await forgetView();
      setLegacyRemoved([...new Set([...legacyRemoved(), target.id])]);
      if (danil.isDanil(target.id)) danil.remove(target.id);
      return "unavailable" as const;
    }
    const group = groupOf(target.context);
    if (!group?.added) throw new Error("workspace_preferences_unavailable");
    await moveAway(target);
    return removeRailWorkspace({
      context: target.context, workspace: target.id, added: group.added, revoke: sessions.revoke,
      removeAdded: (id) => sessions.remove(group.context_id, id),
      forgetView, closeContext: (context) => sessions.sessions.close({ context }),
    });
  }
  createEffect(() => {
    const open = ws.activo();
    if (sessions.groups() === null || !open || !sessions.known.has(open)) return;
    const rows = visibles();
    if (!rows.some((w) => w.id === open) || (ws.activoContexto() && !sessions.groups()?.some((group) => group.context_id === ws.activoContexto()))) { const target = organizationStartTarget(visibleGroups(), open, ws.activoContexto(), sessions.sessions.defaultContext()); void ws.cambiarA(target?.id ?? rows.find((row) => !sessions.known.has(row.id))?.id ?? null, target?.context); }
  });
  let sessionsSettled = false;
  // La web abre al arrancar el de la URL (W6) o el primero agregado, aunque ninguna máquina diga un activo.
  const asked = capabilities().nativeWindow ? "" : window.location.search;
  createEffect(() => {
    const groups = sessions.groups() && visibleGroups();
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
            class={cn("group relative grid h-10 w-full shrink-0 touch-none place-items-center outline-none select-none", reorder.source() === p.w.id && "cursor-grabbing opacity-40")}
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
                "relative grid size-8 place-items-center rounded-md text-label font-semibold group-focus-visible:bg-neutral-200",
                active()
                  ? "bg-neutral-200 text-neutral-950"
                  : "bg-surface text-neutral-700 group-hover:bg-neutral-200 group-hover:text-neutral-950",
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
          <OrganizationAccountMenu
            workspace={p.w.name} promo={false} send={sessions.sessions.sendOptional} onPromo={() => {}}
            canMoveUp={visibles().findIndex((w) => w.id === p.w.id) > 0}
            canMoveDown={visibles().findIndex((w) => w.id === p.w.id) < visibles().length - 1}
            onOpen={() => { setMenuOf(null); void ws.cambiarA(p.w.id); }}
            onHide={() => { setMenuOf(null); hide(p.w); }}
            onRemove={() => { setMenuOf(null); setRemoving(p.w); }}
            onMove={(step) => {
              const ids = visibles().map((w) => w.id);
              const from = ids.indexOf(p.w.id), to = from + step;
              if (from < 0 || to < 0 || to >= ids.length) return;
              [ids[from], ids[to]] = [ids[to], ids[from]];
              ws.reorder(keepSlots(localRows().map((w) => w.id), ids));
            }}
            onDismiss={() => setMenuOf(null)}
          />
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
        <SessionWorkspaceRows sessions={sessions} rows={visibles()} render={(w) => <Tile w={w()} />} active={ws.activo() && ws.activoContexto() ? { workspace: ws.activo()!, context: ws.activoContexto()! } : null} tasksOf={(id, context) => props.attention.find((row) => row.workspace === id && row.context === context)?.tasks ?? []} staleOf={(id, context) => props.attention.find((row) => row.workspace === id && row.context === context)?.stale ?? false} stateLabel={(state) => state ? taskLabel(state, true) : ""} onOpen={(id, context) => void ws.cambiarA(id, context)} onHide={hide} onRemove={setRemoving} hidden={isHidden} />
        <AddWorkspaceMenu
          sessions={sessions}
          hidden={hiddenRows()}
          open={ws.activo() ?? null}
          activeContext={ws.activoContexto()}
          tasksOf={tasksOf}
          badge={AttentionBadge}
          labelOf={(s) => taskLabel(s, true)}
          onOpen={(id, context) => void ws.cambiarA(id, context)}
          onShow={(w) => hidden.show(hiddenKey(w.id, w.context))}
          onRemove={setRemoving}
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
      <RemoveWorkspaceDialog workspace={removing()} onCancel={() => setRemoving(null)} onRemove={remove} onUnavailable={() => setRevokeUnavailable(true)} />
      <ToastPortal><Show when={revokeUnavailable()}><Toast onDismiss={() => setRevokeUnavailable(false)}>{t("shell.workspaces.revoke_unavailable")}</Toast></Show></ToastPortal>
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
