// Prueba el empaquetado y promoción por SO de la release sin construir ni
// publicar nada: corre los pasos `run:` del workflow y `release-manifest.mjs`
// con archivos de prueba y llaves temporales, y mira lo que dejan. Los pasos se
// buscan por `id`, no por `name`: el nombre es documentación y cambia cuando se
// afina el texto.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, cpSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename, dirname, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const monorepo = resolve(repo, '..', '..');
const loadYaml = (relPath) =>
  JSON.parse(
    execFileSync(
      'ruby',
      ['-ryaml', '-rjson', '-e', 'puts JSON.generate(YAML.load_file(ARGV[0]))', relPath],
      { cwd: monorepo, encoding: 'utf8' },
    ),
  );

const workflow = loadYaml('.github/workflows/publish.yml');
const promoteWorkflow = loadYaml('.github/workflows/promote-update.yml');
const tauriConf = JSON.parse(readFileSync(join(repo, 'src-tauri/tauri.conf.json'), 'utf8'));
const { verifyFile } = await import(pathToFileURL(join(repo, 'npx/lib/minisign.mjs')));
const { detectLocale, t } = await import(pathToFileURL(join(repo, 'npx/lib/i18n.mjs')));
const releaseManifest = await import(pathToFileURL(join(repo, 'scripts/release-manifest.mjs')));

const scratch = mkdtempSync(join(tmpdir(), 'terminus-release-test-'));
const pnpm = execFileSync('which', ['pnpm'], { encoding: 'utf8' }).trim();
const cli = ['--package=@tauri-apps/cli@2.11.4', 'dlx', 'tauri'];
const step = (wf, job, id) => wf.jobs[job].steps.find((s) => s.id === id).run;
const run = (code, cwd, env, expected = 0) => {
  const r = spawnSync('bash', ['-c', code], { cwd, env: { ...process.env, ...env }, encoding: 'utf8', timeout: 120000 });
  assert.equal(r.status, expected, `${r.error || ''}\n${r.stdout}\n${r.stderr}`);
  return r;
};

