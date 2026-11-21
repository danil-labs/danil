import { Show } from "solid-js";
import { Button } from "@danil/ui";

export interface AccountAvatarProps {
  photo?: string | null;
  name?: string | null;
  email?: string | null;
  class?: string;
}

/** La cara de la persona: su foto o sus iniciales. */
export function AccountAvatar(props: AccountAvatarProps) {
  const initials = () => {
    const n = (props.name || props.email || "").trim();
    if (!n) return "??";
    const parts = n.split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return n.slice(0, 2).toUpperCase();
  };

  return (
    <span
      data-account-avatar={props.photo ? "photo" : "initials"}
      class={`flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-muted font-semibold text-neutral-700 uppercase ${props.class ?? ""}`.trim()}
    >
      <Show when={props.photo} fallback={initials()}>
        {(src) => <img src={src()} alt="" class="size-full object-cover" draggable={false} />}
      </Show>
    </span>
  );
}

export interface AccountIdentityBlockProps {
  name?: string | null;
  email?: string | null;
  photo?: string | null;
  readonly?: boolean;
  busy?: boolean;
  problem?: string | null;
  hint?: string | null;
  onChangePhoto?: () => void;
  onRemovePhoto?: () => void;
  class?: string;
}

/** Configuración: foto, nombre y correo de la cuenta, con «Cambiar foto» y «Quitar foto». */
export function AccountIdentityBlock(props: AccountIdentityBlockProps) {
  const who = () => props.name || props.email || "Tu cuenta";

  return (
    <div
      class={`grid gap-2 border-b border-border py-3.5 ${props.class ?? ""}`.trim()}
      data-account-identity={props.photo ? "photo" : "initials"}
    >
      <div class="flex min-w-0 items-center gap-3">
        <AccountAvatar photo={props.photo} name={props.name} email={props.email} class="size-12 text-base" />
        <div class="grid min-w-0 flex-1 gap-[3px]">
          <div class="min-w-0 truncate text-sm font-semibold text-neutral-950" data-account-name="">
            {who()}
          </div>
          <Show when={props.name && props.email}>
            <div class="min-w-0 truncate text-ui text-neutral-500">{props.email}</div>
          </Show>
        </div>
        <Show when={!props.readonly && (props.onChangePhoto || props.onRemovePhoto)}>
          <div class="flex shrink-0 items-center gap-2">
            <Show when={props.onChangePhoto}>
              <Button
                size="sm"
                variant="secondary"
                disabled={props.busy}
                onClick={props.onChangePhoto}
              >
                {props.busy ? "Guardando…" : "Cambiar foto"}
              </Button>
            </Show>
            <Show when={props.photo && props.onRemovePhoto}>
              <Button
                size="sm"
                variant="ghost"
                disabled={props.busy}
                onClick={props.onRemovePhoto}
              >
                Quitar foto
              </Button>
            </Show>
          </div>
        </Show>
      </div>
      <Show when={!props.readonly && props.hint !== null}>
        <p class="m-0 text-ui text-neutral-500">{props.hint ?? "Una foto cuadrada en PNG o JPEG."}</p>
      </Show>
      <Show when={props.problem}>
        {(text) => <p class="m-0 text-ui text-error-strong" role="alert">{text()}</p>}
      </Show>
    </div>
  );
}
