/**
 * Paridad por contrato: la web y Desk leen los mismos ejemplos publicados de mvp-v1 con el
 * código que usan de verdad (web: cookie, CSRF y `platformTransport`; Desk: `danil_edge_fetch`
 * simulado) y llegan al mismo resultado. Sin el directorio de contratos (DANIL_MVP_CONTRACTS o
 * el clon de la VM), la prueba se omite con su motivo; nunca pasa en silencio.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { platformSession, platformTransport } from '../../src/web/platform-session.ts';
import { readCapabilities, supports } from '../../src/web/service-capabilities.ts';
import { webOrganizationSource } from '../../src/web/organizations.ts';
import { edgeOrganizationSource } from '../../src/features/shell/organization-edge.ts';
import { createOrganizationSelection } from "@terminus/computers";
import { createCloudMachines } from '../../src/features/machines/cloud-machines.ts';
import { machineToComputer, machinesClient } from '@terminus/computers';

const directory = process.env.DANIL_MVP_CONTRACTS ?? '/home/alejandro/danil/mvp/contracts/mvp-v1';
const examples = `${directory}/examples/`;
const available = existsSync(examples);
const sample = path => JSON.parse(readFileSync(examples + path, 'utf8'));
const MACHINE = 'cmp_01JD6Z8K2M3N4P5Q6R7S8T9V0W';
const OPERATION = '/v1/operations/op_01JD7Q3W4E5R6T7Y8U9I0O1P2A';

/** El borde: un ejemplo publicado por método y ruta, el mismo para los dos clientes. */
function edgeReply(method, path) {
  const routes = {
    'GET /v1/capabilities': [200, 'edge/capabilities.200.json'],
    'GET /v1/identity/csrf': [200, 'identity/csrf.200.json'],
    'GET /v1/identity/me': [200, 'identity/me.200.json'],
    'GET /v1/identity/organizations': [200, 'identity/organizations.200.json'],
    'POST /v1/identity/organizations/select': [200, 'identity/organizations_select.200.json'],
    'GET /v1/workspaces': [200, 'workspaces/list.200.json'],
    'POST /v1/workspaces/select': [200, 'workspaces/select.200.json'],
    'GET /v1/machines': [200, 'machines/list.200.json'],
    [`GET /v1/machines/${MACHINE}`]: [200, 'machines/get.200.json'],
    [`POST /v1/machines/${MACHINE}/tickets`]: [201, 'machines/tickets.201.json'],
    [`POST /v1/machines/${MACHINE}/start`]: [202, 'machines/start.202.json', OPERATION],
    [`GET ${OPERATION}`]: [200, 'machines/operation.200.succeeded.json'],
  };
  const route = routes[`${method} ${path}`];
  if (!route) throw new Error(`ruta fuera del contrato: ${method} ${path}`);
  return { status: route[0], body: sample(route[1]), location: route[2] };
}

function webClients() {
  const seen = [];
  const request = async (input, init) => {
    const req = new Request(input, init);
    const path = new URL(req.url).pathname;
    seen.push({ method: req.method, path, authorization: req.headers.has('authorization'), csrf: req.headers.get('x-csrf-token') });
    const reply = edgeReply(req.method, path);
    return Response.json(reply.body, { status: reply.status, headers: reply.location ? { Location: reply.location } : {} });
  };
  const options = { origin: 'https://edge.test', timeoutMs: 1000 };
  const transport = platformTransport(options, request);
  const relayOrigins = [new URL(sample('machines/tickets.201.json').url).origin];
  return { seen, session: platformSession(options, request), transport, organizations: webOrganizationSource(transport), machines: machinesClient({ endpoint: 'https://edge.test/v1', transport, relayOrigins, sleep: async () => {} }) };
}

function deskClients() {
  const seen = [];
  const invoke = async (command, args) => {
    assert.equal(command, 'danil_edge_fetch');
    seen.push({ method: args.method, path: args.path });
    return edgeReply(args.method, args.path);
  };
  const edgeFetch = async (method, path, body, key) => { seen.push({ method, path, key }); return edgeReply(method, path); };
  return { seen, cloud: createCloudMachines(invoke), organizations: edgeOrganizationSource(edgeFetch) };
}

const run = available ? test : test.skip;
const why = available ? undefined : `sin ${examples}`;

run('la web y Desk leen las capacidades publicadas igual', async () => {
  const caps = await readCapabilities(webClients().transport);
  const desk = await deskClients().cloud.capabilities();
  for (const name of ['machines', 'machines.start', 'machines.session', 'machines.session.renew', 'identity.organizations', 'workspaces']) {
    assert.equal(supports(caps, name), desk?.has(name) ?? true, name);
  }
  assert.equal(supports(caps, 'machines.session.renew'), false);
}, why);

run('organizaciones: el mismo store llega al mismo estado por la cookie y por danil_edge_fetch, y select lleva su clave', async () => {
  const states = [];
  for (const source of [webClients().organizations, deskClients().organizations]) {
    const selection = createOrganizationSelection(source, { schedule: () => () => {}, key: () => 'intent-org' });
    await selection.load();
    states.push(selection.state());
  }
  assert.equal(states[0].kind, 'ready');
  assert.deepEqual(states[0], states[1]);
  const web = webClients();
  await web.organizations.select('org_01M62PT11XGX8R8J883NZVYHR6', 'intent-org');
  const post = web.seen.find(call => call.path === '/v1/identity/organizations/select');
  assert.ok(post.csrf, 'la web firma la escritura con CSRF');
  assert.ok(web.seen.every(call => !call.authorization), 'la web nunca manda Bearer');
}, why);

run('identidad y workspaces de la web con los ejemplos publicados', async () => {
  const { session } = webClients();
  assert.ok((await session.me()).organizations.length);
  const workspaces = await session.workspaces();
  assert.ok(workspaces.length);
  assert.equal((await session.select(workspaces[0].id, 'intent-w')).workspace.id, workspaces[0].id);
}, why);

run('máquinas: la web y Desk ven las mismas filas, y la web pide ticket y enciende siguiendo Location', async () => {
  const web = webClients();
  const listed = await web.machines.list();
  assert.equal(listed.kind, 'ok');
  const rows = await deskClients().cloud.rows();
  assert.equal(rows.state, 'ready');
  assert.deepEqual(rows.computers.map(c => [c.computer_id, c.state]), listed.value.map(machineToComputer).map(c => [c.computer_id, c.state]));
  assert.equal((await web.machines.get(MACHINE)).kind, 'ok');
  const ticket = await web.machines.admission(MACHINE);
  assert.equal(ticket.kind === 'ok' && ticket.value.protocol, 'danil.machine-session.v1');
  assert.equal((await web.machines.start(MACHINE)).kind, 'ok');
  assert.ok(web.seen.some(call => call.path === OPERATION), 'sigue Location');
  const desk = deskClients();
  assert.equal((await desk.cloud.client.start(MACHINE)).kind, 'ok');
  assert.ok(desk.seen.some(call => call.path === OPERATION), 'Desk sigue el mismo Location');
}, why);
