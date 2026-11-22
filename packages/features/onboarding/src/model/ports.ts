import type { Component } from "solid-js";
import type { Consentimiento } from "../../../../ui/src/lib/freeRouterConsent.ts";

/** Lo que el alta lee de la sesión de Danil de Configuración. */
export type SesionDelAlta = {
  view: () => { t: string };
  status: () => { state: string; user_code?: string | null; verification_uri_complete?: string | null } | null;
  busy: () => boolean;
  message: () => string | null;
  license: () => boolean;
  withBrowser: () => Promise<void>;
  signOut: () => Promise<void>;
  retry: () => Promise<void>;
  reopen: () => void;
};

/**
 * Lo que el alta usa de settings (la sesión de Danil, el muro de licencia y los
 * diálogos de conexión y consentimiento). Es de settings y lo enchufa el shell
 * al arrancar (R3): las pantallas lo leen con los mismos nombres que exporta settings.
 */
export type PuertosDelAlta = {
  createDanilSession: (o?: { oneClick?: boolean }) => SesionDelAlta;
  requestAccessInBrowser: () => void;
  TerminusLicense: Component<{ onRequest: () => void; onRetry: () => void; busy?: boolean; compact?: boolean }>;
  Consentir: Component<{ texto: Consentimiento; guardando: boolean; error?: string | null; onAceptar: () => void; onCancelar: () => void }>;
  DialogoDeConexion: Component<{
    etiqueta: string;
    url: string | null;
    porConfirmar: string | null;
    pideCodigo: boolean;
    salida: string[];
    onCancelar: () => void;
    onCodigo: (codigo: string) => void;
  }>;
};

let puertos: PuertosDelAlta;

/** El shell lo llama una vez, antes de montar la app. */
export function enchufarPuertosDelAlta(p: PuertosDelAlta) {
  puertos = p;
}

export const createDanilSession: PuertosDelAlta["createDanilSession"] = (o) => puertos.createDanilSession(o);
export const requestAccessInBrowser = () => puertos.requestAccessInBrowser();
export const TerminusLicense: PuertosDelAlta["TerminusLicense"] = (props) => puertos.TerminusLicense(props);
export const Consentir: PuertosDelAlta["Consentir"] = (props) => puertos.Consentir(props);
export const DialogoDeConexion: PuertosDelAlta["DialogoDeConexion"] = (props) => puertos.DialogoDeConexion(props);
