// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
import type { EngineTransport } from "../transport.ts";
import type { CliTelegramConfirmParams, CliTelegramConfirmOutput, CliTelegramDisableParams, CliTelegramDisableOutput, CliTelegramExportParams, CliTelegramExportOutput, CliTelegramForgetTokenParams, CliTelegramForgetTokenOutput, CliTelegramPairParams, CliTelegramPairOutput, CliTelegramRestoreParams, CliTelegramRestoreOutput, CliTelegramSetTokenParams, CliTelegramSetTokenOutput, CliTelegramStatusParams, CliTelegramStatusOutput, TelegramDisableParams, TelegramDisableOutput, TelegramSetTokenParams, TelegramSetTokenOutput, TelegramStartPairingParams, TelegramStartPairingOutput, TelegramStatusParams, TelegramStatusOutput } from "../commands/telegram.ts";

export function bind_telegram(t: EngineTransport) {
  return {
    "telegram confirm": () => t.call("telegram confirm", {}) as Promise<CliTelegramConfirmOutput>,
    "telegram disable": () => t.call("telegram disable", {}) as Promise<CliTelegramDisableOutput>,
    "telegram export": () => t.call("telegram export", {}) as Promise<CliTelegramExportOutput>,
    "telegram forget-token": () => t.call("telegram forget-token", {}) as Promise<CliTelegramForgetTokenOutput>,
    "telegram pair": () => t.call("telegram pair", {}) as Promise<CliTelegramPairOutput>,
    "telegram restore": () => t.call("telegram restore", {}) as Promise<CliTelegramRestoreOutput>,
    "telegram set-token": () => t.call("telegram set-token", {}) as Promise<CliTelegramSetTokenOutput>,
    "telegram status": () => t.call("telegram status", {}) as Promise<CliTelegramStatusOutput>,
    telegram_disable: (params: TelegramDisableParams) => t.call("telegram_disable", params) as Promise<TelegramDisableOutput>,
    telegram_set_token: (params: TelegramSetTokenParams) => t.call("telegram_set_token", params) as Promise<TelegramSetTokenOutput>,
    telegram_start_pairing: (params: TelegramStartPairingParams) => t.call("telegram_start_pairing", params) as Promise<TelegramStartPairingOutput>,
    telegram_status: (params: TelegramStatusParams) => t.call("telegram_status", params) as Promise<TelegramStatusOutput>,
  };
}
