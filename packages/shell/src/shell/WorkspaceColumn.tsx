import SettingsIcon from "lucide-solid/icons/settings";
import { children, createEffect, createSignal, For, type JSX, Show } from "solid-js";
import { t } from "../../../ui/src/lib/i18n";
import { capabilities, type OtherAccount, type OtherWorkspace } from "../../../host/src/platform";
import { deleteLayout, spacesWithLayout } from "../../../ui/src/lib/panels";
import { workspaceViewKey } from "../../../session/src/workspace-view-scope";
import { cn } from "../../../ui/src/lib/utils";
import { Toast, ToastPortal } from "../../../ui/src/Toast";
import { RETARDO_TOOLTIP, TooltipContent, TooltipRoot, TooltipTrigger } from "../../../ui/src/Tooltip";
import { taskLabel } from "../../../features/projects/src/screens/TaskStatus";
import { createWorkspaces } from "../../../features/settings/src/queries/workspaces-store";
import { AccountHeader } from "./AccountHeader";
import AddWorkspaceMenu from "./AddWorkspaceMenu";
import { RemoveWorkspaceDialog } from "./RemoveWorkspaceDialog";
import { type RailWorkspaceTarget, removeRailWorkspace } from "./remove-rail-workspace";
import type { WorkspaceAttention } from "./attention";
import { createHiddenWorkspaces } from "./hidden-workspaces";
import KeepAwake from "./KeepAwake";
import { AttentionBadge, MarcaDeWorkspace } from "./WorkspaceMarks";

export { AttentionBadge } from "./WorkspaceMarks";

import { organizationStartTarget, resolveStartupWorkspace } from "./organization-start-target";
import { readLastWorkspace, writeLastWorkspace } from "../../../session/src/last-workspace";
import ProfileMenu from "./ProfileMenu";
import { SessionWorkspaceRows } from "./SessionWorkspaceRows";
import { sessionRail } from "./session-groups";
import { sessionVisible } from "./session-rail-view";
import { Pressable } from "../../../ui/src/Pressable";

/** Cambiar de workspace con un clic y ver, sin entrar, qué espera en cada uno. */

