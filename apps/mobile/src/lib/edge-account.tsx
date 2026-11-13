/**
 * La cuenta del teléfono en la web, por el borde (`EXPO_PUBLIC_DANIL_EDGE_ORIGIN`), igual que la
 * web y Desk: la sesión es la cookie HttpOnly del borde y ningún token llega a JS. El estado lo
 * lleva `edgeSession.ts`: solo un 401 es «sin sesión», y salir solo cuenta si el borde lo confirma.
 */
import { type EdgeDeployment, type OrganizationState, createOrganizationSelection } from "@terminus/computers";
import { useCallback, useEffect, useMemo, useRef, useState, type Context, type ReactNode } from "react";
import type { Account, AccountSession } from "./account";
import { edgeMachinesPlane } from "./controlPlane";
import { edgeControlPlane, relayOriginsOf } from "./edge";
import { type EdgeSession, type EdgeSessionState, edgeSession } from "./edgeSession";

/** Marca de «salió a propósito»: la entrada no vuelve a abrir WorkOS sola (`signin.web.tsx`). */
export const SIGNED_OUT = "terminus.web.signed-out";

export function EdgeAccountProvider({ children, context: Provided, deployment }: { children: ReactNode; context: Context<Account | null>; deployment: EdgeDeployment }) {
  const [state, setState] = useState<EdgeSessionState>({ kind: "loading" });
  const [session, setSession] = useState<EdgeSession | null>(null);
  const current = useRef<EdgeSession | null>(null);
  current.current = session;
  // Un 401 de cualquier llamada vuelve a preguntar a identity: solo él decide si la sesión terminó.
  const edge = useMemo(
    () => edgeControlPlane(deployment, { relayOrigins: relayOriginsOf(process.env.EXPO_PUBLIC_DANIL_RELAY_ORIGINS), onUnauthorized: () => void current.current?.recheck() }),
    [deployment],
  );
  const plane = useMemo(() => edgeMachinesPlane(edge), [edge]);

  useEffect(() => {
    const made = edgeSession(edge.identity);
    const off = made.subscribe(() => {
      const next = made.state();
      if (next.kind === "signed_in") window.sessionStorage.removeItem(SIGNED_OUT);
      setState(next);
    });
    setSession(made);
    void made.load();
    return () => {
      off();
      made.stop();
    };
  }, [edge]);

  const person = state.kind === "signed_in" ? state.person : null;
  const unauthorized = useCallback(async () => (session ? session.recheck() : true), [session]);
  const retry = useCallback(() => void session?.load(), [session]);
  const signOut = useCallback(async () => {
    if (!session || !(await session.signOut())) throw new Error("sign_out_unconfirmed");
    window.sessionStorage.setItem(SIGNED_OUT, "1");
  }, [session]);

  // El selector compartido con la web y Desk: con una sola organización la elige; al cambiar, la página se relee entera.
  const personId = person?.id ?? null;
  const selection = useMemo(
    () => (personId ? createOrganizationSelection(edge.organizations, { onSelected: () => window.location.reload() }) : null),
    [edge, personId],
  );
  const [orgState, setOrgState] = useState<OrganizationState>({ kind: "hidden" });
  useEffect(() => {
    setOrgState({ kind: "hidden" });
    if (!selection) return;
    const off = selection.subscribe(() => setOrgState(selection.state()));
    void selection.load();
    return () => {
      off();
      selection.stop();
    };
  }, [selection]);
  const organizations = useMemo(() => (selection ? { state: orgState, choose: (id: string) => void selection.choose(id) } : null), [selection, orgState]);

  // Entrar es la página de identity (`signin.web.tsx`): aquí no hay contraseña ni proveedor.
  const elsewhere = useCallback(async () => "sign_in_on_web", []);
  // El borde no da portador a JS: lo que lo pide no se ofrece (`plane.bearerServices`).
  const getToken = useCallback(async (): Promise<string> => {
    throw new Error("bearer_unavailable");
  }, []);

  const accountSession = useMemo<AccountSession | null>(() => (person ? { user: { id: person.id, email: person.email ?? undefined } } : null), [person]);
  const value = useMemo<Account>(
    () => ({
      ready: state.kind !== "loading",
      session: accountSession,
      unavailable: state.kind === "unavailable",
      retry,
      email: person?.email ?? null,
      name: person?.name ?? null,
      plane,
      organizations,
      loginUrl: edge.identity.loginUrl,
      signInWithPassword: elsewhere,
      signInWithProvider: elsewhere,
      signOut,
      getToken,
      unauthorized,
    }),
    [state, accountSession, retry, person, plane, organizations, edge, elsewhere, signOut, getToken, unauthorized],
  );
  return <Provided.Provider value={value}>{children}</Provided.Provider>;
}
