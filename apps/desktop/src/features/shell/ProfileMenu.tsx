import Bug from "lucide-solid/icons/bug";
import LogOut from "lucide-solid/icons/log-out";
import { createSignal, For, lazy, Show, Suspense } from "solid-js";
import { t } from "../../lib/i18n";
import { invoke } from "../../engine/client.ts";
import { capabilities } from "../../lib/platform";
import { type Apariencia, apariencia, elegirApariencia } from "../../lib/theme";
import { cn } from "../../lib/utils";
import { ITEM_DE_MENU, Popover, PopoverAnchor, PopoverContent } from "../../ui/Popover";
import DanilFooterEntry from "./DanilFooterEntry";
import { EmptySessionSignOut } from "./EmptySessionSignOut";
import { GroupOrganizationWatch } from "./GroupOrganizationWatch";
import { noteWebAccountMode, usesGroupAccounts } from "./session-menu-mode";

const LegacyProfileMenu = lazy(() => import("./LegacyProfileMenu"));




const BUG_REPORT_URL = "https://github.com/danil-labs/danil/issues/new?template=bug_report.yml";

const TEMAS: Apariencia[] = ["claro", "oscuro", "sistema"];
function nombreDeTema(a: Apariencia): string {
  switch (a) {
    case "claro":
      return t("shell.theme.name.light");
    case "oscuro":
      return t("shell.theme.name.dark");
    case "sistema":
      return t("shell.theme.name.system");
  }
}

const SEGMENTO = "flex min-w-0 gap-0.5 rounded-md bg-surface-muted p-0.5";
const OPCION = "h-6 min-w-0 flex-1 truncate rounded-sm px-2 text-xs text-neutral-500 outline-none hover:text-neutral-950 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-primary";
const ELEGIDA = "bg-surface-raised font-semibold text-neutral-950 shadow-sm";

/** Las preferencias del equipo y, en la web, sus controles de navegador. */
export default function ProfileMenu(props: {
  onAccount: () => void;
  onReportarBug: () => void;
  /** El workspace abierto: también tiene cuadro aunque no esté agregado. */
  open?: string | null;
}) {
  const [open, setOpen] = createSignal(false);
  const [tema, setTema] = createSignal<Apariencia>(apariencia());
  const alternar = () => {
    setOpen((o) => !o);
    if (open() && !capabilities().nativeWindow) void capabilities().groupAccount?.current().then(noteWebAccountMode);
  };

  return (
    <Show when={usesGroupAccounts()} fallback={<Suspense fallback={null}><LegacyProfileMenu {...props} initialOpen={open()} /></Suspense>}>
    <GroupOrganizationWatch />
    <Popover
      open={open()}
      onOpenChange={setOpen}
      placement="right-end"
      gutter={8}
    >
      <PopoverAnchor class="relative grid size-8 place-items-center" data-profile-menu="">
        <DanilFooterEntry collapsed onOpen={alternar} />
      </PopoverAnchor>
      <PopoverContent class="w-72 p-1" aria-label={t("shell.profile.menu")}>
        <p class="m-0 px-2 pt-1 pb-1 text-caption font-medium text-neutral-500">{t("shell.profile.theme")}</p>
        <div role="radiogroup" aria-label={t("shell.profile.theme")} class={cn(SEGMENTO, "mx-2 mb-2")}>
          <For each={TEMAS}>
            {(a) => (
              <button
                type="button"
                role="radio"
                aria-checked={tema() === a}
                class={cn(OPCION, tema() === a && ELEGIDA)}
                onClick={() => setTema(elegirApariencia(a))}
              >
                {nombreDeTema(a)}
              </button>
            )}
          </For>
        </div>
        <div class="my-1 h-px bg-border" />
        <p class="m-0 flex items-center gap-1.5 px-2 pt-1 pb-1 text-caption font-medium text-error-strong">
          <Bug size={12} aria-hidden="true" />
          {t("usage.bug_report")}
        </p>
        <button type="button" class={ITEM_DE_MENU} onClick={() => { setOpen(false); props.onReportarBug(); }}>
          {t("usage.bug_report.ask_agent")}
        </button>
        <button
          type="button"
          class={ITEM_DE_MENU}
          onClick={() => {
            setOpen(false);
            void invoke("site_open_external", { url: BUG_REPORT_URL }).catch(() => {});
          }}
        >
          {t("usage.bug_report.open_web")}
        </button>
        <Show when={capabilities().nativeWindow}><EmptySessionSignOut open={props.open ?? null} onDone={() => setOpen(false)} /></Show>
        <Show when={capabilities().webAccounts}>
          {(cuentas) => (
            <>
              <div class="my-1 h-px bg-border" />
              <button type="button" class={cn(ITEM_DE_MENU, "flex items-center gap-2")} data-sign-out="" onClick={() => { setOpen(false); cuentas().signOut(); }}>
                <LogOut size={14} aria-hidden="true" class="shrink-0 text-neutral-500" />
                <span class="min-w-0 flex-1 truncate">{t("danil.account.sign_out")}</span>
              </button>
            </>
          )}
        </Show>
      </PopoverContent>
    </Popover>
    </Show>
  );
}
