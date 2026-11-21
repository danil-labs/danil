// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
export type CliTelegramConfirmParams = Record<string, never>;
export type CliTelegramConfirmOutput = null;

export type CliTelegramDisableParams = Record<string, never>;
export type CliTelegramDisableOutput = null;

export type CliTelegramExportParams = Record<string, never>;
export type CliTelegramExportOutput = null;

export type CliTelegramForgetTokenParams = Record<string, never>;
export type CliTelegramForgetTokenOutput = null;

export type CliTelegramPairParams = Record<string, never>;
export type CliTelegramPairOutput = null;

export type CliTelegramRestoreParams = Record<string, never>;
export type CliTelegramRestoreOutput = null;

export type CliTelegramSetTokenParams = Record<string, never>;
export type CliTelegramSetTokenOutput = null;

export type CliTelegramStatusParams = Record<string, never>;
export type CliTelegramStatusOutput = null;

export interface TelegramDisableParams {
  project: string;
  name: string;
}
export type TelegramDisableOutput = null;

export interface TelegramSetTokenParams {
  project: string;
  name: string;
  token: string;
}
export type TelegramSetTokenOutput = unknown;

export interface TelegramStartPairingParams {
  project: string;
  name: string;
}
export type TelegramStartPairingOutput = unknown;

export interface TelegramStatusParams {
  project: string;
  name: string;
}
export type TelegramStatusOutput = unknown;

export const COMMANDS_TELEGRAM = {
  "telegram confirm": { kind: "cli", scope: null, authority: "task", channel: null, relay: false },
  "telegram disable": { kind: "cli", scope: null, authority: "admin", channel: null, relay: false },
  "telegram export": { kind: "cli", scope: null, authority: "admin", channel: null, relay: false },
  "telegram forget-token": { kind: "cli", scope: null, authority: "admin", channel: null, relay: false },
  "telegram pair": { kind: "cli", scope: null, authority: "admin", channel: null, relay: false },
  "telegram restore": { kind: "cli", scope: null, authority: "admin", channel: null, relay: false },
  "telegram set-token": { kind: "cli", scope: null, authority: "admin", channel: null, relay: false },
  "telegram status": { kind: "cli", scope: null, authority: "admin", channel: null, relay: false },
  telegram_disable: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  telegram_set_token: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  telegram_start_pairing: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  telegram_status: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
} as const;
