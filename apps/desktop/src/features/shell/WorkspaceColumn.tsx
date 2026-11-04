import Plus from "lucide-solid/icons/plus";
import SettingsIcon from "lucide-solid/icons/settings";
import { children, createEffect, createSignal, For, type JSX, lazy, onCleanup, Show, Suspense } from "solid-js";
import { t } from "../../lib/i18n";
import { createNavigationReorder } from "../../lib/navigation-order";
import { KeyedList } from "../../ui/KeyedList";
import { cn } from "../../lib/utils";
import { capabilities, type OtherAccount, type OtherWorkspace } from "../../lib/platform";
import { generacionDeLogo, urlDeLogo } from "./logo-src";
import { ITEM_DE_MENU, Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "../../ui/Popover";
import { RETARDO_TOOLTIP, TooltipContent, TooltipRoot, TooltipTrigger } from "../../ui/Tooltip";
import { taskLabel } from "../projects/TaskStatus";
import { SignalDot, taskSignalTone } from "../../ui/SignalDot";
import { cerrarConEscape, createWorkspaces, type Workspace } from "../settings/workspaces-store";
import { topState, type AttentionState, type WorkspaceAttention } from "./attention";
import KeepAwake from "./KeepAwake";
import ProfileMenu from "./ProfileMenu";
import { workspaceBar } from "./workspace-directory";

const WorkspaceDirectoryMenu = lazy(() => import("./WorkspaceDirectoryMenu"));

/** Las iniciales de las dos primeras palabras; una sola palabra da una letra. */
export function monogram(name: string) {
  const words = name.trim().split(/[\s\-_.]+/).filter(Boolean);
  return words.slice(0, 2).map((word) => [...word][0] ?? "").join("").toUpperCase() || "?";
}

/** El logo del workspace, o sus iniciales si no hay imagen o todavía no carga. */
/** `id`: en la web, el logo de un workspace de la cuenta sale de la cuenta (`urlDeLogo`). */
export function MarcaDeWorkspace(props: { id?: string; name: string; logo?: string | null; load?: () => Promise<string | null> }) {
  const [url, setUrl] = createSignal<string | null>(null);
  createEffect(() => {
    // Un workspace de otra cuenta trae su propio lector, con el token de su cuenta.
    if (props.load) {
      let vivo = true;
      onCleanup(() => {
        vivo = false;
      });
      void props.load().then((siguiente) => {
        if (vivo) setUrl(siguiente);
      }, () => undefined);
      return;
    }
    const path = props.logo ?? null;
    const workspace = props.id ?? null;
    const gen = generacionDeLogo();
    if (!path && !workspace) {
      setUrl(null);
      return;
    }
    let vivo = true;
    onCleanup(() => {
      vivo = false;
    });
    void urlDeLogo(path, workspace).then((siguiente) => {
      if (vivo && generacionDeLogo() === gen) setUrl(siguiente);
    });
  });
  return (
    <Show when={url()} fallback={<>{monogram(props.name)}</>}>
      {(src) => <img src={src()} alt="" draggable={false} class="absolute inset-0 size-full object-cover" />}
    </Show>
  );
}

/** Lo más urgente de un workspace: la señal común sobre un disco de superficie. */
export function AttentionBadge(props: { state: AttentionState; class?: string }) {
  return (
    <span data-attention-badge={props.state} class={cn("grid size-3 shrink-0 place-items-center rounded-full bg-surface", props.class)}>
      <SignalDot tone={taskSignalTone(props.state)} />
    </span>
  );
}

/** Cambiar de workspace con un clic y ver, sin entrar, qué espera en cada uno. */

export default function WorkspaceColumn(props: {
  attention: WorkspaceAttention[];
  onManage: () => void;
  /** Abrió desde el menú un workspace que solo tiene agentes. */
  onOpenAgents?: () => void;
  /** Ajustes, en su sección si se da. */
  onSettings: (panel?: string) => void;
  onReportarBug: () => void;
  /** Archivadas, Conexiones, Puertos y Almacenamiento: lo que avisa de algo. */
  tools?: JSX.Element;
}) {
  const ws = createWorkspaces();
  // Con fijados, la barra muestra esos y el abierto; la persona cambia a cualquier otro desde el menú.
  const visibles = () => {
    const bar = workspaceBar(ws.activo() ?? null);
    return (ws.lista() ?? []).filter(w => !bar || bar.has(w.id));
  };
  let list: HTMLDivElement | undefined;
  const reorder = createNavigationReorder({
    scope: () => ws.activo() ?? "",
    list: () => list,
    attribute: "data-workspace-tile",
    axis: "y",
    ids: () => visibles().map(w => w.id),
    // Los que la barra no muestra conservan su lugar relativo, al final.
    save: (ids) => ws.reorder([...ids, ...(ws.lista() ?? []).map(w => w.id).filter(id => !ids.includes(id))]),
  });
  const [menuOf, setMenuOf] = createSignal<string | null>(null);
  cerrarConEscape(() => menuOf() !== null, () => setMenuOf(null));

  const stateOf = (id: string) =>
    topState(props.attention.find((w) => w.workspace === id)?.tasks ?? []);

  const Tile = (p: { w: Workspace }) => {
    const active = () => p.w.id === ws.activo();
    const state = () => stateOf(p.w.id);
    const label = () => {
      const s = state();
      return s
        ? t("shell.workspaces.tile_with_state", { name: p.w.name, state: taskLabel(s, true) })
        : p.w.name;
    };
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
              class={cn(
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
        </PopoverContent>
      </Popover>
    );
  };

  // Las otras cuentas de Danil de este navegador (solo la web): sus workspaces van debajo, por cuenta.
  const accounts = capabilities().webAccounts;
  const others = () => accounts?.others() ?? [];
  const [accountMenu, setAccountMenu] = createSignal<string | null>(null);
  cerrarConEscape(() => accountMenu() !== null, () => setAccountMenu(null));

  /** La cuenta de un grupo: la inicial de su correo; su menú la quita o vuelve a entrar. */
  const AccountHeader = (p: { id: string; email: string | null; extra: boolean; signedIn: boolean; stale?: boolean }) => {
    const label = () => t("shell.workspaces.account", { email: p.email ?? "" });
    return (
      <Popover open={accountMenu() === p.id} onOpenChange={(open) => setAccountMenu(open ? p.id : null)} placement="right-start" gutter={4}>
        <PopoverAnchor class="w-full">
          <TooltipRoot openDelay={RETARDO_TOOLTIP} placement="right" gutter={6} disabled={accountMenu() === p.id}>
            <TooltipTrigger
              as="button"
              type="button"
              data-account-header={p.id}
              class="mt-2 mb-0.5 flex w-full items-center gap-1 px-3 text-left outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-primary"
              aria-label={label()}
              onClick={() => setAccountMenu(p.id)}
            >
              <span aria-hidden="true" class="grid size-4 shrink-0 place-items-center rounded-full bg-neutral-200 text-[0.5625rem] font-semibold text-neutral-700">
                {monogram(p.email ?? "?").slice(0, 1)}
              </span>
              <span aria-hidden="true" class="h-px flex-1 bg-border" />
            </TooltipTrigger>
            <TooltipContent>{p.email}</TooltipContent>
          </TooltipRoot>
        </PopoverAnchor>
        <PopoverContent role="menu" class="w-64 p-1">
          <p class="m-0 truncate px-2 pt-1 pb-1 text-caption font-medium text-neutral-500">{p.email}</p>
          <Show when={p.stale && p.signedIn}>
            <p class="m-0 px-2 pb-1 text-caption text-neutral-500">{t("shell.workspaces.stale")}</p>
          </Show>
          <Show when={!p.signedIn}>
            <button role="menuitem" class={ITEM_DE_MENU} onClick={() => (setAccountMenu(null), accounts?.add(p.email))}>
              {t("shell.workspaces.sign_in_again")}
            </button>
          </Show>
          <Show when={p.extra}>
            <button
              role="menuitem"
              class={ITEM_DE_MENU}
              onClick={() => {
                setAccountMenu(null);
                if (window.confirm(t("shell.workspaces.remove_confirm", { email: p.email ?? "" }))) void accounts?.remove(p.id);
              }}
            >
              {t("shell.workspaces.remove_account")}
            </button>
          </Show>
        </PopoverContent>
      </Popover>
    );
  };

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
          onClick={() => (p.account.signedIn ? accounts?.open(p.w.id) : accounts?.add(p.account.email))}
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
          <AccountHeader id={accounts!.current.user_id} email={accounts!.current.email} extra={accounts!.current.extra} signedIn />
        </Show>
        <KeyedList each={visibles()} by={w => w.id}>{w => <Tile w={w()} />}</KeyedList>
        <AddWorkspaceMenu onOpenAgents={props.onOpenAgents} />
        <For each={others()}>
          {(account) => (
            <>
              <AccountHeader id={account.user_id} email={account.email} extra={account.extra} signedIn={account.signedIn} stale={account.stale} />
              <For each={account.workspaces}>{(w) => <OtherTile w={w} account={account} />}</For>
            </>
          )}
        </For>
      </div>
      <ColumnFoot onOpenAgents={props.onOpenAgents} tools={props.tools} onSettings={props.onSettings} onReportarBug={props.onReportarBug} />
    </nav>
  );
}

/** El «+» del riel: crear uno nuevo o abrir el directorio para agregar uno existente. */
function AddWorkspaceMenu(props: { onOpenAgents?: () => void }) {
  const [open, setOpen] = createSignal(false);
  const [step, setStep] = createSignal<"menu" | "directory">("menu");
  const close = () => {
    setOpen(false);
    setStep("menu");
  };
  return (
    <Popover
      open={open()}
      onOpenChange={(value) => {
        if (!value) setStep("menu");
        setOpen(value);
      }}
      placement="right-start"
      gutter={4}
    >
      <PopoverTrigger
        type="button"
        class="mt-1 grid size-8 shrink-0 place-items-center rounded-md border border-dashed border-neutral-500 text-neutral-500 outline-none hover:bg-neutral-200 hover:text-neutral-950 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        aria-label={t("shell.workspaces.add")}
        title={t("shell.workspaces.add")}
      >
        <Plus size={16} aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent role={step() === "menu" ? "menu" : undefined} class="w-64 p-1">
        <Show
          when={step() === "menu"}
          fallback={
            <Suspense fallback={null}>
              <WorkspaceDirectoryMenu
                onClose={close}
                onOpenAgents={() => {
                  close();
                  props.onOpenAgents?.();
                }}
              />
            </Suspense>
          }
        >
          <button
            type="button"
            role="menuitem"
            class={ITEM_DE_MENU}
            onClick={() => {
              close();
              window.dispatchEvent(new CustomEvent("harness:new-workspace"));
            }}
          >
            {t("shell.workspaces.create")}
          </button>
          <Show when={capabilities().workspaceDirectory}>
            <button type="button" role="menuitem" class={ITEM_DE_MENU} onClick={() => setStep("directory")}>
              {t("shell.workspaces.add_existing")}
            </button>
          </Show>
        </Show>
      </PopoverContent>
    </Popover>
  );
}

/** Lo que avisa de algo, Configuración y el perfil, al pie de la columna. */
function ColumnFoot(props: {
  onOpenAgents?: () => void;
  tools?: JSX.Element;
  onSettings: (panel?: string) => void;
  onReportarBug: () => void;
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
      <ProfileMenu onOpenAgents={props.onOpenAgents} onAccount={() => props.onSettings("cuenta-danil")} onReportarBug={props.onReportarBug} />
    </div>
  );
}
