/**
 * El lado HTTP del plano de control de Danil Machines: las computadoras de la
 * persona y su encendido. También explica lo que un upgrade de WebSocket
 * fallido no puede decir (sin licencia, no es tuya).
 *
 * Sin APIs del DOM: `fetch` se inyecta, así sirve en el navegador, en React
 * Native y en Node.
 */

/** Una fila de `GET /v1/computers` (protocolo v1, «Navegador/escritorio ↔ relay»). */
export type Computer = {
  computer_id: string;
  name?: string | null;
  plan?: string | null;
  /** Adaptador del orquestador (`aws-ec2`) en una VM administrada. */
  provider?: string | null;
  /** Qué es (`physical`, `vps`…), si el plano de control lo dice. */
  kind?: string | null;
  /** Si el relay puede encenderla, si el plano de control lo dice: manda sobre lo demás. */
  wakeable?: boolean | null;
  /** `online | offline | starting | stopped | provisioning`. */
  state: string;
  last_seen?: string | null;
  host_version?: string | null;
  /** El contrato del motor en su último `hello` (hash de `commands.json`), si lo dijo. */
  contract?: string | null;
  /** Lo que el motor anunció en `status.service_features` en su último `hello`. Sin el campo, nada. */
  service_features?: string[] | null;
  /** `linux`, `macos` o `windows`, si el plano de control lo dice. Sin el campo, no se sabe. */
  os?: string | null;
  /** Los workspaces de esta computadora vinculados a la cuenta. Sin el campo, un plano de control de antes. */
  workspaces?: string[] | null;
};

export type Answer<T> =
  | { kind: "ok"; value: T }
  | { kind: "unauthorized" }
  | { kind: "license" }
  | { kind: "no_account" }
  | { kind: "missing" }
  | { kind: "error"; status: number | null; code?: string };

