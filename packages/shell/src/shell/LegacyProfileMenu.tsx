import ChevronRight from "lucide-solid/icons/chevron-right";
import UserRound from "lucide-solid/icons/user-round";
import { createSignal, lazy, Show, Suspense, untrack } from "solid-js";
import { t } from "../../../../apps/desktop/src/lib/i18n";
import { capabilities } from "../../../host/src/platform";
import { canRedeemPromo } from "../../../../apps/desktop/src/lib/promo-role";
import { type Apariencia, apariencia } from "../../../../apps/desktop/src/lib/theme";
import { cn } from "../../../../apps/desktop/src/lib/utils";
import { ITEM_DE_MENU, Popover, PopoverAnchor, PopoverContent } from "../../../ui/src/Popover";
import { Pressable } from "../../../ui/src/Pressable";
import { ProfileThemeAndBug, ProfileWebSignOut } from "./ProfileMenuItems";

const PromoRedeem = lazy(() => import("./PromoRedeem"));

const DanilFooterEntry = lazy(() => import("./LegacyDanilFooterEntry"));
const OrganizationWatch = lazy(() => import("./OrganizationMenu").then((m) => ({ default: m.OrganizationWatch })));
const OrganizationSection = lazy(() => import("./OrganizationMenu").then((m) => ({ default: m.OrganizationSection })));


/** El avatar al pie de la columna: la cuenta, el tema, reportar un bug y, en la web, cerrar sesión. */
export default function ProfileMenu(props: {
  initialOpen?: boolean;
  onAccount: () => void;
  onReportarBug: () => void;
}) {
  const [open, setOpen] = createSignal(untrack(() => props.initialOpen ?? false));
  const [tema, setTema] = createSignal<Apariencia>(apariencia());
  const cuenta = () => capabilities().danilAccount || capabilities().accountProfile;
  const alternar = () => setOpen((o) => !o);
  const generico = () => (
    <Pressable
      class="grid size-8 place-items-center rounded-md text-neutral-500 outline-none hover:bg-neutral-200 hover:text-neutral-950 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-primary"
      aria-label={t("shell.profile.menu")}
      title={t("shell.profile.menu")}
      aria-expanded={open()}
      onClick={alternar}
    >
      <UserRound size={17} aria-hidden="true" />
    </Pressable>
  );

  return (
    <Popover
      open={open()}
      onOpenChange={(o) => {
        setOpen(o);
        // Cerrar sin elegir: el próximo 403 lo vuelve a abrir.
        if (!o) void capabilities().organizations?.().then((s) => s.dismiss());
      }}
      placement="right-end"
      gutter={8}
    >
      <PopoverAnchor class="relative grid size-8 place-items-center" data-profile-menu="">
        <Show when={capabilities().organizations}>
          {(load) => (
            <Suspense fallback={null}>
              <OrganizationWatch load={load()} onNeeded={() => setOpen(true)} />
            </Suspense>
          )}
        </Show>
        {/* Sin sesión de Danil la entrada no pinta a nadie; el avatar genérico sigue abriendo el menú. */}
        <Show when={cuenta()} fallback={generico()}>
          <Suspense fallback={generico()}>
            <DanilFooterEntry collapsed onOpen={alternar} fallback={generico()} />
          </Suspense>
        </Show>
      </PopoverAnchor>
      <PopoverContent class="w-72 p-1" aria-label={t("shell.profile.menu")}>
        <Show when={cuenta()}>
          <Pressable class={cn(ITEM_DE_MENU, "flex items-center gap-2")} onClick={() => { setOpen(false); props.onAccount(); }}>
            <span class="min-w-0 flex-1 truncate">{t("settings.nav.danil_account")}</span>
            <ChevronRight size={14} aria-hidden="true" class="shrink-0 text-neutral-500" />
          </Pressable>
          <div class="my-1 h-px bg-border" />
        </Show>
        <Show when={capabilities().organizations}>
          {(load) => (
            <Suspense fallback={null}>
              <OrganizationSection load={load()} onClose={() => setOpen(false)} />
            </Suspense>
          )}
        </Show>
        <Show when={canRedeemPromo(capabilities().webPromoRole) ? capabilities().webPromo : undefined}>{redeem => <Suspense fallback={null}><PromoRedeem redeem={redeem()} /></Suspense>}</Show>
        <ProfileThemeAndBug tema={tema} setTema={setTema} setOpen={setOpen} onReportarBug={props.onReportarBug} />
        <ProfileWebSignOut setOpen={setOpen} />
      </PopoverContent>
    </Popover>
  );
}
