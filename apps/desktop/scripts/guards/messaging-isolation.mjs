import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative, resolve, sep } from 'node:path';
import { ROOT, walkFiles } from '../git.mjs';

const root = process.argv[2] ? resolve(process.argv[2]) : ROOT;
const shared = process.argv[2] ? join(root, 'packages') : resolve(root, '../../packages');
const legacy = JSON.parse(readFileSync(new URL('./messaging-isolation-legacy.json', import.meta.url), 'utf8'));
const forbidden = /(?:\/v1\/(?:bff|messaging|agents|inventory|knowledge)(?:\b|\/))|(?:["'`]messaging\/)|\/api\/(?:inbox|messaging|marketing|contacts|channels|agents|http_tools|account_variables|credits)(?:\b|\/)|danil-bff|agents_bff_fetch|["'`][^"'`]*attention\/(?:src\/)?|packages\/attention|@terminus\/attention|(?:web|features)\/attention|capabilities\(\)\.inbox|openInbox|openBroadcasts/;
const violations = [];
const retained = [];
for (const [dir, base, prefix] of [
  [join(root, 'src'), root, ''], [join(root, 'src-tauri/src'), root, ''],
  [join(root, 'alpha-entry'), root, ''], [shared, shared, 'packages/'],
]) {
  if (!existsSync(dir)) continue;
  for (const file of walkFiles(dir, ['.ts', '.tsx', '.rs', '.mjs', '.js'])) {
    const name = prefix + relative(base, file).split(sep).join('/');
    if (/(?:^|\/)(?:tests?|node_modules)\//.test(name) || /\.test\.[cm]?[jt]sx?$/.test(name)) continue;
    const source = readFileSync(file, 'utf8');
    if (!name.startsWith('src/web/attention/') && !forbidden.test(source)) continue;
    const digest = createHash('sha256').update(source).digest('hex');
    if (legacy.files[name]?.sha256 === digest) retained.push(name);
    else violations.push(name);
  }
}
if (retained.length) console.log(`Frozen legacy outside the web entry (pending separate retirement): ${retained.join(', ')}`);
if (violations.length) {
  console.error(`Messaging must stay isolated: ${violations.join(', ')}`);
  process.exitCode = 1;
} else console.log('No new messaging consumer in web, shared packages or the assets worker.');
