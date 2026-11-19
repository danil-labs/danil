import assert from 'node:assert/strict';
import test from 'node:test';
import { Fleet, type MachineInfo } from '../../../../packages/fleet/src/index.ts';
import { danilAvailable, danilAvailableContext, danilMachines, isDanilWorkspace, listedOf, noteListing, readDanil, readDanilContext, setDanilFleet } from '../../src/features/machines/danil-source.ts';

const org: MachineInfo = { id: 'cmp_org', name: 'Servidor Acme', wakes: false, kind: 'organization', organizationId: 'org_A' };
const personal: MachineInfo = { id: 'cmp_vm', name: 'Danil VM', wakes: false, kind: 'personal' };

function fleetWith(answers: Record<string, unknown>, machines: MachineInfo[] = [personal, org]) {
  const reads: string[] = [];
  const fleet = new Fleet({ connect: () => ({}) as never });
  (fleet as unknown as { add(info: MachineInfo): void }).add = function (this: Fleet, info: MachineInfo) {
    (this as unknown as { members: Map<string, unknown> }).members.set(info.id, { info, link: { state: () => 'online' }, live: true });
  };
  fleet.read = (async (envelope: { machine: string; command: string }) => {
    reads.push(`${envelope.machine} ${envelope.command}`);
    return { machine: envelope.machine, status: 'ok', has: true, value: answers[envelope.machine], at: 0 };
  }) as Fleet['read'];
  fleet.setMachines(machines);
  return { fleet, reads };
}

test('list_workspaces answers are read tolerantly', () => {
  assert.deepEqual(listedOf({ workspaces: [{ id: 'a', name: 'Acme' }, { id: 'b' }, { name: 'x' }, 3], active: 'a' }), [{ id: 'a', name: 'Acme' }, { id: 'b', name: 'b' }]);
  assert.equal(listedOf(null), null);
  assert.equal(listedOf({ bloqueo: {} }), null);
});

test('only the organization machine of the active organization is read, and only its answer counts', async () => {
  const { fleet, reads } = fleetWith({ cmp_org: { workspaces: [{ id: 'ws_acme', name: 'Acme' }] }, cmp_vm: { workspaces: [{ id: 'mine', name: 'Mía' }] } });
  setDanilFleet(fleet);
  assert.equal(danilAvailable('org_A'), null, 'unsettled before its machine answers');
  assert.deepEqual(danilMachines('org_A'), ['cmp_org']);
  await readDanil('org_A');
  assert.deepEqual(reads, ['cmp_org list_workspaces'], 'a personal machine is never asked');
  assert.deepEqual(danilAvailable('org_A'), [{ id: 'ws_acme', name: 'Acme' }]);
  assert.equal(danilAvailable('org_B'), null);
  assert.equal(danilAvailable(null), null);
  noteListing('cmp_vm', { workspaces: [{ id: 'ws_acme' }] });
  assert.deepEqual(danilAvailable('org_A'), [{ id: 'ws_acme', name: 'Acme' }], 'what a personal machine lists never becomes Danil');
  setDanilFleet(null);
  assert.equal(danilAvailable('org_A'), null, 'without a session nothing is Danil');
});

test('a local workspace is never Danil, so it never offers to sign in; one an organization machine lists is', async () => {
  const { fleet } = fleetWith({ cmp_org: { workspaces: [{ id: 'ws_acme', name: 'Acme' }] }, cmp_vm: { workspaces: [{ id: 'mine', name: 'Mía' }] } });
  setDanilFleet(null);
  assert.equal(isDanilWorkspace('ws_acme'), false, 'without a fleet everything is local');
  setDanilFleet(fleet);
  assert.equal(isDanilWorkspace('ws_acme'), false, 'unknown until its machine answers');
  await readDanil('org_A');
  noteListing('cmp_vm', { workspaces: [{ id: 'mine' }] });
  assert.equal(isDanilWorkspace('ws_acme'), true);
  assert.equal(isDanilWorkspace('mine'), false, 'what a personal machine lists stays local');
  assert.equal(isDanilWorkspace('created_here'), false);
  setDanilFleet(null);
});


test('a context reads only the organization machine of its own organization', async () => {
  const { fleet, reads } = fleetWith({}, [
    { ...personal, context: 'a' }, { ...org, context: 'a' },
    { ...org, id: 'other-org', organizationId: 'org_B', context: 'a' },
    { ...org, id: 'other-context', organizationId: 'org_C', context: 'b' },
  ]);
  setDanilFleet(fleet);
  await readDanilContext('org_A', 'a');
  await readDanilContext('org_C', 'a');
  assert.deepEqual(reads, ['cmp_org list_workspaces']);
  setDanilFleet(null);
});

test('the same machine keeps separate contextual source answers and classification', async () => {
  const reads: string[] = [];
  const fleet = new Fleet({ connect: () => ({ state: () => 'online', start() {}, close() {}, subscribe() {}, onState: () => () => {}, onEvents: () => () => {}, call: async () => ({ value: null, cached: null }) }) });
  fleet.setMachines(['a', 'b'].map(context => ({ ...org, context })));
  fleet.read = async envelope => {
    reads.push(`${envelope.machine}/${envelope.context}`);
    return {machine: envelope.machine,context: envelope.context,status:'ok',has:true,value:{workspaces:[{id: `ws_${envelope.context}`,name:`Account ${envelope.context}`}]},at:0};
  };
  setDanilFleet(fleet);
  await readDanilContext('org_A', 'b');
  assert.deepEqual(reads, ['cmp_org/b']);
  assert.equal(fleet.available('org_A', 'a'), null);
  assert.deepEqual(fleet.available('org_A', 'b'), [{id:'ws_b',name:'Account b'}]);
  assert.deepEqual(danilAvailableContext('org_A', 'b'), [{id:'ws_b',name:'Account b'}]);
  assert.equal(danilAvailableContext('org_A', 'a'), null);
  assert.equal(isDanilWorkspace('ws_b'),true);
  assert.equal(isDanilWorkspace('ws_a'),false);
  await readDanilContext('org_A','a',true);
  noteListing('cmp_org',{workspaces:[{id:'ws_a',name:'Account a'}]},'a');
  assert.deepEqual(fleet.available('org_A','b'),[{id:'ws_b',name:'Account b'}]);
  setDanilFleet(null);fleet.close();
});
