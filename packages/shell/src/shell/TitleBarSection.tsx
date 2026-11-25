import FolderPlus from "lucide-solid/icons/folder-plus";
import PanelLeftClose from "lucide-solid/icons/panel-left-close";
import PanelLeftOpen from "lucide-solid/icons/panel-left-open";
import Search from "lucide-solid/icons/search";
import { lazy, Show, Suspense, type JSX } from "solid-js";
import { t } from "../../../ui/src/lib/i18n";
import { Button } from "../../../ui/src/Button";
import { BotonConAtajo } from "../../../ui/src/Shortcut";
import GitHubStar from "./GitHubStar";
import TitleBar from "./TitleBar";

const RailOrganizerMenu = lazy(() =>
  import("./RailOrganizerMenu").then((m) => ({ default: m.RailOrganizerMenu })),
);

export function TitleBarSection(props: {
  border: number | null;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  spaceMenu: JSX.Element;
  sidebarExtra: JSX.Element;
  searchOpen: boolean;
  onSearch: () => void;
  onAddProject: () => void;
  tabs: JSX.Element;
}) {
  return (
    <TitleBar
      bordeDeLaBarra={props.sidebarCollapsed ? null : props.border}
      izquierda={<>
        <BotonConAtajo
          variant="ghost"
          size="icon"
          class="size-[30px] shrink-0 text-neutral-500"
          onClick={props.onToggleSidebar}
          aria-pressed={!props.sidebarCollapsed}
          aria-label={props.sidebarCollapsed ? t("shell.sidebar.show") : t("shell.sidebar.hide")}
          accion="sidebar"
          etiqueta={props.sidebarCollapsed ? t("shell.sidebar.show") : t("shell.sidebar.hide")}
        >
          <Show when={props.sidebarCollapsed} fallback={<PanelLeftClose size={16} />}><PanelLeftOpen size={16} /></Show>
        </BotonConAtajo>
        {props.spaceMenu}
        {props.sidebarExtra}
      </>}
      finDeIzquierda={<>
        <BotonConAtajo
          variant="ghost"
          size="icon"
          class="size-[30px] shrink-0 text-neutral-500"
          data-global-search-open=""
          aria-expanded={props.searchOpen}
          aria-label={t("search.open")}
          accion="search"
          etiqueta={t("search.open")}
          onClick={props.onSearch}
        >
          <Search size={15} aria-hidden="true" />
        </BotonConAtajo>
        <Button
          variant="ghost"
          size="icon"
          class="size-[30px] shrink-0 text-neutral-500"
          data-add-project=""
          aria-label={t("projects.add.title")}
          title={t("projects.add.title")}
          onClick={props.onAddProject}
        >
          <FolderPlus size={15} aria-hidden="true" />
        </Button>
        <Suspense>
          <RailOrganizerMenu />
        </Suspense>
      </>}
      centro={props.tabs}
      derecha={<GitHubStar />}
    />
  );
}