export default function WorkspaceColumn(props: {
  attention: WorkspaceAttention[];
  /** Ajustes, en su sección si se da. */
  onSettings: (panel?: string) => void;
  onReportarBug: () => void;
  /** Archivadas, Conexiones, Puertos y Almacenamiento: lo que avisa de algo. */
  tools?: JSX.Element;
}) {
  const ws = createWorkspaces();
  const hidden = createHiddenWorkspaces();
  const [addMenuOpen, setAddMenuOpen] = createSignal(false);
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
  // El riel sale del catálogo de cada contexto (agregados y abierto); la máquina no aporta cuadros.
  const visibles = () => sessionVisible(ws.activo() ?? null, visibleGroups());
  const railIds = () => {
    const seen = new Set<string>();
    return (sessions.groups() ?? []).flatMap((g) => (g.available ?? []).flatMap((w) => {
      if (seen.has(w.id)) return [];
      seen.add(w.id);
      return [w.id];
    }));
  };
  const hiddenRows = (): RailWorkspaceTarget[] => (sessions.groups() ?? []).flatMap((g) => (g.available ?? [])
    .filter((w) => g.added?.has(w.id) && isHidden(w.id, g.context_id))
    .map((w) => ({ id: w.id, name: w.name, context: g.context_id })));
  const isActive = (target: RailWorkspaceTarget) => ws.activo() === target.id && ws.activoContexto() === (target.context ?? null);
  async function moveAway(target: RailWorkspaceTarget) {
    if (!isActive(target)) return;
    const fallback = visibles().find((w) => w.id !== target.id);
    const next = organizationStartTarget(visibleGroups().map((g) => ({
      ...g, available: g.available?.filter((w) => w.id !== target.id || g.context_id !== target.context) ?? null,
    })), target.id, target.context ?? null, sessions.sessions.defaultContext());
    const nextId = next?.id ?? fallback?.id ?? null;
    if (!nextId) writeLastWorkspace(null);
    await ws.cambiarA(nextId, next?.context);
    if (isActive(target)) throw new Error("workspace_still_active");
  }
  function hide(target: RailWorkspaceTarget) {
    void moveAway(target).then(() => hidden.hide(hiddenKey(target.id, target.context))).catch(() => {});
  }
  async function remove(target: RailWorkspaceTarget) {
    const group = groupOf(target.context);
    if (!target.context || !group?.added) throw new Error("workspace_preferences_unavailable");
    const key = hiddenKey(target.id, target.context);
    const forgetView = async () => {
      await moveAway(target);
      hidden.show(key);
      const view = workspaceViewKey(target.id, target.context ?? null);
      for (const space of spacesWithLayout(view)) deleteLayout(view, space);
    };
    await moveAway(target);
    return removeRailWorkspace({
      context: target.context, workspace: target.id, added: group.added, revoke: sessions.revoke,
      removeAdded: (id) => sessions.remove(group.context_id, id),
      forgetView, closeContext: (context) => sessions.sessions.close({ context }),
    });
  }
  createEffect(() => {
    const open = ws.activo();
    const ctx = ws.activoContexto();
    const rows = visibles();
    if (open && ctx && rows.some((w) => w.id === open)) {
      const group = groupOf(ctx);
      const family = group ? sessions.sessions.families().find((f) => f.family === group.family) : undefined;
      const account = family?.sub ?? group?.person ?? group?.email;
      if (group && account) writeLastWorkspace({ workspace: open, org: group.org, account });
    }
    if (!open || !railIds().includes(open)) return;
    if (!rows.some((w) => w.id === open) || (ctx && !sessions.groups()?.some((group) => group.context_id === ctx))) {
      const target = organizationStartTarget(visibleGroups(), open, ctx, sessions.sessions.defaultContext());
      void ws.cambiarA(target?.id ?? rows.find((row) => row.id !== open)?.id ?? null, target?.context);
    }
  });
  let sessionsSettled = false;
  // Al arrancar abre el de la URL (W6), el último workspace recordado o el primero agregado, sin bloquearse por otras organizaciones.
  const asked = capabilities().nativeWindow ? "" : window.location.search;
  const remembered = readLastWorkspace();
  const openWorkspace = (id: string, context?: string) => {
    sessionsSettled = true;
    void ws.cambiarA(id, context);
  };
  createEffect(() => {
    const groups = sessions.groups() && visibleGroups();
    if (sessionsSettled || !groups?.length) return;
    const decision = resolveStartupWorkspace({
      groups,
      families: sessions.sessions.families(),
      urlSearch: asked,
      remembered,
      open: ws.activo(),
      activeContext: ws.activoContexto(),
      defaultContext: sessions.sessions.defaultContext(),
      nativeWindow: Boolean(capabilities().nativeWindow),
      workspaceLoading: ws.cargando(),
    });
    if (decision.kind === "wait" || decision.kind === "none") return;
    sessionsSettled = true;
    if (decision.id !== ws.activo() || decision.context !== ws.activoContexto()) {
      void ws.cambiarA(decision.id, decision.context);
    }
  });
  const tasksOf = (id: string) => props.attention.find((w) => w.workspace === id)?.tasks ?? [];

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
      <div class="flex min-h-0 flex-1 flex-col items-center gap-1 overflow-x-hidden overflow-y-auto pt-2 pb-2">
        <Show when={accounts && others().length > 0}>
          <AccountHeader accounts={accounts} id={accounts!.current.user_id} email={accounts!.current.email} extra={accounts!.current.extra} signedIn />
        </Show>
        <SessionWorkspaceRows suppressTooltips={addMenuOpen()} sessions={sessions} rows={visibles()} active={ws.activo() && ws.activoContexto() ? { workspace: ws.activo()!, context: ws.activoContexto()! } : null} tasksOf={(id, context) => props.attention.find((row) => row.workspace === id && row.context === context)?.tasks ?? []} staleOf={(id, context) => props.attention.find((row) => row.workspace === id && row.context === context)?.stale ?? false} stateLabel={(state) => state ? taskLabel(state, true) : ""} onOpen={openWorkspace} onHide={hide} onRemove={setRemoving} hidden={isHidden} />
        <AddWorkspaceMenu
          onOpenChange={setAddMenuOpen}
          sessions={sessions}
          hidden={hiddenRows()}
          open={ws.activo() ?? null}
          activeContext={ws.activoContexto()}
          tasksOf={tasksOf}
          badge={AttentionBadge}
          labelOf={(s) => taskLabel(s, true)}
          onOpen={openWorkspace}
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
      <ColumnFoot tools={props.tools} open={ws.activo() ?? null} activeContext={ws.activoContexto()} onSettings={props.onSettings} onReportarBug={props.onReportarBug} />
    </nav>
  );
}

/** Lo que avisa de algo, Configuración y el perfil, al pie de la columna. */
function ColumnFoot(props: {
  tools?: JSX.Element;
  onSettings: (panel?: string) => void;
  onReportarBug: () => void;
  open: string | null;
  activeContext?: string | null;
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
      <Pressable class={boton} aria-label={t("settings.title")} title={t("settings.title")} onClick={() => props.onSettings()}>
        <SettingsIcon size={17} aria-hidden="true" />
      </Pressable>
      <ProfileMenu open={props.open} context={props.activeContext} onAccount={() => props.onSettings("cuenta-danil")} onReportarBug={props.onReportarBug} />
    </div>
  );
}
