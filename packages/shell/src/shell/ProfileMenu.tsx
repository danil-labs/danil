import { createSignal, lazy, Show, Suspense } from "solid-js";
import { t } from "../../../ui/src/lib/i18n";
import { capabilities } from "../../../host/src/platform";
import { type Apariencia, apariencia } from "../../../ui/src/lib/theme";
import { Popover, PopoverAnchor, PopoverContent } from "../../../ui/src/Popover";
import DanilFooterEntry from "./DanilFooterEntry";
import { EmptySessionSignOut } from "./EmptySessionSignOut";
import { GroupOrganizationWatch } from "./GroupOrganizationWatch";
import { noteWebAccountMode, usesGroupAccounts } from "./session-menu-mode";
import { ProfileThemeAndBug, ProfileWebSignOut } from "./ProfileMenuItems";

const LegacyProfileMenu = lazy(() => import("./LegacyProfileMenu"));
const OrganizationHarnessLink = lazy(() => import("./OrganizationHarnessLink"));

/** Las preferencias del equipo, el Harness de la organización y, en la web, sus controles de navegador. */
export default function ProfileMenu(props: {
  onAccount: () => void;
  onReportarBug: () => void;
  /** El workspace abierto: también tiene cuadro aunque no esté agregado. */
  open?: string | null;
  /** El contexto de sesión del workspace abierto, si viene de una cuenta de Danil. */
  context?: string | null;
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
        <Suspense fallback={null}>
          <OrganizationHarnessLink workspace={props.open} context={props.context} onNavigate={() => setOpen(false)} />
        </Suspense>
        <Show when={capabilities().nativeWindow}><EmptySessionSignOut open={props.open ?? null} onDone={() => setOpen(false)} /></Show>
        <ProfileWebSignOut setOpen={setOpen} />
      </PopoverContent>
    </Popover>
    </Show>
  );
}