/** Lo mínimo de `fetch` que usa el cliente. */
export type Fetch = (input: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{
  status: number;
  ok: boolean;
  json(): Promise<unknown>;
}>;

/** El origen del plano de control de producción. */
export const COMPUTERS_ENDPOINT = "https://machines.danil.ai";

export function apiUrl(endpoint: string, path: string): string {
  const base = /^[a-z]+:\/\//i.test(endpoint) ? endpoint : `https://${endpoint}`;
  const url = new URL(base.replace(/^ws/i, "http"));
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}${path}`;
}

/** El código de un error: `{ error: { code } }`, o `{ error: "<code>" }` de un plano de control anterior. */
export function errorCodeOf(body: unknown): string | undefined {
  const said = (body as { error?: unknown } | null)?.error;
  const code = typeof said === "string" ? said : (said as { code?: unknown } | null | undefined)?.code;
  return typeof code === "string" ? code : undefined;
}

/** A dónde hablar y con qué token: el JWT en la web, el token de cliente en la ventana. */
export type BearerSource = { endpoint: string; getToken: () => Promise<string>; fetch?: Fetch };

/** La llamada con su token y el cuerpo ya leído; `null` si no hubo red o token. Cada cliente decide qué significa cada estado. */
export async function bearerCall(source: BearerSource, method: string, path: string, body?: unknown) {
  try {
    const headers: Record<string, string> = { authorization: `Bearer ${await source.getToken()}` };
    if (body !== undefined) headers["content-type"] = "application/json";
    const response = await (source.fetch ?? globalFetch)(apiUrl(source.endpoint, path), { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, ok: response.ok, json: await response.json().catch(() => null) };
  } catch {
    return null;
  }
}

export const globalFetch: Fetch = (input, init) => (globalThis.fetch as unknown as Fetch)(input, init);

export async function request<T>(url: string, token: string, method: string, read: (body: unknown) => T, f: Fetch, payload?: unknown): Promise<Answer<T>> {
  let response: Awaited<ReturnType<Fetch>>;
  try {
    const headers: Record<string, string> = { authorization: `Bearer ${token}` };
    if (payload === undefined) response = await f(url, { method, headers });
    else response = await f(url, { method, headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify(payload) });
  } catch {
    return { kind: "error", status: null };
  }
  if (response.status === 401) return { kind: "unauthorized" };
  if (response.status === 403) {
    const code = errorCodeOf(await response.json().catch(() => null));
    if (code === "unknown_user") return { kind: "no_account" };
    if (code === "license_required") return { kind: "license" };
    // `access_denied` de las máquinas compartidas llega plano (`{"error":"código"}`).
    return code ? { kind: "error", status: response.status, code } : { kind: "error", status: response.status };
  }
  if (response.status === 404) return { kind: "missing" };
  if (!response.ok) {
    // `409 workspace_deleted` y compañía: el código del cuerpo dice qué pasó.
    const code = errorCodeOf(await response.json().catch(() => null));
    return code ? { kind: "error", status: response.status, code } : { kind: "error", status: response.status };
  }
  if (response.status === 204) return { kind: "ok", value: read(null) };
  const body = await response.json().catch(() => null);
  try {
    return { kind: "ok", value: read(body) };
  } catch {
    return { kind: "error", status: response.status };
  }
}

export function listComputers(endpoint: string, token: string, f: Fetch = globalFetch): Promise<Answer<Computer[]>> {
  return request(
    apiUrl(endpoint, "/v1/computers"),
    token,
    "GET",
    (body) => {
      const list = Array.isArray(body) ? body : (body as { computers?: unknown } | null)?.computers;
      return Array.isArray(list) ? (list.filter((c) => typeof c?.computer_id === "string") as Computer[]) : [];
    },
    f,
  );
}

/**
 * Le pone otro nombre a una computadora de la cuenta (`PATCH /v1/computers/:id`).
 * Un nombre que no cabe contesta `error` con `invalid_name`; una que ya no está, `missing`.
 */
export function renameComputer(endpoint: string, token: string, id: string, name: string, f: Fetch = globalFetch): Promise<Answer<{ computer_id: string; name: string }>> {
  return request(
    apiUrl(endpoint, `/v1/computers/${encodeURIComponent(id)}`),
    token,
    "PATCH",
    (body) => {
      const b = body as { computer_id?: unknown; name?: unknown } | null;
      return { computer_id: typeof b?.computer_id === "string" ? b.computer_id : id, name: typeof b?.name === "string" ? b.name : name };
    },
    f,
    { name },
  );
}

/**
 * Quita de la cuenta una computadora conectada por la persona (`DELETE /v1/computers/:id`).
 * Pide la sesión de la persona: el token de cliente del escritorio contesta `unauthorized`.
 * Una VM que Danil administra contesta `error` con `not_self_computer`; una que ya no está, `missing`.
 */
export function removeComputer(endpoint: string, token: string, id: string, f: Fetch = globalFetch): Promise<Answer<{ computer_id: string }>> {
  return request(
    apiUrl(endpoint, `/v1/computers/${encodeURIComponent(id)}`),
    token,
    "DELETE",
    (body) => {
      const b = body as { computer_id?: unknown } | null;
      return { computer_id: typeof b?.computer_id === "string" ? b.computer_id : id };
    },
    f,
  );
}

/** El largo máximo del nombre de una computadora, el mismo que valida el plano de control. */
export const COMPUTER_NAME_MAX = 60;

/** Un proyecto del registro de la cuenta (`Project` de `GET /v1/workspaces`): el mismo id en cada máquina. */
export type AccountProject = {
  id: string;
  name: string;
  remote_url?: string | null;
  default_branch?: string | null;
  /** La computadora donde nació, si el plano de control la sabe. */
  home_computer_id?: string | null;
};

/**
 * Un space compartido del workspace (`Space` de `GET /v1/workspaces`): el mismo id
 * en todas las máquinas. `name: null` es el nombre por omisión; `changed_at`, los
 * milisegundos del motor que lo cambió por última vez.
 */
export type AccountSpace = { id: string; name: string | null; folders: string[]; position: number; changed_at: number };

/**
 * Un workspace del registro de la cuenta de Danil (`GET /v1/workspaces`): existe
 * aunque sus computadoras estén apagadas. `computers`, en cuáles está ligado.
 */
export type AccountWorkspace = {
  id: string;
  name: string;
  radiant_workspace_id?: string | null;
  settings?: Partial<Record<"lengua" | "lengua_de_salida" | "default_permission_mode" | "terminal_theme" | "chat_background" | "space_order", string | null>> | null;
  settings_version?: number;
  created_at?: string | null;
  updated_at?: string | null;
  projects: AccountProject[];
  computers: string[];
  /** El logo y el fondo de los chats en la cuenta (`GET …/logo|background`, con la sesión); `null` sin imagen. Un plano de control anterior no los manda. */
  logo_url?: string | null;
  background_url?: string | null;
  /** Sus spaces compartidos, en orden (vacío con un plano de control anterior). */
  spaces?: AccountSpace[];
  /** Ids de spaces compartidos con lápida. */
  deleted_spaces?: string[];
  /** Con lápida (`include_deleted=1`): cuándo se borró. Un borrado no revive al volver a atarlo; solo con `restore`. */
  deleted_at?: string | null;
};

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x !== "") : []);

function accountWorkspace(raw: unknown): AccountWorkspace | null {
  const w = raw as Record<string, unknown> | null;
  if (!w || typeof w !== "object" || typeof w.id !== "string" || !w.id) return null;
  const projects = (Array.isArray(w.projects) ? w.projects : []).filter(
    (p): p is AccountProject => !!p && typeof (p as AccountProject).id === "string" && typeof (p as AccountProject).name === "string",
  );
  const spaces = (Array.isArray(w.spaces) ? w.spaces : []).flatMap((raw): AccountSpace[] => {
    const s = raw as Record<string, unknown> | null;
    if (!s || typeof s.id !== "string" || !s.id) return [];
    return [
      {
        id: s.id,
        name: typeof s.name === "string" && s.name ? s.name : null,
        folders: strings(s.folders),
        position: typeof s.position === "number" ? s.position : 0,
        changed_at: typeof s.changed_at === "number" ? s.changed_at : 0,
      },
    ];
  });
  return {
    ...(w as AccountWorkspace),
    name: typeof w.name === "string" && w.name.trim() ? w.name : w.id,
    projects,
    computers: strings(w.computers),
    spaces,
    deleted_spaces: strings(w.deleted_spaces),
  };
}

/**
 * Los workspaces de la cuenta, con sus proyectos y computadoras. Acepta el JWT de
 * la persona o el token de cliente del escritorio. Un plano de control anterior
 * al registro contesta `missing` (404): quien llama sigue sin él.
 */
export function listWorkspaces(endpoint: string, token: string, f: Fetch = globalFetch): Promise<Answer<AccountWorkspace[]>> {
  return request(
    apiUrl(endpoint, "/v1/workspaces"),
    token,
    "GET",
    (body) => {
      const list = (body as { workspaces?: unknown } | null)?.workspaces;
      if (!Array.isArray(list)) throw new Error("bad_registry");
      return list.map(accountWorkspace).filter((w): w is AccountWorkspace => w !== null);
    },
    f,
  );
}

const registryList = (list: unknown): AccountWorkspace[] => (Array.isArray(list) ? list.map(accountWorkspace).filter((w): w is AccountWorkspace => w !== null) : []);

/** Los vivos y, aparte, los que tienen lápida (`GET /v1/workspaces?include_deleted=1`), para ofrecer restaurarlos. */
export function listWorkspacesWithDeleted(endpoint: string, token: string, f: Fetch = globalFetch): Promise<Answer<{ workspaces: AccountWorkspace[]; deleted: AccountWorkspace[] }>> {
  return request(
    apiUrl(endpoint, "/v1/workspaces?include_deleted=1"),
    token,
    "GET",
    (body) => {
      const b = body as { workspaces?: unknown; deleted?: unknown } | null;
      if (!Array.isArray(b?.workspaces)) throw new Error("bad_registry");
      return { workspaces: registryList(b.workspaces), deleted: registryList(b.deleted) };
    },
    f,
  );
}

/** Saca un workspace de la lápida con sus proyectos y su memoria. */
export function restoreWorkspace(endpoint: string, token: string, id: string, f: Fetch = globalFetch): Promise<Answer<AccountWorkspace | null>> {
  return request(apiUrl(endpoint, `/v1/workspaces/${encodeURIComponent(id)}/restore`), token, "POST", accountWorkspace, f);
}

/** Borra para siempre uno con lápida (su repo de memoria y sus respaldos); uno vivo contesta `409 workspace_not_deleted`. */
export function purgeWorkspace(endpoint: string, token: string, id: string, f: Fetch = globalFetch): Promise<Answer<null>> {
  return request(apiUrl(endpoint, `/v1/workspaces/${encodeURIComponent(id)}/purge`), token, "POST", () => null, f);
}

/**
 * Por qué no abrió la sesión de una computadora: un upgrade fallido no trae
 * cuerpo en el navegador, así que se pregunta por HTTP. `license_required`
 * (`403`, computers#22) o `null` si no lo dice.
 */
export async function sessionProbe(endpoint: string, token: string, id: string, f: Fetch = globalFetch): Promise<"license_required" | null> {
  const answer = await request(apiUrl(endpoint, `/v1/computers/${encodeURIComponent(id)}/session`), token, "GET", () => null, f);
  return answer.kind === "license" ? "license_required" : null;
}

/**
 * Una máquina de la organización (`purpose = resource`). No corre tareas y no
 * está en `GET /v1/computers`. El encendido se lee del proveedor en cada lista.
 */
export type SharedComputer = {
  computer_id: string;
  name: string;
  organization_id: string;
  purpose: "resource";
  access: "service" | "shell";
  can_stop: boolean;
  power: "running" | "stopped" | "starting" | "stopping" | "unknown";
};

const SHARED_ACCESS = ["service", "shell"] as const;
const SHARED_POWER = ["running", "stopped", "starting", "stopping", "unknown"] as const;

function sharedComputer(raw: unknown): SharedComputer | null {
  const row = raw as Record<string, unknown> | null;
  if (!row || typeof row.computer_id !== "string" || !row.computer_id) return null;
  if (typeof row.name !== "string" || !row.name) return null;
  if (typeof row.organization_id !== "string" || !row.organization_id.startsWith("org_")) return null;
  if (row.purpose !== "resource") return null;
  if (!SHARED_ACCESS.includes(row.access as (typeof SHARED_ACCESS)[number])) return null;
  if (typeof row.can_stop !== "boolean") return null;
  if (!SHARED_POWER.includes(row.power as (typeof SHARED_POWER)[number])) return null;
  return {
    computer_id: row.computer_id,
    name: row.name,
    organization_id: row.organization_id,
    purpose: "resource",
    access: row.access as SharedComputer["access"],
    can_stop: row.can_stop,
    power: row.power as SharedComputer["power"],
  };
}

/**
 * Las máquinas de la organización de esta persona (`GET /v1/shared-computers`).
 * Sin organización o sin máquinas, la lista llega vacía. No pide licencia.
 * El cuerpo de error es `{"error":"código"}`.
 */
export function listSharedComputers(endpoint: string, token: string, f: Fetch = globalFetch): Promise<Answer<SharedComputer[]>> {
  return request(
    apiUrl(endpoint, "/v1/shared-computers"),
    token,
    "GET",
    (body) => {
      const list = (body as { computers?: unknown } | null)?.computers;
      if (!Array.isArray(list)) throw new Error("bad_shared");
      return list.flatMap((row) => {
        const parsed = sharedComputer(row);
        return parsed ? [parsed] : [];
      });
    },
    f,
  );
}

/**
 * Enciende una máquina de la organización (`POST /v1/shared-computers/:id/start`).
 * Es idempotente si ya corre o está encendiéndose. Pide licencia; sin ella, `license`.
 */
export function startSharedComputer(endpoint: string, token: string, id: string, f: Fetch = globalFetch): Promise<Answer<SharedComputer>> {
  return request(
    apiUrl(endpoint, `/v1/shared-computers/${encodeURIComponent(id)}/start`),
    token,
    "POST",
    (body) => {
      const parsed = sharedComputer(body);
      if (!parsed) throw new Error("bad_shared");
      return parsed;
    },
    f,
  );
}

/** Encendido explícito. La app no lo usa al abrir: una acción enciende la VM por el relay. */
/** Lo que la flota entiende de `POST /start`: encendida, no se pudo, o el plano de control no la enciende. */
export function startedOf(answer: Answer<unknown>): boolean | "not_startable" {
  if (answer.kind === "ok") return true;
  return answer.kind === "error" && answer.code === "not_remotely_startable" ? "not_startable" : false;
}

export function startComputer(endpoint: string, token: string, id: string, f: Fetch = globalFetch): Promise<Answer<{ state: string } | null>> {
  return request(
    apiUrl(endpoint, `/v1/computers/${encodeURIComponent(id)}/start`),
    token,
    "POST",
    (body) => (body && typeof (body as { state?: unknown }).state === "string" ? { state: (body as { state: string }).state } : null),
    f,
  );
}
