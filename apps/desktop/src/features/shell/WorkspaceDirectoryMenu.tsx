import { type DirectoryEntry, groupDirectory } from "@terminus/computers";
import Link from "lucide-solid/icons/link";
import Plus from "lucide-solid/icons/plus";
import Pin from "lucide-solid/icons/pin";
import PinOff from "lucide-solid/icons/pin-off";
import { createSignal, For, Show } from "solid-js";
import { t } from "../../lib/i18n";
import { directoryErrorText } from "./directory-errors";
import { cn } from "../../lib/utils";
import { ITEM_DE_MENU } from "../../ui/Popover";
import { createWorkspaces } from "../settings/workspaces-store";
import {
  createForActiveWorkspace,
  directory,
  enterable,
  enterDirectoryEntry,
  linkableAccounts,
  linkActiveWorkspace,
  togglePin,
  unlinkedActive,
} from "./workspace-directory";

/** Desde aquí se entra a cualquier workspace; la barra solo muestra los fijados. */
export default function WorkspaceDirectoryMenu(props: { onClose: () => void; onOpenAgents?: () => void }) {
  const ws = createWorkspaces();
  const [query, setQuery] = createSignal("");
  const [linking, setLinking] = createSignal<string | null>(null);
  const [linkError, setLinkError] = createSignal<string | null>(null);
  const linkable = () => new Set(linkableAccounts(ws.activo()).map((e) => e.key));
  const link = async (entry: DirectoryEntry) => {
    const active = ws.activo();
    if (!active || linking()) return;
    setLinking(entry.key);
    setLinkError(null);
    const code = await linkActiveWorkspace(active, entry);
    setLinking(null);
    if (code) {
      setLinkError(code);
      return;
    }
    void ws.cargar();
  };
  const entries = () => directory()?.workspaces ?? [];
  const visible = () => {
    const needle = query().trim().toLocaleLowerCase();
    return needle ? entries().filter((e) => e.name.toLocaleLowerCase().includes(needle)) : entries();
  };
  const open = (entry: DirectoryEntry) => {
    props.onClose();
    enterDirectoryEntry(entry, ws, props.onOpenAgents);
  };
  const [creating, setCreating] = createSignal(false);
  const create = async () => {
    const active = ws.activo();
    if (!active || creating()) return;
    setCreating(true);
    setLinkError(null);
    const code = await createForActiveWorkspace(active);
    setCreating(false);
    if (code) {
      setLinkError(code);
      return;
    }
    void ws.cargar();
  };
  const title = (group: ReturnType<typeof groupDirectory>[number]) => {
    if (group.kind === "organization") return group.name;
    if (group.kind === "personal") return t("shell.directory.personal");
    return group.kind === "support" ? t("shell.directory.support") : t("shell.directory.unlinked");
  };
  return (
    <Show when={entries().length > 0}>
      <p class="m-0 px-2 pt-1 pb-1 text-caption font-medium text-neutral-500">{t("shell.directory.title")}</p>
      <Show when={entries().length > 6}>
        <input
          type="search"
          class="mx-2 mb-1 h-7 w-[calc(100%-1rem)] rounded-sm border border-border bg-surface px-2 text-xs outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-primary"
          placeholder={t("shell.directory.search")}
          aria-label={t("shell.directory.search")}
          value={query()}
          onInput={(e) => setQuery(e.currentTarget.value)}
        />
      </Show>
      <div class="max-h-64 overflow-y-auto" data-workspace-directory="">
        <For each={groupDirectory(visible())}>
          {(group) => (
            <>
              <p class="m-0 truncate px-2 pt-1 text-caption text-neutral-500">{title(group)}</p>
              <For each={group.entries}>
                {(entry) => (
                  <div class="flex items-center gap-0.5" data-directory-entry={entry.key}>
                    <button
                      type="button"
                      class={cn(ITEM_DE_MENU, "min-w-0 flex-1 truncate")}
                      disabled={!enterable(entry, ws)}
                      title={entry.name}
                      onClick={() => open(entry)}
                    >
                      {entry.name || t("shell.directory.unnamed")}
                    </button>
                    <Show when={linkable().has(entry.key)}>
                      <button
                        type="button"
                        class="grid size-7 shrink-0 place-items-center rounded-sm text-neutral-500 outline-none hover:bg-neutral-200 hover:text-neutral-950 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50"
                        aria-label={t("shell.directory.link", { name: entry.name, workspace: ws.actual()?.name ?? "" })}
                        title={t("shell.directory.link", { name: entry.name, workspace: ws.actual()?.name ?? "" })}
                        disabled={linking() !== null}
                        data-directory-link={entry.key}
                        onClick={() => void link(entry)}
                      >
                        <Link size={13} aria-hidden="true" />
                      </button>
                    </Show>
                    <Show when={!entry.support}>
                      <button
                        type="button"
                        class="grid size-7 shrink-0 place-items-center rounded-sm text-neutral-500 outline-none hover:bg-neutral-200 hover:text-neutral-950 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-primary"
                        aria-label={entry.pin === null ? t("shell.directory.pin", { name: entry.name }) : t("shell.directory.unpin", { name: entry.name })}
                        aria-pressed={entry.pin !== null}
                        onClick={() => void togglePin(entry)}
                      >
                        {entry.pin === null ? <Pin size={13} aria-hidden="true" /> : <PinOff size={13} aria-hidden="true" />}
                      </button>
                    </Show>
                  </div>
                )}
              </For>
            </>
          )}
        </For>
      </div>
      <Show when={unlinkedActive(ws.activo())}>
        <button
          type="button"
          class={cn(ITEM_DE_MENU, "mt-1 flex items-center gap-2")}
          disabled={creating()}
          data-directory-create=""
          onClick={() => void create()}
        >
          <Plus size={13} aria-hidden="true" class="shrink-0 text-neutral-500" />
          <span class="min-w-0 flex-1 truncate">{t("shell.directory.create", { workspace: ws.actual()?.name ?? "" })}</span>
        </button>
      </Show>
      <Show when={linkError()}>
        {(code) => (
          <p class="m-0 px-2 pt-1 text-caption text-error-strong" role="alert">
            {directoryErrorText(code())}
          </p>
        )}
      </Show>
      <Show when={directory()?.truncated}>
        <p class="m-0 px-2 pt-1 text-caption text-neutral-500">{t("shell.directory.truncated")}</p>
      </Show>
      {/* Sin directorio (el escritorio sin sesión de la ventana) el menú no deja un separador suelto. */}
      <div class="my-1 h-px bg-border" />
    </Show>
  );
}
