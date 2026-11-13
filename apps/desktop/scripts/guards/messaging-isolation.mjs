import { readFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { ROOT, walkFiles } from '../git.mjs';

const root = process.argv[2] ? resolve(process.argv[2]) : ROOT;
const forbidden = /\/v1\/(?:messaging|agents|inventory|knowledge)(?:\b|\/)|\/api\/(?:inbox|messaging|marketing|contacts|channels|agents|http_tools|account_variables|credits)(?:\b|\/)|danil-bff|agents_bff_fetch|packages\/attention|@terminus\/attention|(?:web|features)\/attention|capabilities\(\)\.inbox|openInbox|openBroadcasts/;
const violations = [];
for (const dir of ['src', 'src-tauri/src']) {
  for (const file of walkFiles(join(root, dir), ['.ts', '.tsx', '.rs'])) {
    const name = relative(root, file).split(sep).join('/');
    if (name.startsWith('src/web/attention/') || forbidden.test(readFileSync(file, 'utf8'))) violations.push(name);
  }
}
if (violations.length) {
  console.error(`Messaging is isolated from Desk and web: ${violations.join(', ')}`);
  process.exitCode = 1;
} else console.log('Desk and web do not mount or transport the messaging satellite.');
