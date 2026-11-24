/** La persona de la cuenta de Danil según el motor del escritorio (`danil_account_*`). */
import { invoke } from "../../../../engine-client/src/client.ts";
import { imagenInerte } from "../../../../ui/src/lib/chat/links.ts";
import { urlDeAvatar } from "../../../../engine-client/src/previewFile.ts";
import type { AccountProfile, AccountProfileSource } from "../model/account-profile.ts";
import type { DanilConnectStatus } from "./danil-account.ts";

/** La persona según el estado del motor (`danil_connect_status` o `danil-connect`). */
export async function profileFromStatus(status: DanilConnectStatus | null): Promise<AccountProfile | null> {
  if (!status || status.state !== "connected") return null;
  const photo = status.avatar ? imagenInerte(await urlDeAvatar(status.avatar)) : null;
  return {
    name: status.account_name?.trim() || null,
    email: status.email?.trim() || null,
    photo,
    source: photo ? (status.avatar_source ?? null) : null,
  };
}

/** Escritorio: el motor guarda la foto de la cuenta en esta computadora y la cambia en la cuenta. */
export const engineAccountProfile: AccountProfileSource = engineAccountProfileOf();

/** La de una sesión: `account` es el id de la persona o su `computer_id`; sin él, la principal. */
export function engineAccountProfileOf(account?: string | null): AccountProfileSource {
  const named = account ? { account } : {};
  return {
    read: () => invoke<DanilConnectStatus>("danil_account_refresh", named).then(profileFromStatus),
    setPhoto: (photo) =>
      invoke<DanilConnectStatus>("danil_account_set_photo", { image: photo.dataUrl, ...named }).then(profileFromStatus),
    removePhoto: () => invoke<DanilConnectStatus>("danil_account_remove_photo", named).then(profileFromStatus),
  };
}