try {
  // 1) Contrato del endpoint por SO en tauri.conf.json y en ambos workflows.
  assert.deepEqual(tauriConf.plugins.updater.endpoints, [releaseManifest.UPDATER_ENDPOINT]);
  assert.equal(workflow.env.UPDATER_ENDPOINT, releaseManifest.UPDATER_ENDPOINT);
  assert.equal(workflow.env.PUBLIC_KEY, tauriConf.plugins.updater.pubkey);
  assert.equal(promoteWorkflow.env.PUBLIC_KEY, tauriConf.plugins.updater.pubkey);
  console.log('PASS updater endpoint & key contract across tauri.conf.json, publish.yml, and promote-update.yml');

  // 2) Estructura y disparadores de publish.yml y promote-update.yml.
  // Ruby (YAML 1.1) lee la clave `on` como el booleano `true`.
  const triggers = workflow.on ?? workflow.true;
  assert(triggers.push.tags.includes('v*'), 'publish dejó de dispararse por tag');
  assert(!triggers.pull_request && !triggers.pull_request_target, 'publish no corre en PRs');
  assert.equal(triggers.workflow_dispatch.inputs.dry_run.type, 'boolean');
  assert.equal(triggers.workflow_dispatch.inputs.rebuild.type, 'boolean');
  assert.equal(triggers.workflow_dispatch.inputs.platforms.type, 'choice');
  assert.deepEqual(triggers.workflow_dispatch.inputs.platforms.options, ['all', 'macos', 'windows', 'linux']);
  assert(!('prerelease' in triggers.workflow_dispatch.inputs), 'publish siempre hace staging como prerelease; la promoción vive en promote-update.yml');

  assert.equal(workflow.jobs.build.strategy.matrix.include, '${{ fromJson(needs.check.outputs.matrix) }}');
  assert.deepEqual(workflow.jobs['test-macos'].strategy.matrix.so, ['macos-latest']);
  assert.match(workflow.jobs['test-macos'].if, /,macos,/);
  assert.match(workflow.jobs['test-linux'].if, /,linux,/);
  for (const job of ['test-macos', 'test-linux']) {
    assert(workflow.jobs.publish.needs.includes(job), `publish no espera a ${job}`);
  }
  // Cuando se construye un subconjunto (ej. solo macos), los tests de los otros SO se saltan:
  // `publish` debe tolerar `skipped` sin aceptar `failure` ni `cancelled`.
  assert.match(workflow.jobs.publish.if, /!failure\(\)/);
  assert.match(workflow.jobs.publish.if, /needs\.test-macos\.result == 'skipped'/);
  assert.match(workflow.jobs.publish.if, /needs\.test-linux\.result == 'skipped'/);

  const promoteTriggers = promoteWorkflow.on ?? promoteWorkflow.true;
  assert(promoteTriggers.workflow_dispatch && !promoteTriggers.push && !promoteTriggers.pull_request, 'promote-update solo corre bajo workflow_dispatch');
  assert.equal(promoteTriggers.workflow_dispatch.inputs.version.required, true);
  assert.equal(promoteTriggers.workflow_dispatch.inputs.platforms.type, 'choice');
  assert.deepEqual(promoteTriggers.workflow_dispatch.inputs.platforms.options, ['macos', 'windows', 'linux', 'all']);
  assert.equal(promoteTriggers.workflow_dispatch.inputs.dry_run.type, 'boolean');
  console.log('PASS workflow triggers, per-OS matrix, and promote-update.yml contract');

  // 3) parsePlatforms y buildMatrix (un solo dueño en release-manifest.mjs).
  assert.deepEqual(releaseManifest.parsePlatforms('all'), ['windows', 'macos', 'linux']);
  assert.deepEqual(releaseManifest.parsePlatforms('macos'), ['macos']);
  assert.deepEqual(releaseManifest.parsePlatforms('linux, macos, linux'), ['macos', 'linux']);
  assert.throws(() => releaseManifest.parsePlatforms(''), /plataform/i);
  assert.throws(() => releaseManifest.parsePlatforms('darwin-x86_64'), /plataform/i);
  assert.deepEqual(
    releaseManifest.buildMatrix('all').map((m) => m.name),
    ['windows', 'macos', 'linux'],
  );
  assert.deepEqual(releaseManifest.buildMatrix('macos'), [{ so: 'macos-latest', name: 'macos' }]);

  // 4) Llaves temporales y empaquetado real con los pasos de publish.yml.
  execFileSync(pnpm, [...cli, 'signer', 'generate', '--ci', '-p', '', '-w', join(scratch, 'test.key')], { encoding: 'utf8', stdio: 'pipe' });
  const publicKeyB64 = readFileSync(join(scratch, 'test.key.pub'), 'utf8').trim();
  const signing = { TAURI_SIGNING_PRIVATE_KEY: readFileSync(join(scratch, 'test.key'), 'utf8').trim(), TAURI_SIGNING_PRIVATE_KEY_PASSWORD: '' };
  const bin = join(scratch, 'bin');
  mkdirSync(bin);
  writeFileSync(join(bin, 'pnpm'), `#!/bin/sh\nshift\nexec '${pnpm.replaceAll("'", "'\\''")}' --package=@tauri-apps/cli@2.11.4 dlx tauri "$@"\n`, { mode: 0o755 });

  const merged = join(scratch, 'merged');
  mkdirSync(join(merged, 'release-assets'), { recursive: true });
  const macOnlyDir = join(scratch, 'mac-only');
  mkdirSync(join(macOnlyDir, 'release-assets'), { recursive: true });

  const matrices = releaseManifest.buildMatrix('all');
  for (const row of matrices) {
    const cwd = join(scratch, row.name);
    const bundle = join(cwd, row.name === 'macos' ? 'src-tauri/target/aarch64-apple-darwin/release/bundle' : 'src-tauri/target/release/bundle');
    const resources = join(cwd, 'src-tauri/resources');
    mkdirSync(bundle, { recursive: true });
    mkdirSync(resources, { recursive: true });
    writeFileSync(join(resources, 'git-version.txt'), 'test git\n');
    const archive = { windows: 'Danil_9.9.9_x64-setup.exe', macos: 'Danil.app.tar.gz', linux: 'Danil_9.9.9_amd64.AppImage' }[row.name];
    writeFileSync(join(bundle, archive), `Fixture for ${row.name}`);
    execFileSync(pnpm, [...cli, 'signer', 'sign', join(bundle, archive)], { env: { ...process.env, ...signing }, stdio: 'pipe' });
    if (row.name === 'macos') writeFileSync(join(bundle, 'Danil_9.9.9_aarch64.dmg'), row.name);
    const code = step(workflow, 'build', 'collect-artifacts').replaceAll('${{ matrix.name }}', row.name);
    const env = { ...signing, PATH: `${bin}:${process.env.PATH}`, V: '9.9.9', GITHUB_STEP_SUMMARY: join(cwd, 'summary') };
    run(code, cwd, env);
    const files = readdirSync(join(cwd, 'release-assets'));
    if (row.name === 'macos') {
      assert.deepEqual(files.sort(), ['Danil.app.tar.gz', 'Danil.app.tar.gz.sig', 'Danil-macOS.dmg', 'Terminus-macOS.dmg', 'Danil_9.9.9_aarch64.dmg'].sort());
      assert.deepEqual(readFileSync(join(cwd, 'release-assets/Danil-macOS.dmg')), readFileSync(join(cwd, 'release-assets/Terminus-macOS.dmg')));
      for (const f of files) cpSync(join(cwd, 'release-assets', f), join(macOnlyDir, 'release-assets', f));
      await assert.rejects(
        verifyFile({ filePath: join(bundle, archive), sigFileB64: readFileSync(join(bundle, `${archive}.sig`), 'utf8'), publicKeyB64, expectedFileName: 'Danil-Other.app.tar.gz' }),
        /la firma es para|the signature is for/,
      );
      rmSync(join(bundle, 'Danil_9.9.9_aarch64.dmg'));
      run(code, cwd, env, 1);
    }
    if (row.name === 'linux') {
      assert.deepEqual(files.sort(), ['Danil-Linux-x86_64.AppImage', 'Terminus-Linux-x86_64.AppImage', 'Danil_9.9.9_amd64.AppImage', 'Danil_9.9.9_amd64.AppImage.sig'].sort());
      for (const name of ['Danil-Linux-x86_64.AppImage', 'Terminus-Linux-x86_64.AppImage']) {
        assert.deepEqual(readFileSync(join(cwd, 'release-assets', name)), readFileSync(join(cwd, 'release-assets/Danil_9.9.9_amd64.AppImage')));
      }
      rmSync(join(bundle, `${archive}.sig`));
      run(code, cwd, env, 1);
    }
    for (const f of files) {
      assert(!readdirSync(join(merged, 'release-assets')).includes(f), `Asset collision: ${f}`);
      cpSync(join(cwd, 'release-assets', f), join(merged, 'release-assets', f));
    }
  }

  // 5) Corrida de UN SOLO SO (solo macOS): genera `latest-darwin.json` y NO genera `latest.json` incompleto.
  const quotedManifestScript = `'${join(repo, 'scripts/release-manifest.mjs').replaceAll("'", "'\\''")}'`;
  const macOnlyStep = step(workflow, 'publish', 'build-manifest').replaceAll('apps/desktop/scripts/release-manifest.mjs', quotedManifestScript);
  run(macOnlyStep, macOnlyDir, {
    V: '9.9.9',
    PLATFORMS: 'macos',
    GITHUB_REPOSITORY: 'danil-labs/danil',
    NOTE_ES: 'Solo macOS',
    NOTE_EN: 'macOS only',
  });
  assert(existsSync(join(macOnlyDir, 'release-assets/latest-darwin.json')), 'falta latest-darwin.json');
  assert(!existsSync(join(macOnlyDir, 'release-assets/latest-windows.json')), 'no debe escribir latest-windows.json');
  assert(!existsSync(join(macOnlyDir, 'release-assets/latest-linux.json')), 'no debe escribir latest-linux.json');
  assert(!existsSync(join(macOnlyDir, 'release-assets/latest.json')), 'una corrida parcial no debe emitir latest.json combinado');
  const macManifest = JSON.parse(readFileSync(join(macOnlyDir, 'release-assets/latest-darwin.json'), 'utf8'));
  assert.deepEqual(Object.keys(macManifest.platforms), ['darwin-aarch64']);
  await releaseManifest.verifyManifest({
    manifest: macManifest,
    platform: 'macos',
    version: '9.9.9',
    repo: 'danil-labs/danil',
    publicKeyB64,
    assetPath: join(macOnlyDir, 'release-assets/Danil.app.tar.gz'),
  });
  await assert.rejects(
    releaseManifest.verifyManifest({
      manifest: macManifest,
      platform: 'macos',
      version: '9.9.8',
      repo: 'danil-labs/danil',
      publicKeyB64,
      assetPath: join(macOnlyDir, 'release-assets/Danil.app.tar.gz'),
    }),
    /versión|version/i,
  );
  console.log('PASS single-OS staging (macos): emits latest-darwin.json only and passes cryptographic verifyManifest');

  // 6) Corrida completa (windows,macos,linux): emite los 3 `latest-<target>.json` y además `latest.json` combinado.
  const allStep = step(workflow, 'publish', 'build-manifest').replaceAll('apps/desktop/scripts/release-manifest.mjs', quotedManifestScript);
  const base = { V: '9.9.9', PLATFORMS: 'windows,macos,linux', GITHUB_REPOSITORY: 'danil-labs/danil' };
  run(allStep, merged, { ...base, NOTE_ES: 'Prueba', NOTE_EN: 'Test' });
  for (const file of ['latest-windows.json', 'latest-darwin.json', 'latest-linux.json', 'latest.json']) {
    assert(existsSync(join(merged, 'release-assets', file)), `falta ${file}`);
  }
  let manifest = JSON.parse(readFileSync(join(merged, 'release-assets/latest.json'), 'utf8'));
  assert.equal(manifest.notes, 'Test');
  assert.deepEqual(manifest.notes_by_locale, { es: 'Prueba', en: 'Test' });

  run(allStep, merged, { ...base, NOTE_ES: 'Solo español', NOTE_EN: '' });
  manifest = JSON.parse(readFileSync(join(merged, 'release-assets/latest.json'), 'utf8'));
  assert.equal(manifest.notes, 'Solo español');
  assert.deepEqual(manifest.notes_by_locale, { es: 'Solo español', en: '' });
  console.log('PASS notes: notes + notes_by_locale, with and without an English note');

  assert.deepEqual(Object.keys(manifest.platforms).sort(), ['windows-x86_64', 'darwin-aarch64', 'linux-x86_64'].sort());
  for (const [platformName, manifestFile] of [
    ['windows', 'latest-windows.json'],
    ['macos', 'latest-darwin.json'],
    ['linux', 'latest-linux.json'],
  ]) {
    const perOs = JSON.parse(readFileSync(join(merged, 'release-assets', manifestFile), 'utf8'));
    const entry = Object.values(perOs.platforms)[0];
    const name = basename(new URL(entry.url).pathname);
    await releaseManifest.verifyManifest({
      manifest: perOs,
      platform: platformName,
      version: '9.9.9',
      repo: 'danil-labs/danil',
      publicKeyB64,
      assetPath: join(merged, 'release-assets', name),
    });
    console.log(`PASS ${platformName} (${manifestFile}): correct asset, valid Tauri signature, accepted by npx`);
  }

  // 7) npx: selección de plataforma y URL por SO (`updater-stable/latest-<target>.json`).
  const platformSource = readFileSync(join(repo, 'npx/lib/platform.mjs'), 'utf8');
  const detect = async (platform, arch) => {
    const { detectPlatform } = await import(
      `data:text/javascript,${encodeURIComponent(
        platformSource
          .replace('const platform = process.platform;', `const platform = '${platform}';`)
          .replace('const arch = process.arch;', `const arch = '${arch}';`),
      )}`
    );
    return detectPlatform();
  };
  const mac = await detect('darwin', 'arm64');
  assert.equal(mac.key, 'darwin-aarch64');
  assert.equal(mac.target, 'darwin');
  assert.equal(mac.installerKind, 'macos');
  const macIntel = await detect('darwin', 'x64');
  assert.equal(macIntel.key, null);
  assert.equal(macIntel.target, null);
  assert.equal(macIntel.installerKind, 'unknown');
  const win = await detect('win32', 'x64');
  assert.equal(win.key, 'windows-x86_64');
  assert.equal(win.target, 'windows');
  const linux = await detect('linux', 'x64');
  assert.equal(linux.key, 'linux-x86_64');
  assert.equal(linux.target, 'linux');
  assert.equal(linux.installerKind, 'linux-appimage');

  // Control negativo criptográfico: un byte alterado en el artefacto falla verifyManifest.
  const tamperedPath = join(macOnlyDir, 'release-assets/Danil.app.tar.gz.tampered');
  writeFileSync(tamperedPath, 'Tampered bytes');
  await assert.rejects(
    releaseManifest.verifyManifest({
      manifest: macManifest,
      platform: 'macos',
      version: '9.9.9',
      repo: 'danil-labs/danil',
      publicKeyB64,
      assetPath: tamperedPath,
    }),
    /firma|signature/i,
  );

  const npxBin = readFileSync(join(repo, 'npx/bin.mjs'), 'utf8');
  assert.match(npxBin, /https:\/\/github\.com\/danil-labs\/danil\/releases\/download\/updater-stable/);
  assert.match(npxBin, /\$\{UPDATER_STABLE_BASE\}\/latest-\$\{plat\.target\}\.json/);
  console.log('PASS npx platform selection & per-OS updater-stable manifest URL');

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

  // 8) Seguridad en workflows: sin carpeta `dist/`, sin `gh release delete` en publish.yml,
  //    y `promote-update.yml` nunca marca `updater-stable` como `--latest`.
  const publishYml = readFileSync(join(monorepo, '.github/workflows/publish.yml'), 'utf8');
  assert(!/(?<![\w-])dist\//.test(publishYml), 'publish.yml usa la carpeta dist/, que es la de Vite');
  assert(!/gh release delete/.test(publishYml), 'publish.yml no debe borrar una release versionada (rompería otros SO)');
  assert.match(publishYml, /gh release upload.*--clobber/);
  const promoteYml = readFileSync(join(monorepo, '.github/workflows/promote-update.yml'), 'utf8');
  assert(!/--latest(?!\=false)/.test(promoteYml), 'promote-update.yml nunca debe marcar updater-stable como --latest');
  assert.match(promoteYml, /gh release upload.*updater-stable.*--clobber/);
  console.log('PASS workflow safety invariants: immutable other-OS assets & pointer release never --latest');
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
