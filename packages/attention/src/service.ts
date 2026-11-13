import type { InboxSession } from './inbox.ts';

export type ServiceAgent = { id: number; name: string; type: string; archived: boolean };
export type ServiceResource = { id: string; name: string };
export type ServiceAgentDetail = ServiceAgent & {
  model: string; description: string;
  channels: (ServiceResource & { provider: string })[];
  httpTools: ServiceResource[]; inventories: ServiceResource[]; documents: ServiceResource[]; directives: ServiceResource[];
};
export type ServiceHttpTool = { id: string; name: string; method: string; host: string; active: boolean };
/** Sin valor: un secreto llega nulo, y el valor de los demás no hace falta para listarlos. */
export type ServiceVariable = { key: string; secret: boolean };

const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_response');
  return value as Record<string, unknown>;
};
const array = (value: unknown): unknown[] => {
  if (!Array.isArray(value)) throw new Error('invalid_response');
  return value;
};
const text = (value: unknown) => typeof value === 'string' ? value : '';
const id = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) throw new Error('invalid_response');
  return value;
};
const resource = (value: unknown, name = 'name'): ServiceResource => {
  const row = object(value);
  return { id: String(row.id), name: text(row[name]) };
};
/** Solo el dominio: la ruta de una conexión API puede llevar plantillas con datos del cliente. */
export function hostOf(url: string): string {
  try { return new URL(url).host; } catch { return ''; }
}

/** Solo lectura, por el proxy de alfa. El BFF ancla cada lista a la cuenta activa de la sesión. */
export function createService(session: InboxSession, request: typeof fetch = fetch, prefix = '/terminus/alpha-api') {
  async function get(path: string) {
    const headers = async () => ({ Authorization: `Bearer ${await session.getToken()}` });
    let response = await request(`${prefix}${path}`, { headers: await headers(), cache: 'no-store' });
    if (response.status === 401 && await session.unauthorized()) response = await request(`${prefix}${path}`, { headers: await headers(), cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return object(await response.json());
  }
  const agentOf = (value: unknown): ServiceAgent => {
    const row = object(value);
    return { id: id(row.id), name: text(row.name), type: text(row.agent_type), archived: row.archived === true };
  };
  return {
    async agents(): Promise<ServiceAgent[]> {
      return array((await get('/api/agents')).agents).map(agentOf).filter(row => !row.archived);
    },
    async agent(agent: number): Promise<ServiceAgentDetail> {
      const key = id(agent);
      const [detail, links] = await Promise.all([get(`/api/agents/${key}`), get(`/api/agents/${key}/connections`)]);
      return {
        ...agentOf(detail), model: text(detail.model), description: text(detail.description),
        channels: array(links.channels ?? []).map(value => ({ ...resource(value), provider: text(object(value).provider) })),
        httpTools: array(links.http_tools ?? []).map(value => resource(value)),
        inventories: array(links.inventories ?? []).map(value => resource(value)),
        documents: array(links.documents ?? []).map(value => resource(value, 'title')),
        directives: array(links.directive_collections ?? []).map(value => resource(value)),
      };
    },
    async httpTools(): Promise<ServiceHttpTool[]> {
      return array((await get('/api/http_tools')).items).map(value => {
        const row = object(value);
        const definition = row.definition && typeof row.definition === 'object' ? row.definition as Record<string, unknown> : {};
        return { id: text(row.id), name: text(row.name), method: text(definition.method), host: hostOf(text(definition.url)), active: row.is_active !== false };
      });
    },
    async variables(): Promise<ServiceVariable[]> {
      return array((await get('/api/account_variables')).items).map(value => {
        const row = object(value);
        return { key: text(row.key), secret: row.is_secret === true };
      });
    },
  };
}
export type ServiceApi = ReturnType<typeof createService>;
