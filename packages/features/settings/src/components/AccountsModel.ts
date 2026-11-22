import { lazy } from "solid-js";

// Las claves en la cuenta de Danil: un trozo aparte, solo para agentes con API key.
export const CredentialsInUse = lazy(() => import("./AccountCredentials").then((m) => ({ default: m.CredentialsInUse })));

export const LocalKeysBanner = lazy(() => import("./AccountCredentials").then((m) => ({ default: m.LocalKeysBanner })));

/** Cuánto se espera a que el CLI diga algo antes de ofrecer la Terminal. */
export const ESPERA_ANTES_DE_LA_TERMINAL_MS = 15_000;
