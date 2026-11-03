import { type DirectoryEntry, groupDirectory } from "@terminus/computers";
import Link from "lucide-solid/icons/link";
import Pin from "lucide-solid/icons/pin";
import PinOff from "lucide-solid/icons/pin-off";
import { createSignal, For, Show } from "solid-js";
import { t } from "../../lib/i18n";
import { cn } from "../../lib/utils";
import { ITEM_DE_MENU } from "../../ui/Popover";
import { createWorkspaces } from "../settings/workspaces-store";
import { directory, linkableAccounts, linkActiveWorkspace, setAgentsWorkspace, togglePin } from "./workspace-directory";

/** Desde aquí se entra a cualquier workspace; la barra solo muestra los fijados. */
export default function WorkspaceDirectoryMenu(props: { onClose: () => void; onOpenAgents?: () => void; localOnly?: boolean }) {
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
  const local = (entry: DirectoryEntry) => entry.capabilities.terminus && (ws.lista() ?? []).some((w) => w.id === entry.workspace_id);
  const canOpen = (entry: DirectoryEntry) =>
    local(entry) || (!props.localOnly && entry.capabilities.agents && Boolean(props.onOpenAgents));
  const open = (entry: DirectoryEntry) => {
    props.onClose();
    if (local(entry)) {
      setAgentsWorkspace(null);
      void ws.cambiarA(entry.workspace_id as string);
      return;
    }
    if (!canOpen(entry)) return;
    setAgentsWorkspace(entry.key);
    props.onOpenAgents?.();
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
                      disabled={!canOpen(entry)}
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
      <Show when={linkError()}>
        <p class="m-0 px-2 pt-1 text-caption text-error-strong" role="alert">
          {linkError() === "not_account_admin"
            ? t("shell.directory.linkNotAdmin")
            : linkError() === "workspace_already_linked" || linkError() === "danil_workspace_taken"
              ? t("shell.directory.linkTaken")
              : t("shell.directory.linkFailed")}
        </p>
      </Show>
      <Show when={directory()?.truncated}>
        <p class="m-0 px-2 pt-1 text-caption text-neutral-500">{t("shell.directory.truncated")}</p>
      </Show>
    </Show>
  );
}
