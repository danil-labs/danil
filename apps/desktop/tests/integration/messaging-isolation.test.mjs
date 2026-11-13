import assert from 'node:assert/strict';
import test from 'node:test';
import { boot } from '../helpers/jsdom-app.mjs';
import { engine } from '../helpers/fake-relay.mjs';

test('Desk mounts tasks and engine attention without querying the messaging session', async () => {
  const app = await boot('listo', 'desk-messaging-isolation', {
    ...engine, launcher_state: { phase: 'ready' }, window_ready: null, window_vitals: null,
    list_language_packs: [], list_bundled_language_packs: [],
    list_accounts: [], list_dependencies: [], tasks_awaiting_quota: [],
    list_workspace_attention: [{ workspace: 'w', tasks: [{ session: 't1', project: 'p1', state: 'unseen' }] }],
    service_poll: { cursor: 0, runtime: 'fixture', reset: false },
  });
  assert.ok(app.w.document.querySelector('[data-tira]'));
  assert.ok(app.commands.includes('list_workspace_attention'), 'engine task attention remains mounted');
  assert.ok(!app.commands.some(command => /agents_session_status|agents_bff_fetch/.test(command)), app.commands.join(', '));
  assert.equal(app.w.document.querySelector('[data-attention-feature],[data-broadcasts],[data-inbox]'), null);
});
