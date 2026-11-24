import type { JSX } from "solid-js";
import type { FreeModelPolicy } from "../../../../apps/desktop/src/lib/free-model-policy.ts";
import type { Frase } from "./prose";

/** Lo que el selector de modelos usa del consentimiento de Router IA gratis. */
type FreeRouterConsent = {
  cargado: () => boolean;
  texto: () => { policy: { enabled: boolean } } | null;
  aceptado: () => boolean;
  routeAvailable: () => boolean | null;
  cargar: () => Promise<void>;
  dialogo: () => JSX.Element;
  guardando: () => boolean;
  preguntar: () => Promise<void>;
};

export type CreateFreeRouterConsent = (
  opts: { agente: () => string; despues?: () => Promise<void> | void },
) => FreeRouterConsent;

export type Consentimiento = { lineas: Frase[]; version: number; policy: FreeModelPolicy };
