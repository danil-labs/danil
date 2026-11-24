import { t } from "../../../ui/src/lib/i18n";
import { Input } from "../../../ui/src/Input";

/** Con más filas que estas, una lista de workspaces ofrece buscar. */
export const SEARCH_FROM = 7;

/** El buscador de las listas de workspaces del riel. */
export default function WorkspaceSearch(props: { value: string; onInput: (value: string) => void }) {
  return (
    <Input
      variant="plain"
      type="search"
      class="mx-2 mb-1 h-7 w-[calc(100%-1rem)] rounded-sm border border-border bg-surface px-2 text-xs outline-none focus-visible:bg-surface-muted"
      placeholder={t("shell.directory.search")}
      aria-label={t("shell.directory.search")}
      value={props.value}
      onInput={(e) => props.onInput(e.currentTarget.value)}
    />
  );
}
