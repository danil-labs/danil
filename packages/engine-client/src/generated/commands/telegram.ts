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
  "telegram confirm": { kind: "cli", scope: null, authority: "task", channel: null },
  "telegram disable": { kind: "cli", scope: null, authority: "admin", channel: null },
  "telegram export": { kind: "cli", scope: null, authority: "admin", channel: null },
  "telegram forget-token": { kind: "cli", scope: null, authority: "admin", channel: null },
  "telegram pair": { kind: "cli", scope: null, authority: "admin", channel: null },
  "telegram restore": { kind: "cli", scope: null, authority: "admin", channel: null },
  "telegram set-token": { kind: "cli", scope: null, authority: "admin", channel: null },
  "telegram status": { kind: "cli", scope: null, authority: "admin", channel: null },
  telegram_disable: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  telegram_set_token: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  telegram_start_pairing: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  telegram_status: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
} as const;
