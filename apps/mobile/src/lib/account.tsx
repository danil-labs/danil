import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import type { OrganizationState } from "@terminus/computers";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { ALPHA_DEMO, demoDenied } from "./alpha-mode";
import { type ControlPlane, computersControlPlane } from "./controlPlane";
import { edgeDeployment } from "./edge";
import { EdgeAccountProvider } from "./edge-account";
import { COMPUTERS, supabase } from "./supabase";

/**
 * En el navegador con el borde de la compilación (`EXPO_PUBLIC_DANIL_EDGE_ORIGIN`), la cuenta y las
 * máquinas van por `/v1`, como la web y Desk; sin él (iOS y Android), por Supabase y Danil Machines.
 */
// Expo solo sustituye `process.env.EXPO_PUBLIC_*` escritos tal cual: se leen uno por uno.
const EDGE = edgeDeployment({
  EXPO_PUBLIC_DANIL_EDGE_ORIGIN: process.env.EXPO_PUBLIC_DANIL_EDGE_ORIGIN,
  EXPO_PUBLIC_DANIL_EDGE_TIMEOUT_MS: process.env.EXPO_PUBLIC_DANIL_EDGE_TIMEOUT_MS,
});

export type OAuthProvider = "google" | "azure";

/** Lo que la app lee de una sesión: la persona y, si lo hay, su correo. */
export type AccountSession = { user: { id: string; email?: string } };

export type Account = {
  ready: boolean;
  session: AccountSession | null;
  /** El servicio de identidad no contestó: no hay persona confirmada ni «sin sesión»; se reintenta solo. */
  unavailable: boolean;
  /** Vuelve a preguntar ya (el botón «Reintentar» de la entrada). */
  retry: () => void;
  email: string | null;
  /** El nombre de la persona, si el servicio de identidad lo dice. */
  name: string | null;
  /** De dónde salen sus máquinas (`controlPlane.ts`). */
  plane: ControlPlane;
  /** Sus organizaciones (`identity`) y elegir la activa, solo por el borde; `null` sin él. */
  organizations: { state: OrganizationState; choose: (id: string) => void } | null;
  /** La entrada web de identity con su vuelta, solo por el borde. */
  loginUrl: ((returnTo: string) => string) | null;
  signInWithPassword: (email: string, password: string) => Promise<string | null>;
  signInWithProvider: (provider: OAuthProvider) => Promise<string | null>;
  /** Rechaza si el cierre no se confirmó: la persona sigue dentro y puede reintentar. */
  signOut: () => Promise<void>;
  /** Un token vigente para la API y el relay. */
  getToken: () => Promise<string>;
  /** La API o el relay rechazaron el token: se refresca una vez; si no se puede, se cierra la sesión. */
  unauthorized: () => Promise<boolean>;
};

const Context = createContext<Account | null>(null);

export function useAccount() {
  const value = useContext(Context);
  if (!value) throw new Error("useAccount outside AccountProvider");
  return value;
}

/** Adonde vuelve el navegador del inicio con Google o Microsoft (lista de Redirect URLs de Supabase). */
export const AUTH_CALLBACK = Linking.createURL("auth/callback");

/** Cambia el `code` de la vuelta del navegador por la sesión (PKCE). */
export async function finishOAuth(url: string): Promise<string | null> {
  const { queryParams } = Linking.parse(url);
  const error = queryParams?.error_description ?? queryParams?.error;
  if (error) return String(error);
  const code = queryParams?.code;
  if (typeof code !== "string") return "no_code";
  const { error: exchange } = await supabase.auth.exchangeCodeForSession(code);
  return exchange ? exchange.message : null;
}

const noop = () => {};

const DEMO_PLANE: ControlPlane = {
  computers: async () => { throw demoDenied(); },
  workspaces: async () => null,
  wake: async () => { throw demoDenied(); },
  relay: { endpoint: COMPUTERS, getToken: async () => { throw demoDenied(); } },
  bearerServices: false,
};

export function AccountProvider({ children }: { children: ReactNode }) {
  if (ALPHA_DEMO) return <Context.Provider value={{ ready: true, session: null, unavailable: false, retry: () => {}, email: null, name: null, plane: DEMO_PLANE, organizations: null, loginUrl: null, signInWithPassword: async () => "demo_read_only", signInWithProvider: async () => "demo_read_only", signOut: async () => { throw demoDenied(); }, getToken: async () => { throw demoDenied(); }, unauthorized: async () => false }}>{children}</Context.Provider>;
  if (EDGE) return <EdgeAccountProvider context={Context} deployment={EDGE}>{children}</EdgeAccountProvider>;
  return <LiveAccountProvider>{children}</LiveAccountProvider>;
}

function LiveAccountProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<AccountSession | null>(null);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  const signInWithPassword = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    return error ? error.message : null;
  }, []);

  const signInWithProvider = useCallback(async (provider: OAuthProvider) => {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: AUTH_CALLBACK, skipBrowserRedirect: true },
    });
    if (error || !data.url) return error?.message ?? "no_url";
    const result = await WebBrowser.openAuthSessionAsync(data.url, AUTH_CALLBACK);
    if (result.type !== "success") return result.type === "cancel" || result.type === "dismiss" ? null : result.type;
    return finishOAuth(result.url);
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const getToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw new Error("no session");
    return data.session.access_token;
  }, []);

  const unauthorized = useCallback(async () => {
    const { data, error } = await supabase.auth.refreshSession();
    // Sin red no se cierra la sesión: el próximo intento lo vuelve a probar.
    if (error && isAuthRetryableFetchError(error)) return true;
    if (error || !data.session) {
      await supabase.auth.signOut();
      return false;
    }
    return true;
  }, []);

  const plane = useMemo(() => computersControlPlane(COMPUTERS, getToken, unauthorized), [getToken, unauthorized]);

  const value = useMemo<Account>(
    () => ({
      ready,
      session,
      unavailable: false,
      retry: noop,
      email: session?.user.email ?? null,
      name: null,
      plane,
      organizations: null,
      loginUrl: null,
      signInWithPassword,
      signInWithProvider,
      signOut,
      getToken,
      unauthorized,
    }),
    [ready, session, plane, signInWithPassword, signInWithProvider, signOut, getToken, unauthorized],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
