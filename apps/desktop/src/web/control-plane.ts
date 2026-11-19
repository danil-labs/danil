/** Lo común de las fuentes web del plano de control. */
export type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

/** A refused call, shaped like an engine failure so the panel words it the same way. */
export const refused = (code: string) => Object.assign(new Error(code), { detail: code });

/** La llamada con la sesión; un 401 avisa y la respuesta sigue a quien llamó. */
export function sessionCall(getToken: () => string | Promise<string>, onUnauthorized: (() => void) | undefined, f: Fetch) {
  return async (url: string, init: RequestInit = {}): Promise<Response> => {
    const token = await getToken();
    const response = await f(url, { ...init, headers: (() => { const h = new Headers(init.headers); h.set("authorization", `Bearer ${token}`); return h; })() });
    if (response.status === 401) onUnauthorized?.();
    return response;
  };
}
