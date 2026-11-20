import type { OrganizationState } from "@terminus/computers";
import { createContext, useContext, type ReactNode } from "react";
import { Platform } from "react-native";
import { ALPHA_DEMO } from "./alpha-mode";
import type { ControlPlane } from "./controlPlane";
import { edgeDeployment } from "./edge";
import { EdgeAccountProvider } from "./edge-account";

// Expo solo sustituye `process.env.EXPO_PUBLIC_*` escritos tal cual: se leen uno por uno.
const EDGE = Platform.OS === "web" ? edgeDeployment({
  EXPO_PUBLIC_DANIL_EDGE_ORIGIN: process.env.EXPO_PUBLIC_DANIL_EDGE_ORIGIN,
  EXPO_PUBLIC_DANIL_EDGE_TIMEOUT_MS: process.env.EXPO_PUBLIC_DANIL_EDGE_TIMEOUT_MS,
}) : null;

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

const noSession = async (): Promise<never> => { throw new Error("no_session"); };

const SIGNED_OUT_ACCOUNT: Account = {
  ready: true,
  session: null,
  unavailable: false,
  retry: () => {},
  email: null,
  name: null,
  plane: {
    computers: async () => [],
    workspaces: async () => null,
    wake: noSession,
    relay: { endpoint: "", getToken: noSession },
    bearerServices: false,
  },
  organizations: null,
  loginUrl: null,
  signOut: async () => {},
  getToken: noSession,
  unauthorized: async () => false,
};

export function AccountProvider({ children }: { children: ReactNode }) {
  if (!ALPHA_DEMO && EDGE) {
    return <EdgeAccountProvider context={Context} deployment={EDGE}>{children}</EdgeAccountProvider>;
  }
  return <Context.Provider value={SIGNED_OUT_ACCOUNT}>{children}</Context.Provider>;
}
