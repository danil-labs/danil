import type { JSX } from "solid-js";

/** Lo que el selector de modelos usa del consentimiento de Router IA gratis. */
export type FreeRouterConsent = {
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
