/**
 * Atención en el escritorio (docs/desktop-bff-session.md): las mismas vistas que
 * la web, con la sesión de persona que guarda la ventana y el BFF por Computers.
 * El token nunca llega aquí: `agents_bff_fetch` lo pone en Rust.
 */
import { createRoot, createSignal, Show, Suspense, lazy, type JSX } from "solid-js";
import type { DirectoryEntry } from "@terminus/computers";
import { enterWorkspace } from "../../../../../packages/attention/src/workspace-account.ts";
import { invoke } from "../../lib/invoke.ts";
import { listen } from "../../lib/serviceEvents";
import { t } from "../../lib/i18n";
import { capabilities, setCapabilities, type Capabilities } from "../../lib/platform";
import { createCustomization } from "../../lib/customization";
import { featureEntries } from "../../lib/attention-labels";
import { AttentionMenu, PersonalizeMenu } from "../../web/attention/SidebarEntries";
import { loadedConversations, requestConversation } from "../../web/attention/loaded";
import { bffTransport, setBffTransport, type BffTransport } from "../../web/attention/transport";
import type { AgentsSession } from "../../web/attention/workspace-sources";
import { Button } from "../../ui/Button";
import "../../web/phrases";

type User = { user_id: string; email: string | null; name: string | null };
export type DesktopStatus =
  | { state: "loading" }
  | { state: "none" }
  | { state: "unavailable"; detail?: string }
  | { state: "active"; user: User; storage: "keychain" | "memory"; active_account_id?: number | null };

type Reply = { status: number; content_type: string; body: string; proxy: string | null; route_missing: boolean };

const PREFIX = "/danil-bff";

const store = createRoot(() => {
  const [status, setStatus] = createSignal<DesktopStatus>({ state: "loading" });
  return { status, setStatus };
});
export const desktopStatus = store.status;
const clears = new Set<() => void>();

function changed(next: DesktopStatus) {
  const before = store.status();
  const was = before.state === "active" ? before.user.user_id : null;
  const now = next.state === "active" ? next.user.user_id : null;
  store.setStatus(next);
  if (was && was !== now) for (const clear of clears) clear();
}

export async function refreshStatus(): Promise<DesktopStatus> {
  const next = await invoke<DesktopStatus>("agents_session_status", {}).catch(() => ({ state: "unavailable" }) as DesktopStatus);
  changed(next);
  return next;
}

const detailOf = (error: unknown) =>
  error && typeof error === "object" && "detail" in error && typeof error.detail === "string" ? error.detail : "unavailable";

const errorText = (detail: string) => {
  const text = t(`attention.desktop.error.${detail}`);
  return text.startsWith("attention.desktop.error.") ? t("attention.desktop.error.unavailable") : text;
};

function toBase64(bytes: Uint8Array) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** `fetch` de las vistas → la ventana. Ignora `Authorization`: la sesión la pone Rust. */
async function windowFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const url = new URL(input instanceof Request ? input.url : String(input), "http://danil-bff.invalid");
  if (!url.pathname.startsWith(`${PREFIX}/`)) throw new TypeError("bff_path");
  if (init.signal?.aborted) throw new DOMException("Aborted", "AbortError");
  const method = (init.method ?? "GET").toUpperCase();
  const headers = new Headers(init.headers);
  const args: Record<string, unknown> = {
    method,
    path: url.pathname.slice(PREFIX.length),
    query: url.search.replace(/^\?/, ""),
    workspace: headers.get("X-Danil-Workspace"),
  };
  if (init.body != null) {
    if (typeof init.body === "string") {
      args.body = init.body;
      args.contentType = headers.get("Content-Type") ?? "text/plain;charset=UTF-8";
    } else {
      const packed = new Request("http://danil-bff.invalid", { method: "POST", body: init.body as BodyInit, headers });
      args.bodyBase64 = toBase64(new Uint8Array(await packed.arrayBuffer()));
      args.contentType = packed.headers.get("Content-Type");
    }
  }
  let reply: Reply;
  try {
    reply = await invoke<Reply>("agents_bff_fetch", args);
  } catch (error) {
    const detail = detailOf(error);
    if (detail === "no_session") changed({ state: "none" });
    throw new Error(errorText(detail));
  }
  if (reply.route_missing) changed({ state: "unavailable", detail: "route_missing" });
  const empty = reply.status === 204 || reply.status === 205 || reply.status === 304;
  return new Response(empty ? null : reply.body, { status: reply.status, headers: reply.content_type ? { "Content-Type": reply.content_type } : {} });
}

