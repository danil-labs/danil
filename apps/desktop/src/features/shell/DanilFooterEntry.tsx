import { SignalDot } from "../../ui/SignalDot";
import CircleUserRound from "lucide-solid/icons/circle-user-round";
import { createEffect, createSignal, type JSX, on, onCleanup, onMount, Show } from "solid-js";
import { t } from "../../lib/i18n";
import { capabilities } from "../../lib/platform";
import { cn } from "../../lib/utils";
import { engineAccountProfile, profileFromStatus } from "../settings/account-engine";
import { type AccountProfile, type AccountProfileSource, PROFILE_CHANGED } from "../settings/account-profile";
import { AccountAvatar, createAccountIdentity } from "../settings/AccountIdentity";
import { createDanilAccounts, type DanilAccounts } from "../settings/danil-accounts";
import { createDanilSession } from "../settings/danil-session";
import { sessionForWorkspace, statusOf } from "../settings/danil-sessions";

/**
 * La cuenta de Danil al pie de la barra lateral: la persona (foto o iniciales,
 * nombre) con su punto de en línea, solo con sesión. Sin sesión no pinta nada:
 * se inicia en Configuración. Con una sesión por cuenta, la del workspace
 * abierto. Chunk aparte; sin el flujo en el motor no pinta nada. En la web la
 * persona viene de su sesión. `fallback` ocupa su sitio mientras no hay persona.
 */
type EntryProps = { collapsed: boolean; onOpen: () => void; fallback?: JSX.Element };

export default function DanilFooterEntry(props: EntryProps) {
  const web = capabilities().accountProfile;
  return web ? <WebEntry {...props} source={web} /> : <MachineEntry {...props} />;
}

function MachineEntry(props: EntryProps) {
  const accounts = createDanilAccounts({ workspace: "active" });
  return (
    <Show when={accounts.sessions() !== undefined} fallback={props.fallback}>
      <Show when={accounts.connected().length > 0} fallback={<SingleEntry {...props} />}>
        <WorkspaceEntry {...props} accounts={accounts} />
      </Show>
    </Show>
  );
}

/** La cuenta del workspace abierto, si tiene sesión aquí; si no es de ninguna o no la tiene, nada. */
function WorkspaceEntry(props: EntryProps & { accounts: DanilAccounts }) {
  const session = () => sessionForWorkspace(props.accounts.sessions(), props.accounts.of());
  const [profile, setProfile] = createSignal<AccountProfile | null>(null);
  createEffect(
    on(session, (s) => {
      if (!s) return setProfile(null);
      void profileFromStatus(statusOf(s)).then((p) => {
        if (session() === s) setProfile(p);
      });
    }),
  );
  return (
    <Show when={session()} fallback={props.fallback}>
      {(s) => (
        <Entry
          {...props}
          online={s().online}
          profile={profile() ?? { name: s().name, email: s().email, photo: null, source: null }}
        />
      )}
    </Show>
  );
}

/** Un motor sin sesiones por cuenta, o ninguna sesión todavía. */
function SingleEntry(props: EntryProps) {
  const session = createDanilSession({ oneClick: false });
  const identity = createAccountIdentity(engineAccountProfile, session.status, { refresh: false });
  return (
    <Show when={session.status()?.state === "connected"} fallback={props.fallback}>
      <Entry
        {...props}
        online={Boolean(session.status()?.online)}
        profile={identity.profile() ?? { name: null, email: session.status()?.email ?? null, photo: null, source: null }}
      />
    </Show>
  );
}

function WebEntry(props: EntryProps & { source: AccountProfileSource }) {
  const [profile, setProfile] = createSignal<AccountProfile | null>(null);
  // Configuración avisa cuando cambia la foto: el pie no espera a recargar.
  onMount(() => {
    const read = () => void props.source.read().then(setProfile).catch(() => {});
    read();
    window.addEventListener(PROFILE_CHANGED, read);
    onCleanup(() => window.removeEventListener(PROFILE_CHANGED, read));
  });
  return (
    <Show when={profile()} fallback={props.fallback}>
      <Entry {...props} online={null} profile={profile()} />
    </Show>
  );
}

function Entry(props: {
  collapsed: boolean;
  onOpen: () => void;
  /** null: sin punto (la web no tiene sesión de máquina). */
  online: boolean | null;
  profile: AccountProfile | null;
}) {
  const quien = () => props.profile?.name || props.profile?.email || t("danil.account.your_account");
  const titulo = () => {
    if (props.online === null) return quien();
    return props.online ? t("danil.footer.online", { who: quien() }) : t("danil.footer.offline", { who: quien() });
  };

  return (
    <button
      type="button"
      data-danil-foot="connected"
      aria-label={titulo()}
      title={titulo()}
      onClick={() => props.onOpen()}
      class={cn(
        "flex h-7 min-w-0 cursor-pointer items-center gap-2 rounded-md text-xs text-neutral-700 transition-colors hover:bg-neutral-100",
        props.collapsed ? "w-7 shrink-0 justify-center" : "flex-1 px-1.5",
      )}
    >
      <span class="relative flex size-5 shrink-0 items-center justify-center">
        <Show
          when={props.profile?.photo || props.profile?.name || props.profile?.email}
          fallback={
            <span class="flex size-5 items-center justify-center rounded-full bg-surface-muted text-neutral-700">
              <CircleUserRound size={15} aria-hidden="true" />
            </span>
          }
        >
          <AccountAvatar profile={props.profile} class="size-5 text-2xs" />
        </Show>
        <Show when={props.online !== null}>
          <SignalDot tone={props.online ? "success" : "off"} class="absolute -right-0.5 -bottom-0.5" />
        </Show>
      </span>
      <Show when={!props.collapsed}>
        <span class="min-w-0 truncate">{quien()}</span>
      </Show>
    </button>
  );
}
