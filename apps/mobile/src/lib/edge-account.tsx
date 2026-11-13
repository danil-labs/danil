/**
 * La cuenta del teléfono en la web, por el borde (`EXPO_PUBLIC_DANIL_EDGE_ORIGIN`), igual que la
 * web y Desk: la sesión es la cookie HttpOnly del borde y ningún token llega a JS. La persona sale
 * de `GET /v1/identity/me`; entrar es la página de identity (WorkOS) y salir, `identity/logout`.
 * Sin sesión (401), `session` queda en `null` y la app abre la entrada.
 */
import { EdgeError, type EdgeDeployment, type EdgePerson, type OrganizationState, createOrganizationSelection } from "@terminus/computers";
import { useCallback, useEffect, useMemo, useRef, useState, type Context, type ReactNode } from "react";
import type { Account, AccountSession } from "./account";
import { edgeMachinesPlane } from "./controlPlane";
import { edgeControlPlane, relayOriginsOf } from "./edge";

/** Marca de «salió a propósito»: la entrada no vuelve a abrir WorkOS sola (`signin.web.tsx`). */
export const SIGNED_OUT = "terminus.web.signed-out";

const sessionOf = (person: EdgePerson): AccountSession => ({ user: { id: person.id, email: person.email ?? undefined } });

export function EdgeAccountProvider({ children, context: Provided, deployment }: { children: ReactNode; context: Context<Account | null>; deployment: EdgeDeployment }) {
  const [ready, setReady] = useState(false);
  const [person, setPerson] = useState<EdgePerson | null>(null);
  const expire = useRef(() => {});
  expire.current = () => setPerson(null);
  const edge = useMemo(
    () => edgeControlPlane(deployment, { relayOrigins: relayOriginsOf(process.env.EXPO_PUBLIC_DANIL_RELAY_ORIGINS), onUnauthorized: () => expire.current() }),
    [deployment],
  );
  const plane = useMemo(() => edgeMachinesPlane(edge), [edge]);

  /** `null`: no hay sesión. Una caída de red lanza y no cierra la sesión. */
  const read = useCallback(async () => {
    try {
      return await edge.identity.me();
    } catch (error) {
      if (error instanceof EdgeError && error.status === 401) return null;
      throw error;
    }
  }, [edge]);

  useEffect(() => {
    void read()
      .then((found) => {
        if (found) window.sessionStorage.removeItem(SIGNED_OUT);
        setPerson(found);
      }, () => null)
      .finally(() => setReady(true));
  }, [read]);

  const unauthorized = useCallback(async () => {
    try {
      const found = await read();
      setPerson((before) => (found && before?.id === found.id ? before : found));
      return Boolean(found);
    } catch {
      // Sin red no se cierra la sesión: el próximo intento lo vuelve a probar.
      return true;
    }
  }, [read]);

  const signOut = useCallback(async () => {
    await edge.identity.logout().catch(() => null);
    window.sessionStorage.setItem(SIGNED_OUT, "1");
    setPerson(null);
  }, [edge]);

  // Entrar es la página de identity (`signin.web.tsx`): aquí no hay contraseña ni proveedor.
  const elsewhere = useCallback(async () => "sign_in_on_web", []);
  // El borde no da portador a JS: lo que lo pide no se ofrece (`plane.bearerServices`).
  const getToken = useCallback(async (): Promise<string> => {
    throw new Error("bearer_unavailable");
  }, []);

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

  const session = useMemo(() => (person ? sessionOf(person) : null), [person]);
  const value = useMemo<Account>(
    () => ({
      ready,
      session,
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
    [ready, session, person, plane, organizations, edge, elsewhere, signOut, getToken, unauthorized],
  );
  return <Provided.Provider value={value}>{children}</Provided.Provider>;
}
