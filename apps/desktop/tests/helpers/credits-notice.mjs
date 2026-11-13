import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'vite';
import solid from 'vite-plugin-solid';
import { JSDOM } from 'jsdom';
const dir = await mkdtemp(join(tmpdir(), 'danil-credits-notice-'));
const dom = new JSDOM('<main id="root"></main>', { url: 'http://localhost' });
for (const key of ['window', 'document', 'navigator', 'localStorage', 'HTMLElement', 'Element', 'Node', 'MutationObserver']) {
  Object.defineProperty(globalThis, key, { value: key === 'window' ? dom.window : dom.window[key], configurable: true });
}
localStorage.setItem('harness:lengua', 'es');
try {
  await build({ configFile: false, logLevel: 'silent', plugins: [solid()], resolve: { conditions: ['browser'] },
    build: { outDir: dir, target: 'esnext', minify: false, lib: { entry: join(dirname(fileURLToPath(import.meta.url)), 'credits-notice-fixture.tsx'), formats: ['es'], fileName: () => 'fixture.mjs' } } });
  const { mount } = await import(pathToFileURL(join(dir, 'fixture.mjs')));
  let attempts = 0;
  let release;
  const root = document.getElementById('root');
  const dispose = mount(root, () => {
    attempts++;
    return attempts === 1 ? Promise.reject({ what: 'Credits offline' }) : new Promise(resolve => { release = resolve; });
  });
  const tick = () => new Promise(resolve => setTimeout(resolve, 30));
  await tick();
  assert.equal(attempts, 1, 'Opening credits must consume the preparation promise');
  assert.ok(root.querySelector('[data-credits-status]')?.textContent.includes('Credits offline'), 'Keep the actual failure locally');
  assert.equal(root.querySelector('[role="alert"]'), null);
  assert.equal(root.textContent.includes('Integración pendiente de aceptación'), false);
  root.querySelector('[data-credits-status] button').click();
  await tick();
  assert.equal(attempts, 2);
  assert.equal(root.querySelector('[data-credits-status]'), null, 'Pending retry replaces its previous error');
  release();
  await tick();
  assert.equal(root.querySelector('[data-credits-status]'), null);
  dispose();
  console.log('PASS credits: local failure, actual reason, loading and retry recovery');
} finally { dom.window.close(); await rm(dir, { recursive: true, force: true }); }
