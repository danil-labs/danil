import assert from 'node:assert/strict';
import { boot, sleep } from './jsdom-app.mjs';
import { RESPONSES } from './mount-guard.mjs';
const scenario = process.argv[2] ?? 'sources';
let unavailable = true;
let disconnected = scenario === 'connection';
const sample = { cursor: 0, gap: false, replay: false, runtime: 'fixture', reset: false };
const app = await boot('listo', 'automatic-read-notices', {
  ...RESPONSES,
  list_projects: scenario === 'action' ? [{ id: 'vm', name: 'VM', kind: 'folder', working_directory: '/vm', sources: [] }] : [],
  send_message: () => Promise.reject('chat.context.cleanup_failed'),
  service_poll: () => disconnected ? Promise.reject('shell.service.engine_down') : sample,
  list_sources: () => scenario === 'sources' && unavailable ? Promise.reject({ what: 'Source offline' }) : [],
});
const text = () => app.w.document.body.textContent;
const toast = () => app.w.document.querySelector('[data-toast-error]');
assert.equal(toast(), null, 'Automatic source failure must not create a global error toast');
if (scenario === 'connection') {
  await sleep(2500);
  assert.ok(app.w.document.querySelector('[data-read-status]'), 'Connection failure has local status');
  assert.equal(toast(), null, 'Expected reconnection is not an action error');
  disconnected = false;
  await sleep(600);
  assert.equal(app.w.document.querySelector('[data-read-status]'), null, 'Connection recovery clears local status');
  assert.equal(toast(), null);
  console.log('PASS connection: local failure and recovery');
  process.exit(0);
}
if (scenario === 'action') {
  app.w.document.querySelector('button[aria-label="Nueva tarea en VM"]').click();
  await sleep(100);
  const draft = app.w.document.querySelector('textarea');
  draft.value = 'Keep this unsent message';
  draft.dispatchEvent(new app.w.Event('input', { bubbles: true }));
  draft.closest('form').dispatchEvent(new app.w.Event('submit', { bubbles: true, cancelable: true }));
  await sleep(300);
  assert.ok(text().includes('No se pudo retirar una copia obsoleta'), 'Explicit send rejection remains visible in the conversation');
  assert.equal(app.w.document.querySelector('textarea').value, 'Keep this unsent message');
  console.log('PASS action: rejected send remains visible and draft is preserved');
  process.exit(0);
}
const local = app.w.document.querySelector('[data-material-status]');
assert.ok(local, 'Failed source read must have a local status');
unavailable = false;
app.w.dispatchEvent(new app.w.CustomEvent('harness:sources'));
await sleep(600);
assert.equal(app.w.document.querySelector('[data-material-status]'), null, 'Successful refresh clears only the material status');
assert.equal(text().includes('Integración pendiente de aceptación'), false);
assert.deepEqual(app.failures, []);
console.log('PASS automatic sources: local failure and recovery');
process.exit(0);