let workspaceKey: string | null = null;
const session: AgentsSession & { subscribe: (clear: () => void) => () => void } = {
  // Lo lee `sessionFetch` para la cabecera, que `windowFetch` descarta.
  getToken: async () => "window",
  unauthorized: async () => false,
  workspaceKey: () => workspaceKey,
  rememberWorkspace(value) { workspaceKey = value; },
  async reenter() {
    if (!workspaceKey) return false;
    const bff = bffTransport();
    try {
      await enterWorkspace(
        { getToken: async () => "window", unauthorized: async () => false },
        bff.request,
        bff.prefix,
        workspaceKey,
      );
      return true;
    } catch {
      return false;
    }
  },
  // El directorio es de Computers y el token se queda en Rust.
  async directory() {
    const rows = await invoke<DirectoryEntry[]>("agents_session_directory", {});
    if (!Array.isArray(rows)) throw new Error("directory_unavailable");
    return rows;
  },
  subscribe(clear) {
    clears.add(clear);
    return () => clears.delete(clear);
  },
};

export const desktopTransport: BffTransport = {
  prefix: PREFIX,
  request: windowFetch,
  active: async () => {
    const value = await refreshStatus();
    return value.state === "active" ? (value.active_account_id ?? null) : null;
  },
};

/** Inicia sesión desde la ventana: abre el navegador y espera la vuelta. */
export function ConnectPanel(): JSX.Element {
  const [waiting, setWaiting] = createSignal(false);
  const [error, setError] = createSignal("");
  async function connect() {
    setWaiting(true);
    setError("");
    try {
      changed(await invoke<DesktopStatus>("agents_session_connect", {}));
    } catch (cause) {
      const detail = detailOf(cause);
      if (detail !== "cancelled") setError(errorText(detail));
    } finally {
      setWaiting(false);
    }
  }
  const cancel = () => void invoke("agents_session_sign_out", {}).catch(() => {});
  const status = store.status;
  return (
    <section data-desktop-attention-connect="" class="flex h-full flex-col items-start gap-3 overflow-y-auto p-8">
      <h2 class="font-display text-xl font-semibold text-neutral-950">{t("attention.desktop.title")}</h2>
      <p class="max-w-lg text-ui text-neutral-500">{t("attention.desktop.hint")}</p>
      <Show when={status().state === "unavailable"}>
        <p role="alert" class="max-w-lg text-ui text-error-strong">{errorText((status() as { detail?: string }).detail ?? "unavailable")}</p>
      </Show>
      <Show when={error()}>
        <p role="alert" class="max-w-lg text-ui text-error-strong">{error()}</p>
      </Show>
      <Show
        when={waiting()}
        fallback={<Button onClick={() => void connect()}>{t("attention.desktop.connect")}</Button>}
      >
        <p class="text-ui text-neutral-500">{t("attention.desktop.waiting")}</p>
        <Button variant="secondary" onClick={cancel}>{t("attention.desktop.cancel")}</Button>
      </Show>
    </section>
  );
}

