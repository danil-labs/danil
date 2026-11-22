import { invoke } from "../../../../engine-client/src/client.ts";

export type Pairing = { code: string; expires_at_ms: number };

export type TelegramStatus = {
  token_saved: boolean;
  bot_username: string | null;
  enabled: boolean;
  paired_chats: number;
  pairing: Pairing | null;
  topics_enabled: boolean;
  topics: number;
};

export type AwakeMode = "on" | "agent" | "off";

export const getTelegramStatus = (
  project: string,
  name: string,
): Promise<(TelegramStatus)> =>
  invoke<(TelegramStatus)>("telegram_status", { project, name });

export const getKeepAwakeStatus = (): Promise<{ mode: AwakeMode }> =>
  invoke<{ mode: AwakeMode }>("keep_awake_status");

export const setTelegramToken = (
  project: string,
  name: string,
  token: string,
): Promise<void> =>
  invoke("telegram_set_token", { project, name, token });

export const startTelegramPairing = (
  project: string,
  name: string,
): Promise<(Pairing)> =>
  invoke<(Pairing)>("telegram_start_pairing", { project, name });

export const disableTelegram = (
  project: string,
  name: string,
): Promise<void> =>
  invoke("telegram_disable", { project, name });

export const setKeepAwake = (mode: AwakeMode): Promise<void> =>
  invoke("set_keep_awake", { mode });
