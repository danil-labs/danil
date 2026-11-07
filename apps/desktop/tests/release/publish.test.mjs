// Prueba el empaquetado de la release sin construir ni publicar nada: corre los
// pasos `run:` del workflow con archivos de prueba y llaves temporales, y mira
// lo que dejan. Los pasos se buscan por `id`, no por `name`: el nombre es
// documentación y cambia cuando se afina el texto.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename, dirname, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const monorepo = resolve(repo, '..', '..');
const workflow = JSON.parse(execFileSync('ruby', ['-ryaml', '-rjson', '-e', 'puts JSON.generate(YAML.load_file(ARGV[0]))', '.github/workflows/publish.yml'], { cwd: monorepo, encoding: 'utf8' }));
const { verifyFile } = await import(pathToFileURL(join(repo, 'npx/lib/minisign.mjs')));
const { detectLocale, t } = await import(pathToFileURL(join(repo, 'npx/lib/i18n.mjs')));
const scratch = mkdtempSync(join(tmpdir(), 'terminus-release-test-'));
const pnpm = execFileSync('which', ['pnpm'], { encoding: 'utf8' }).trim();
const cli = ['--package=@tauri-apps/cli@2.11.4', 'dlx', 'tauri'];
const step = (job, id) => workflow.jobs[job].steps.find(s => s.id === id).run;
const run = (code, cwd, env, expected = 0) => {
  const r = spawnSync('bash', ['-c', code], { cwd, env: { ...process.env, ...env }, encoding: 'utf8', timeout: 120000 });
  assert.equal(r.status, expected, `${r.error || ''}\n${r.stdout}\n${r.stderr}`);
  return r;
};
try {
  execFileSync(pnpm, [...cli, 'signer', 'generate', '--ci', '-p', '', '-w', join(scratch, 'test.key')], { encoding: 'utf8', stdio: 'pipe' });
  const publicKeyB64 = readFileSync(join(scratch, 'test.key.pub'), 'utf8').trim();
  const signing = { TAURI_SIGNING_PRIVATE_KEY: readFileSync(join(scratch, 'test.key'), 'utf8').trim(), TAURI_SIGNING_PRIVATE_KEY_PASSWORD: '' };
  const bin = join(scratch, 'bin');
  mkdirSync(bin);
  writeFileSync(join(bin, 'pnpm'), `#!/bin/sh\nshift\nexec '${pnpm.replaceAll("'", "'\\''")}' --package=@tauri-apps/cli@2.11.4 dlx tauri "$@"\n`, { mode: 0o755 });
  const merged = join(scratch, 'merged');
  mkdirSync(join(merged, 'release-assets'), { recursive: true });
  // Las filas de `build` las escribe `check` (paso `platforms`): las tres por
  // omisión (y en un tag, sin inputs); solo macOS con `platforms=macos`, que
  // únicamente vale como prerelease o ensayo.
  const rows = (env, expected = 0) => {
    const out = join(scratch, `platforms-${Object.values(env).join('-')}`);
    writeFileSync(out, '');
    run(step('check', 'platforms'), scratch, { GITHUB_OUTPUT: out, DRY_RUN: 'false', PRERELEASE: 'false', ...env }, expected);
    const line = readFileSync(out, 'utf8').split('\n').find(l => l.startsWith('matrix='));
    return line ? JSON.parse(line.slice('matrix='.length)) : null;
  };
  assert.equal(workflow.jobs.build.strategy.matrix.include, '${{ fromJSON(needs.check.outputs.matrix) }}');
  const matrices = rows({ PLATFORMS: 'all' });
  assert.deepEqual(matrices.map(m => m.name), ['windows', 'macos', 'linux']);
  assert.deepEqual(rows({ PLATFORMS: 'macos', PRERELEASE: 'true' }).map(m => m.name), ['macos']);
  assert.deepEqual(rows({ PLATFORMS: 'macos', DRY_RUN: 'true' }).map(m => m.name), ['macos']);
  assert.equal(rows({ PLATFORMS: 'macos' }, 1), null, 'platforms=macos no puede publicar como latest');
  assert.equal(rows({ PLATFORMS: 'windows' }, 1), null);
  assert.equal(workflow.jobs['test-linux'].if, "inputs.platforms != 'macos'");
  assert.deepEqual(workflow.jobs['test-macos'].strategy.matrix.so, ['macos-latest', 'macos-15-intel']);
  for (const job of ['test-macos', 'test-linux']) assert(workflow.jobs.publish.needs.includes(job), `publish no espera a ${job}`);
  // Ruby (YAML 1.1) lee la clave `on` como el booleano `true`.
  const triggers = workflow.on ?? workflow.true;
  assert(triggers.push.tags.includes('v*'), 'publicar dejó de dispararse por tag');
  assert(!triggers.pull_request && !triggers.pull_request_target, 'publish no corre en PRs');
  assert.equal(triggers.workflow_dispatch.inputs.dry_run.type, 'boolean');
  assert.equal(triggers.workflow_dispatch.inputs.rebuild.type, 'boolean');
  for (const row of matrices) {
    const cwd = join(scratch, row.name);
    const bundle = join(cwd, row.name === 'macos' ? 'src-tauri/target/universal-apple-darwin/release/bundle' : 'src-tauri/target/release/bundle');
    const resources = join(cwd, 'src-tauri/resources');
    mkdirSync(bundle, { recursive: true });
    mkdirSync(resources, { recursive: true });
    writeFileSync(join(resources, 'git-version.txt'), 'test git\n');
    const archive = { windows: 'Danil_9.9.9_x64-setup.exe', macos: 'Danil.app.tar.gz', linux: 'Danil_9.9.9_amd64.AppImage' }[row.name];
    writeFileSync(join(bundle, archive), `Fixture for ${row.name}`);
    execFileSync(pnpm, [...cli, 'signer', 'sign', join(bundle, archive)], { env: { ...process.env, ...signing }, stdio: 'pipe' });
    if (row.name === 'macos') writeFileSync(join(bundle, 'Danil_9.9.9_universal.dmg'), row.name);
    const code = step('build', 'collect-artifacts').replaceAll('${{ matrix.name }}', row.name);
    const env = { ...signing, PATH: `${bin}:${process.env.PATH}`, V: '9.9.9', MAC_ARCH: row.arch || '', GITHUB_STEP_SUMMARY: join(cwd, 'summary') };
    run(code, cwd, env);
    const files = readdirSync(join(cwd, 'release-assets'));
    if (row.name === 'macos') {
      // Los nombres estables `Terminus-*` siguen: terminus.danil.ai y los npx publicados los enlazan.
      assert.deepEqual(files.sort(), ['Danil.app.tar.gz', 'Danil.app.tar.gz.sig', 'Danil-macOS.dmg', 'Danil-macOS-Intel.dmg', 'Terminus-macOS.dmg', 'Terminus-macOS-Intel.dmg', 'Danil_9.9.9_universal.dmg'].sort());
      for (const name of ['Danil-macOS-Intel.dmg', 'Terminus-macOS.dmg', 'Terminus-macOS-Intel.dmg']) assert.deepEqual(readFileSync(join(cwd, 'release-assets/Danil-macOS.dmg')), readFileSync(join(cwd, 'release-assets', name)));
      await assert.rejects(verifyFile({ filePath: join(bundle, archive), sigFileB64: readFileSync(join(bundle, `${archive}.sig`), 'utf8'), publicKeyB64, expectedFileName: 'Danil-Intel.app.tar.gz' }), /la firma es para|the signature is for/);
      rmSync(join(bundle, 'Danil_9.9.9_universal.dmg'));
      run(code, cwd, env, 1);
    }
    if (row.name === 'linux') {
      assert.deepEqual(files.sort(), ['Danil-Linux-x86_64.AppImage', 'Terminus-Linux-x86_64.AppImage', 'Danil_9.9.9_amd64.AppImage', 'Danil_9.9.9_amd64.AppImage.sig'].sort());
      for (const name of ['Danil-Linux-x86_64.AppImage', 'Terminus-Linux-x86_64.AppImage']) assert.deepEqual(readFileSync(join(cwd, 'release-assets', name)), readFileSync(join(cwd, 'release-assets/Danil_9.9.9_amd64.AppImage')));
      rmSync(join(bundle, `${archive}.sig`));
      run(code, cwd, env, 1);
    }
    for (const f of files) {
      assert(!readdirSync(join(merged, 'release-assets')).includes(f), `Asset collision: ${f}`);
      cpSync(join(cwd, 'release-assets', f), join(merged, 'release-assets', f));
    }
  }

  // El manifiesto, con las notas en los dos idiomas y con la transición: sin
  // nota en inglés, `notes` cae a la de español y `notes_by_locale.en` queda vacío.
  const base = { V: '9.9.9', GITHUB_REPOSITORY: 'danil-labs/danil' };
  run(step('publish', 'verify-signature-names'), merged, base);
  run(step('publish', 'build-manifest'), merged, { ...base, NOTE_ES: 'Prueba', NOTE_EN: 'Test' });
  let manifest = JSON.parse(readFileSync(join(merged, 'release-assets/latest.json'), 'utf8'));
  assert.equal(manifest.notes, 'Test');
  assert.deepEqual(manifest.notes_by_locale, { es: 'Prueba', en: 'Test' });
  run(step('publish', 'build-manifest'), merged, { ...base, NOTE_ES: 'Solo español', NOTE_EN: '' });
  manifest = JSON.parse(readFileSync(join(merged, 'release-assets/latest.json'), 'utf8'));
  assert.equal(manifest.notes, 'Solo español');
  assert.deepEqual(manifest.notes_by_locale, { es: 'Solo español', en: '' });
  console.log('PASS notes: notes + notes_by_locale, with and without an English note');

  assert.deepEqual(Object.keys(manifest.platforms).sort(), ['windows-x86_64', 'darwin-aarch64', 'darwin-x86_64', 'linux-x86_64'].sort());
  {
    // Solo macOS: el manifiesto trae darwin y nada más, aunque no haya archivos de Windows ni Linux.
    const macOnly = join(scratch, 'merged-macos');
    mkdirSync(join(macOnly, 'release-assets'), { recursive: true });
    for (const f of ['Danil.app.tar.gz', 'Danil.app.tar.gz.sig']) cpSync(join(merged, 'release-assets', f), join(macOnly, 'release-assets', f));
    run(step('publish', 'build-manifest'), macOnly, { ...base, NOTE_ES: 'Prueba', NOTE_EN: 'Test', PLATFORMS: 'macos' });
    const macManifest = JSON.parse(readFileSync(join(macOnly, 'release-assets/latest.json'), 'utf8'));
    assert.deepEqual(Object.keys(macManifest.platforms).sort(), ['darwin-aarch64', 'darwin-x86_64']);
    assert.deepEqual(macManifest.platforms['darwin-aarch64'], manifest.platforms['darwin-aarch64']);
    console.log('PASS platforms=macos: latest.json only carries darwin');
  }
  assert.deepEqual(manifest.platforms['darwin-aarch64'], manifest.platforms['darwin-x86_64']);
  for (const [platform, entry] of Object.entries(manifest.platforms)) {
    const name = basename(new URL(entry.url).pathname);
    await verifyFile({ filePath: join(merged, 'release-assets', name), sigFileB64: entry.signature, publicKeyB64, expectedFileName: name });
    console.log(`PASS ${platform}: correct asset, valid Tauri signature, accepted by npx`);
  }

  const platformSource = readFileSync(join(repo, 'npx/lib/platform.mjs'), 'utf8');
  // Se reemplazan las dos líneas exactas y no la primera mención: `process.platform`
  // también aparece en un comentario, y ahí el reemplazo no cambiaría nada.
  const detect = async (platform, arch) => {
    const { detectPlatform } = await import(`data:text/javascript,${encodeURIComponent(platformSource.replace('const platform = process.platform;', `const platform = '${platform}';`).replace('const arch = process.arch;', `const arch = '${arch}';`))}`);
    return detectPlatform();
  };
  for (const [arch, expected] of [['x64', 'darwin-x86_64'], ['arm64', 'darwin-aarch64']]) {
    assert.equal((await detect('darwin', arch)).key, expected);
  }
  const linux = await detect('linux', 'x64');
  assert.equal(linux.key, 'linux-x86_64');
  assert.equal(linux.installerKind, 'linux-appimage');
  console.log('PASS npx platform selection: Mac Intel, Apple Silicon and Linux x86_64');

  // El idioma de los mensajes de `npx`: el entorno manda y el inglés es el
  // valor por defecto.
  assert.equal(detectLocale({ LC_ALL: 'es_MX.UTF-8', LANG: 'en_US.UTF-8' }), 'es');
  assert.equal(detectLocale({ LANG: 'es_ES.UTF-8' }), 'es');
  assert.equal(detectLocale({ LC_ALL: 'en_GB.UTF-8', LANG: 'es_MX.UTF-8' }), 'en');
  assert.equal(detectLocale({ LC_ALL: 'fr_FR.UTF-8' }), 'en');
  assert.equal(detectLocale({ LANG: 'C' }), detectLocale({}));
  const before = { LC_ALL: process.env.LC_ALL };
  process.env.LC_ALL = 'es_MX.UTF-8';
  assert.match(t('otherKey', { got: 'a', expected: 'b' }), /otra clave/);
  process.env.LC_ALL = 'en_US.UTF-8';
  assert.match(t('otherKey', { got: 'a', expected: 'b' }), /different key/);
  if (before.LC_ALL === undefined) delete process.env.LC_ALL; else process.env.LC_ALL = before.LC_ALL;
  console.log('PASS npx language: Spanish or English by system locale, English by default');

  // `dist/` es la salida de Vite en harness-app: si el workflow junta ahí los
  // instaladores, el frontend compilado (`index.html`, `assets/`) se cuela en la
  // release y `gh release create` falla al topar con una carpeta. Pasó en v0.2.7.
  const publishYml = readFileSync(join(monorepo, '.github/workflows/publish.yml'), 'utf8');
  assert(!/(?<![\w-])dist\//.test(publishYml), 'publish.yml usa la carpeta dist/, que es la de Vite');
  console.log('PASS installers are collected outside Vite\'s dist/');

  console.log('PASS negative controls: stale filename signature rejected; missing universal DMG and missing AppImage signature abort collection');
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
