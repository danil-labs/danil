import { createSignal, lazy, Show, Suspense } from "solid-js";
import { t } from "../../../../apps/desktop/src/lib/i18n";
import { capabilities } from "../../../host/src/platform";
import { type Apariencia, apariencia } from "../../../ui/src/lib/theme";
import { Popover, PopoverAnchor, PopoverContent } from "../../../ui/src/Popover";
import DanilFooterEntry from "./DanilFooterEntry";
import { EmptySessionSignOut } from "./EmptySessionSignOut";
import { GroupOrganizationWatch } from "./GroupOrganizationWatch";
import { noteWebAccountMode, usesGroupAccounts } from "./session-menu-mode";
import { ProfileThemeAndBug, ProfileWebSignOut } from "./ProfileMenuItems";

const LegacyProfileMenu = lazy(() => import("./LegacyProfileMenu"));





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
        <ProfileThemeAndBug tema={tema} setTema={setTema} setOpen={setOpen} onReportarBug={props.onReportarBug} />
        <Show when={capabilities().nativeWindow}><EmptySessionSignOut open={props.open ?? null} onDone={() => setOpen(false)} /></Show>
        <ProfileWebSignOut setOpen={setOpen} />
      </PopoverContent>
    </Popover>
    </Show>
  );
}
