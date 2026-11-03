import type { PushMode } from "@terminus/computers";

/** Los avisos push de la web; la app nativa avisa con `expo-notifications` (ver `machines.tsx`). */
export type PushState = { supported: boolean; needsInstall: boolean; blocked: boolean; on: boolean };

export const PUSH_TEST = false;
export const PUSH_IOS = false;
export async function pushState(): Promise<PushState> {
  return { supported: false, needsInstall: false, blocked: false, on: false };
}
export async function enablePush(_getToken: () => Promise<string>): Promise<void> {}
export async function disablePush(_getToken: () => Promise<string>): Promise<void> {}
export async function renewPush(_getToken: () => Promise<string>): Promise<void> {}
export async function sendTestPush(_getToken: () => Promise<string>): Promise<number> {
  return 0;
}
export async function readPushMode(_getToken: () => Promise<string>): Promise<PushMode> {
  return "all";
}
export async function writePushMode(_getToken: () => Promise<string>, mode: PushMode): Promise<PushMode> {
  return mode;
}