/** La sesión de Atención de esta ventana, en Configuración. */
export function DesktopSessionRow(): JSX.Element {
  const status = store.status;
  const user = () => {
    const value = status();
    return value.state === "active" ? value : null;
  };
  async function signOut() {
    await invoke("agents_session_sign_out", {}).catch(() => {});
    changed({ state: "none" });
  }
  return (
    <Show when={user()}>
      {(value) => (
        <div data-desktop-attention-session="" class="flex flex-wrap items-center gap-3 text-ui text-neutral-500">
          <span>{t("attention.desktop.signed_in", { email: value().user.email ?? value().user.name ?? "" })}</span>
          <Show when={value().storage === "memory"}>
            <span>{t("attention.desktop.memory_only")}</span>
          </Show>
          <Button size="sm" variant="secondary" onClick={() => void signOut()}>{t("attention.desktop.sign_out")}</Button>
        </div>
      )}
    </Show>
  );
}

type Live = ReturnType<typeof import("../../web/attention/capability").attentionCapability>;
let live: Promise<Live> | null = null;
const loadLive = () =>
  (live ??= import("../../web/attention/capability").then((m) => m.attentionCapability(false, false, session)));

/** Pinta `part` de la capacidad web sin pedir sesión: lo que es local, como el catálogo de «Personalizar». */
function loaded(part: (cap: Live) => JSX.Element): JSX.Element {
  const View = lazy(async () => {
    const cap = await loadLive();
    return { default: () => part(cap) };
  });
  return (
    <Suspense fallback={null}>
      <View />
    </Suspense>
  );
}

/** Pinta `part` de la capacidad web con sesión; sin ella, el panel para conectar. */
function gated(part: (cap: Live) => JSX.Element, connect = true): JSX.Element {
  const View = lazy(async () => {
    const cap = await loadLive();
    return { default: () => part(cap) };
  });
  const person = (): string | null => {
    const value = store.status();
    return value.state === "active" ? value.user.user_id : null;
  };
  // Otra persona vuelve a montar la vista: nada de la anterior queda en pantalla.
  return (
    <Show when={person()} keyed fallback={connect && store.status().state !== "loading" ? <ConnectPanel /> : null}>
      {(_person: string) => (
        <Suspense fallback={null}>
          <View />
        </Suspense>
      )}
    </Show>
  );
}

/** Pone Atención en las capacidades de la ventana; se llama antes de montar la app. */
export function installDesktopAttention() {
  setBffTransport(desktopTransport);
  const inbox: NonNullable<Capabilities["inbox"]> = {
    customization: createCustomization,
    entries: featureEntries,
    demo: false,
    get userId() {
      const value = store.status();
      return value.state === "active" ? value.user.user_id : null;
    },
    subscribe: session.subscribe,
    sidebarMenu: AttentionMenu,
    personalizeMenu: PersonalizeMenu,
    catalog: (props) => loaded((cap) => cap.catalog(props)),
    broadcasts: (workspace) => gated((cap) => cap.broadcasts(workspace)),
    initial: false,
    render: (workspace) => gated((cap) => cap.render(workspace)),
    agentSettings: (name) => gated((cap) => cap.agentSettings(name), false),
    customerAgents: (workspace) => gated((cap) => cap.customerAgents(workspace)),
    customerConnections: (workspace) => gated((cap) => (
      <>
        {cap.customerConnections(workspace)}
        <DesktopSessionRow />
      </>
    )),
    search: { conversations: loadedConversations, open: requestConversation },
  };
  setCapabilities({ ...capabilities(), inbox });
  void refreshStatus();
  // La sesión de la ventana es de la cuenta principal. Conectada: se vuelve a comprobar la persona.
  // Solo la principal desconectada la cierra; `pending`, `error` o una secundaria no la tocan.
  void listen<{ state?: string }>("danil-connect", (event) => {
    const state = event.payload?.state;
    if (state === "connected") {
      void invoke<DesktopStatus>("agents_session_status", { verify: true })
        .then(changed)
        .catch(() => {});
    } else if (state === "disconnected") {
      void invoke<{ state?: string }>("danil_connect_status", {})
        .then((principal) => {
          if (principal?.state !== "disconnected") return;
          return invoke("agents_session_sign_out", {}).then(() => changed({ state: "none" }));
        })
        .catch(() => {});
    }
  });
}
