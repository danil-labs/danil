import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { platformSession } from '../../src/web/platform-session.ts';
import { readCapabilities, supports } from '../../src/web/service-capabilities.ts';
import { machinesClient } from '../../../../packages/computers/src/machines.ts';
const directory = process.env.DANIL_MVP_CONTRACTS;
if (!directory) throw new Error('Set DANIL_MVP_CONTRACTS to the published mvp-v1 directory');
const root = `${directory}/examples/`;
const sample=path=>JSON.parse(readFileSync(root+path,'utf8'));
let selected=false;
const api=platformSession({origin:'https://edge.test',timeoutMs:1000},async(input,init)=> {
  const req=new Request(input,init), path=new URL(req.url).pathname;
  assert.equal(req.headers.has('authorization'),false);
  if(path.endsWith('/csrf'))return Response.json(sample('identity/csrf.200.json'));
  if(path==='/v1/identity/me')return Response.json(sample('identity/me.200.json'));
  if(path==='/v1/identity/organizations')return Response.json(sample('identity/organizations.200.json'));
  if(path==='/v1/identity/organizations/select')return Response.json(sample('identity/organizations_select.200.json'));
  if(path==='/v1/workspaces')return Response.json(sample('workspaces/list.200.json'));
  if(path==='/v1/workspaces/select'){ selected=true; return Response.json(sample('workspaces/select.200.json')); }
  throw new Error(path);
});
assert.ok((await api.me()).organizations.length);
assert.ok((await api.organizations()).items.length);
assert.equal((await api.selectOrganization('org_A','intent')).workspace,null);
const workspaces=await api.workspaces();assert.ok(workspaces.length);
assert.equal((await api.select(workspaces[0].id,'intent-w')).workspace.id,workspaces[0].id);
assert.ok(selected);
const caps=await readCapabilities({call:async()=>Response.json(sample('edge/capabilities.200.json'))});
assert.equal(supports(caps,'machines'),true);assert.equal(supports(caps,'machines.session.renew'),false);
const machines=machinesClient({endpoint:'https://edge.test/v1',relayOrigins:[new URL(sample('machines/tickets.201.json').url).origin],transport:{
  call:async path=>Response.json(sample(path.startsWith('machines/')?'machines/get.200.json':'machines/list.200.json')),
  mutation:async path=> {
    if(path.endsWith('/tickets'))return Response.json(sample('machines/tickets.201.json'),{status:201});
    return Response.json(sample('machines/start.202.noop.json'),{status:202,headers:{Location:'/v1/operations/operation'}});
  },
}});
const list=await machines.list();assert.equal(list.kind,'ok');
const id=list.value[0].machine_id;
assert.equal((await machines.get(id)).kind,'ok');
assert.equal((await machines.admission(id)).kind,'ok');
assert.equal((await machines.start(id)).kind,'ok');
console.log('PASS: consumers parse mvp-v1 capabilities, identity, organizations, workspaces, machines, tickets and start examples; relay uses its configured origin.');
