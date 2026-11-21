/**
 * Las cuentas de IA por workspace en la web: `credentials` por el borde con la
 * cookie y el CSRF de la página (`/v1/credentials/workspaces/:ws/accounts`).
 * Leer y quitar los puede la web; sellar (`PUT`) es solo de Desk. Así la lista
 * sale de la cuenta aunque la VM esté apagada y no pasa por el motor.
 */
import { type CredentialSource, EdgeError, type EdgeTransport } from "@terminus/computers";

export function webCredentialSource(origin: string, transport: EdgeTransport): CredentialSource {
  const base = `${origin}/v1/`;
  return {
    endpoint: `${origin}/v1`,
    // La sesión es la cookie: no hay Bearer que pedir.
    getToken: async () => "",
    fetch: async (url, init) => {
      const relative = url.startsWith(base) ? url.slice(base.length) : url.replace(/^\/?v1\//, "");
      const method = init?.method ?? "GET";
      try {
        const response = method === "GET"
          ? await transport.call(relative)
          : await transport.mutation(relative, { method, headers: init?.headers, ...(init?.body === undefined ? {} : { body: init.body }) });
        const text = response.status === 204 ? "" : await response.text();
        return { status: response.status, ok: response.ok, json: async () => (text ? JSON.parse(text) : null) };
      } catch (e) {
        if (!(e instanceof EdgeError)) throw e;
        return { status: e.status, ok: false, json: async () => (e.code ? { error: { code: e.code } } : null) };
      }
    },
  };
}
