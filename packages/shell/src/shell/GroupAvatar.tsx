import { createEffect, createResource, Show } from "solid-js";
import { capabilities } from "../../../host/src/platform";

/** Una foto del perfil por omisión sólo sirve al correo que coincide con ese perfil. */
export function GroupAvatar(props: { email: string | null; initial: string; opened: boolean; current: boolean; onEmail: (email: string | null) => void }) {
  const [profile] = createResource(() => props.opened && props.current && capabilities().accountProfile, (source) => source ? source.read().catch(() => null) : null);
  createEffect(() => { const value = profile(); if (value && props.current) props.onEmail(value.email); });
  const photo = () => props.current && (!props.email || profile()?.email?.trim().toLowerCase() === props.email?.trim().toLowerCase()) ? profile()?.photo : null;
  return <Show when={photo()} fallback={props.initial}>{(src) => <img src={src()} alt="" class="size-4 rounded-full object-cover" draggable={false} />}</Show>;
}
