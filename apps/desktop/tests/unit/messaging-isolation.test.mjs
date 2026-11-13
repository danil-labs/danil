import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const guard = new URL('../../scripts/guards/messaging-isolation.mjs', import.meta.url);
for (const code of ['/v1/messaging/conversations', '/v1/agents', '/v1/inventory', '/v1/knowledge', '/api/inbox/conversations', '/api/marketing/campaigns', '/api/agents', '/api/channels', '/api/credits/v1/chat/completions', 'danil-bff', 'agents_bff_fetch', '../../web/attention/Attention', 'capabilities().inbox']) {
  test(`isolation rejects ${code}`, t => {
    const root = mkdtempSync(join(tmpdir(), 'danil-no-messaging-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    mkdirSync(join(root, 'src'), { recursive: true });
    mkdirSync(join(root, 'src-tauri/src'), { recursive: true });
    writeFileSync(join(root, 'src/entry.ts'), `const route = ${JSON.stringify(code)};`);
    const result = spawnSync(process.execPath, [fileURLToPath(guard), root], { encoding: 'utf8' });
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /src\/entry.ts/);
  });
}

test('engine attention and task delivery rows remain permitted', t => {
  const root = mkdtempSync(join(tmpdir(), 'danil-task-attention-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'src'), { recursive: true });
  mkdirSync(join(root, 'src-tauri/src'), { recursive: true });
  writeFileSync(join(root, 'src/attention.ts'), "invoke('list_workspace_attention'); invoke('mark_task_seen'); const row = 'task_finished';");
  const result = spawnSync(process.execPath, [fileURLToPath(guard), root], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
});
