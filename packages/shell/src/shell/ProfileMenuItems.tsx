import Bug from "lucide-solid/icons/bug";
import LogOut from "lucide-solid/icons/log-out";
import { type Accessor, For, Show } from "solid-js";
import { t } from "../../../../apps/desktop/src/lib/i18n";
import { invoke } from "../../../engine-client/src/client.ts";
import { capabilities } from "../../../host/src/platform";
import { type Apariencia, elegirApariencia } from "../../../../apps/desktop/src/lib/theme";
import { cn } from "../../../../apps/desktop/src/lib/utils";
import { ITEM_DE_MENU } from "../../../ui/src/Popover";
import { Pressable } from "../../../ui/src/Pressable";

// Las entradas comunes del menú del avatar (ProfileMenu y LegacyProfileMenu): tema, reportar un bug y cerrar sesión en la web.

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

/** El tema y reportar un bug. */
export function ProfileThemeAndBug(props: {
  tema: Accessor<Apariencia>;
  setTema: (a: Apariencia) => void;
  setOpen: (o: boolean) => void;
  onReportarBug: () => void;
}) {
  const { tema, setTema, setOpen } = props;
  return (
    <>
      <p class="m-0 px-2 pt-1 pb-1 text-caption font-medium text-neutral-500">{t("shell.profile.theme")}</p>
      <div role="radiogroup" aria-label={t("shell.profile.theme")} class={cn(SEGMENTO, "mx-2 mb-2")}>
        <For each={TEMAS}>
          {(a) => (
            <Pressable
              role="radio"
              aria-checked={tema() === a}
              class={cn(OPCION, tema() === a && ELEGIDA)}
              onClick={() => setTema(elegirApariencia(a))}
            >
              {nombreDeTema(a)}
            </Pressable>
          )}
        </For>
      </div>
      <div class="my-1 h-px bg-border" />
      <p class="m-0 flex items-center gap-1.5 px-2 pt-1 pb-1 text-caption font-medium text-error-strong">
        <Bug size={12} aria-hidden="true" />
        {t("usage.bug_report")}
      </p>
      <Pressable class={ITEM_DE_MENU} onClick={() => { setOpen(false); props.onReportarBug(); }}>
        {t("usage.bug_report.ask_agent")}
      </Pressable>
      <Pressable
        class={ITEM_DE_MENU}
        onClick={() => {
          setOpen(false);
          void invoke("site_open_external", { url: BUG_REPORT_URL }).catch(() => {});
        }}
      >
        {t("usage.bug_report.open_web")}
      </Pressable>
    </>
  );
}

/** Cerrar sesión, solo en la web. */
export function ProfileWebSignOut(props: { setOpen: (o: boolean) => void }) {
  const { setOpen } = props;
  return (
    <Show when={capabilities().webAccounts}>
      {(cuentas) => (
        <>
          <div class="my-1 h-px bg-border" />
          <Pressable class={cn(ITEM_DE_MENU, "flex items-center gap-2")} data-sign-out="" onClick={() => { setOpen(false); cuentas().signOut(); }}>
            <LogOut size={14} aria-hidden="true" class="shrink-0 text-neutral-500" />
            <span class="min-w-0 flex-1 truncate">{t("danil.account.sign_out")}</span>
          </Pressable>
        </>
      )}
    </Show>
  );
}
