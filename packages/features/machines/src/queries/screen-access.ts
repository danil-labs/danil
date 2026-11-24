/**
 * La pantalla de una computadora (protocolo v1, «Pantalla»): un WebSocket aparte
 * del de sesión que lleva RFB (VNC) en frames binarios. Abrirlo no
 * enciende la computadora: con ella apagada el relay lo cierra con 4010.
 */
import { sessionUrl } from "./relay.ts";

export const SCREEN_SUBPROTOCOL = "danil.screen.v1";

export function screenUrl(endpoint: string, computerId: string): string {
  return sessionUrl(endpoint, computerId).replace(/\/session$/, "/screen");
}

/** Los subprotocolos del visor: el del protocolo y el token, que un WebSocket de navegador no puede poner en una cabecera. */
export function screenProtocols(token: string): string[] {
  return [SCREEN_SUBPROTOCOL, `bearer.${token}`];
}

/** Los visores pertenecen a la cuenta que los abrió, incluso mientras se obtiene su token. */
export function createScreenAccess(options: {
  endpoint: string;
  getToken: () => Promise<string>;
  knows: (id: string) => boolean;
  socket?: (url: string, protocols: string[]) => WebSocket;
}) {
  const sockets = new Set<WebSocket>();
  let closed = false;
  const allowed = (id: string) => !closed && options.knows(id);
  return {
    opener(id: string): (() => Promise<WebSocket>) | null {
      if (!allowed(id)) return null;
      return async () => {
        if (!allowed(id)) throw new Error("screen_unavailable");
        const token = await options.getToken();
        if (!allowed(id)) throw new Error("screen_unavailable");
        const socket = (options.socket ?? ((url, protocols) => new WebSocket(url, protocols)))(screenUrl(options.endpoint, id), screenProtocols(token));
        sockets.add(socket);
        socket.addEventListener("close", () => sockets.delete(socket), { once: true });
        return socket;
      };
    },
    close() {
      closed = true;
      for (const socket of sockets) socket.close();
      sockets.clear();
    },
  };
}
