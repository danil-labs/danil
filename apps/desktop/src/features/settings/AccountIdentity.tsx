import { createEffect, createSignal, on, onMount, Show } from "solid-js";
import { t } from "../../lib/i18n";
import { cn } from "../../lib/utils";
import { Button } from "../../ui/Button";
import {
  type AccountProfile,
  type AccountProfileSource,
  initials,
  PROFILE_CHANGED,
  PHOTO_TYPES,
  PhotoError,
  preparePhoto,
} from "./account-profile";
import { profileFromStatus } from "./account-engine";
import { failureCode, type DanilConnectStatus } from "./danil-account";
import { said } from "./danil-session";

/** La cara de la persona: su foto o sus iniciales. */
export function AccountAvatar(props: { profile: AccountProfile | null; class?: string }) {
  return (
    <span
      data-account-avatar={props.profile?.photo ? "photo" : "initials"}
      class={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-muted font-semibold text-neutral-700 uppercase",
        props.class,
      )}
    >
      <Show when={props.profile?.photo} fallback={initials(props.profile?.name, props.profile?.email)}>
        {(src) => <img src={src()} alt="" class="size-full object-cover" draggable={false} />}
      </Show>
    </span>
  );
}

/**
 * La persona y sus acciones. Con `status` (escritorio) sigue al motor por
 * `danil-connect`; sin él (web) la lee una vez de `source`. `refresh: false`
 * no la pide al montar (el pie: el motor ya la pide al arrancar). `watch` la
 * vuelve a pedir cuando cambia (una sesión de la lista con otra foto).
 */
export function createAccountIdentity(
  source: AccountProfileSource,
  status?: () => DanilConnectStatus | null,
  { refresh = true, watch }: { refresh?: boolean; watch?: () => unknown } = {},
) {
  const [profile, setProfile] = createSignal<AccountProfile | null>(null);
  const [busy, setBusy] = createSignal(false);
  const [problem, setProblem] = createSignal<string | null>(null);
  let turn = 0;
  const show = (next: Promise<AccountProfile | null>) => {
    const mine = ++turn;
    return next.then((p) => {
      if (mine === turn) setProfile(p);
    });
  };

  if (status) createEffect(on(status, (s) => void show(profileFromStatus(s)).catch(() => {})));
  if (watch) createEffect(on(watch, () => void show(source.read()).catch(() => {}), { defer: true }));
  onMount(() => {
    if (!refresh) return;
    // En el escritorio esto pide el perfil otra vez: una foto cambiada en la web entra aquí.
    void source.read().then((p) => {
      if (p || !status) setProfile(p);
    }).catch(() => {});
  });

  async function run(action: () => Promise<AccountProfile | null>) {
    setBusy(true);
    setProblem(null);
    try {
      await show(action());
      window.dispatchEvent(new CustomEvent(PROFILE_CHANGED));
    } catch (e) {
      setProblem(e instanceof PhotoError ? said(e.code) : said(failureCode(e)));
    } finally {
      setBusy(false);
    }
  }

  return {
    profile,
    readonly: source.readonly,
    busy,
    problem,
    changePhoto: (file: File) => run(async () => source.setPhoto(await preparePhoto(file))),
    removePhoto: () => run(() => source.removePhoto()),
  };
}

export type AccountIdentityState = ReturnType<typeof createAccountIdentity>;

/** Configuración: foto, nombre y correo de la cuenta, con «Cambiar foto» y «Quitar foto». */
export function AccountIdentityBlock(props: { identity: AccountIdentityState }) {
  const id = props.identity;
  let picker: HTMLInputElement | undefined;
  const who = () => id.profile()?.name || id.profile()?.email || t("danil.account.your_account");

  return (
    <div class="grid gap-2 border-b border-border py-3.5" data-account-identity={id.profile()?.photo ? "photo" : "initials"}>
      <div class="flex min-w-0 items-center gap-3">
        <AccountAvatar profile={id.profile()} class="size-12 text-base" />
        <div class="grid min-w-0 flex-1 gap-[3px]">
          <div class="min-w-0 truncate text-sm font-semibold text-neutral-950" data-account-name="">
            {who()}
          </div>
          <Show when={id.profile()?.name && id.profile()?.email}>
            <div class="min-w-0 truncate text-ui text-neutral-500">{id.profile()?.email}</div>
          </Show>
        </div>
        <div class="flex shrink-0 items-center gap-2">
          <input
            ref={picker}
            type="file"
            accept={PHOTO_TYPES.join(",")}
            class="hidden"
            data-account-photo-input=""
            onChange={(e) => {
              const file = e.currentTarget.files?.[0];
              e.currentTarget.value = "";
              if (file && !id.readonly) void id.changePhoto(file);
            }}
          />
          <Button size="sm" variant="secondary" disabled={id.busy() || id.readonly} onClick={() => picker?.click()}>
            {id.busy() ? t("danil.account.photo_saving") : t("danil.account.photo_change")}
          </Button>
          <Show when={id.profile()?.source === "danil"}>
            <Button size="sm" variant="ghost" disabled={id.busy() || id.readonly} onClick={() => void id.removePhoto()}>
              {t("danil.account.photo_remove")}
            </Button>
          </Show>
        </div>
      </div>
      <p class="m-0 text-ui text-neutral-500">{t("danil.account.photo_hint")}</p>
      <Show when={id.problem()}>
        {(text) => <p class="m-0 text-ui text-error-strong" role="alert">{text()}</p>}
      </Show>
    </div>
  );
}
