import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { closeSync, existsSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const main = process.env.DANIL_CLI_TEST_MAIN ?? fileURLToPath(new URL("../../src-tauri/src/main.rs", import.meta.url));
const windows = process.platform === "win32";
const triple = { win32: "x86_64-pc-windows-msvc", darwin: `${process.arch === "arm64" ? "aarch64" : "x86_64"}-apple-darwin`, linux: "x86_64-unknown-linux-gnu" }[process.platform];
const sidecar = fileURLToPath(new URL(`../../src-tauri/binaries/seldon-runtime-${triple}${windows ? ".exe" : ""}`, import.meta.url));

test("el main de producción reenvía la CLI con pipes, archivos, salida descartada y sin consola nueva", async (t) => {
  const scratch = mkdtempSync(join(tmpdir(), "terminus-forward-"));
  const binary = join(scratch, windows ? "terminus.exe" : "terminus");
  const engine = join(scratch, windows ? "seldon-runtime.exe" : "seldon-runtime");
  const run = (args, options = {}) => {
    const result = spawnSync(binary, args, { encoding: "utf8", timeout: 10_000, windowsHide: true, ...options });
    assert.ifError(result.error);
    return result;
  };
  try {
    const stub = join(scratch, "app_lib.rs");
    const library = join(scratch, "libapp_lib.rlib");
    writeFileSync(stub, `pub struct Error { pub message_key: &'static str }
pub fn background_dispatch() {}
pub fn launch() -> Result<(), Error> { println!("window"); Ok(()) }
pub fn stop_engine() -> i32 { println!("stop-engine"); 0 }
`);
    execFileSync("rustc", ["--edition=2021", "--crate-name", "app_lib", "--crate-type=rlib", stub, "-o", library], { timeout: 60_000 });
    execFileSync("rustc", ["--edition=2021", "-C", "debug-assertions=no", main, "--extern", `app_lib=${library}`, "-o", binary], { timeout: 60_000 });
    const fixture = join(scratch, "engine.rs");
    writeFileSync(fixture, `use std::io::{Read, Write};
#[cfg(windows)]
fn check_console() {
    #[link(name="kernel32")] extern "system" { fn GetConsoleWindow() -> *mut std::ffi::c_void; }
    let present = !unsafe { GetConsoleWindow() }.is_null();
    if std::env::args().any(|arg| arg == "--probe") { println!("{present}"); std::process::exit(0); }
    let expected = std::env::var("DANIL_CLI_TEST_INTERACTIVE").as_deref() == Ok("1");
    if present != expected { eprintln!("unexpected console: {present}"); std::process::exit(99); }
}
fn main() {
    #[cfg(windows)] check_console();
    let args: Vec<_> = std::env::args().skip(1).collect();
    for arg in &args { println!("{arg}"); }
    let mut input = String::new();
    if args.iter().any(|arg| arg == "--interactive") { input = "INTERACTIVE_STDOUT\\n".into(); }
    else { std::io::stdin().read_to_string(&mut input).expect("stdin"); }
    print!("{input}");
    if args.iter().any(|arg| arg == "--stream") {
        std::io::stdout().write_all(&vec![b'x'; 256 * 1024]).expect("stdout");
        std::io::stderr().write_all(&vec![b'y'; 256 * 1024]).expect("stderr");
    }
    eprintln!("engine stderr");
    std::process::exit(23);
}
`);
    execFileSync("rustc", ["--edition=2021", fixture, "-o", engine], { timeout: 60_000 });

    if (windows) {
      const pe = readFileSync(binary);
      const optionalHeader = pe.readUInt32LE(0x3c) + 24;
      assert.equal(pe.readUInt16LE(optionalHeader + 68), 2, "el wrapper debe ser un PE de subsistema Windows");
      if (process.env.DANIL_CLI_TEST_INTERACTIVE === "1") {
        assert.equal(execFileSync(engine, ["--probe"], { encoding: "utf8" }).trim(), "true", "el padre debe tener consola real");
        assert.equal(run(["task", "--interactive"], { stdio: "inherit" }).status, 23);
      }
    }

    await t.test("todos los comandos raíz del motor fijado se reenvían", () => {
      assert.ok(existsSync(sidecar), "sidecar local ausente; preparar con pnpm engine:sidecar y repetir");
      const lock = JSON.parse(readFileSync(new URL("../../seldon-runtime.lock", import.meta.url), "utf8"));
      assert.equal(createHash("sha256").update(readFileSync(sidecar)).digest("hex"), lock.platforms[triple].sha256, "el catálogo debe pertenecer al motor fijado");
      const catalog = JSON.parse(execFileSync(sidecar, ["agent-context", "--json"], { encoding: "utf8", timeout: 10_000, windowsHide: true }));
      assert.equal(catalog.error, null);
      const roots = new Set(catalog.result.commands.map(({ command }) => command.split(" ")[0]));
      assert.ok(roots.size > 0);
      for (const root of roots) {
        const result = run([root]);
        assert.equal(result.status, 23, `falta COMMANDS: ${root}`);
        assert.equal(result.stdout, `${root}\n`);
        assert.equal(result.stderr, "engine stderr\n");
      }
      t.diagnostic(`${roots.size} comandos raíz contrastados con ${lock.release}`);
    });

    for (const rank of ["peer", "worker"]) {
      const args = ["task", "create", "--as", rank, "--handler", "reviewer", "--json"];
      const result = run(args);
      assert.equal(result.status, 23);
      assert.equal(result.stdout, `${args.join("\n")}\n`);
    }

    const piped = run(["task", "á con espacios", "--json"], { input: "entrada\n" });
    assert.equal(piped.status, 23);
    assert.equal(piped.stdout, "task\ná con espacios\n--json\nentrada\n");
    assert.equal(piped.stderr, "engine stderr\n");

    const inputFile = join(scratch, "input.txt");
    const outputFile = join(scratch, "output.txt");
    const errorFile = join(scratch, "error.txt");
    writeFileSync(inputFile, "desde archivo\n");
    const descriptors = [openSync(inputFile, "r"), openSync(outputFile, "w"), openSync(errorFile, "w")];
    try {
      assert.equal(run(["instances", "--json"], { stdio: descriptors }).status, 23);
    } finally {
      for (const fd of descriptors) closeSync(fd);
    }
    assert.equal(readFileSync(outputFile, "utf8"), "instances\n--json\ndesde archivo\n");
    assert.equal(readFileSync(errorFile, "utf8"), "engine stderr\n");
    assert.equal(run(["instances", "--json"], { stdio: "ignore" }).status, 23);
    const streamed = run(["chat", "--stream"], { maxBuffer: 1024 * 1024 });
    assert.equal(streamed.status, 23);
    assert.equal(streamed.stdout, `chat\n--stream\n${"x".repeat(256 * 1024)}`);
    assert.equal(streamed.stderr, `${"y".repeat(256 * 1024)}engine stderr\n`);

    for (const args of [["--root", "path with spaces", "status"], ["--engine=/tmp/engine", "status"], ["--profile", "desktop-lab", "status"], ["github", "status"], ["github", "install"], ["--machine=cmp_qa", "activity", "list"], ["--machine", "cmp_qa", "activity", "list"], ["--instance=123", "status"], ["--instance", "123", "status"], ["--json", "instances"], ["--help"], ["-h"], ["--version"], ["-V"], ["kn", "--help"]]) {
      const result = run(args);
      assert.equal(result.status, 23);
      assert.equal(result.stdout, `${args.join("\n")}\n`);
      assert.equal(result.stderr, "engine stderr\n");
    }
    for (const args of [[], ["--external-host", "selection.json"], ["-psn_0_123"],
      ["terminus://task?id=qa"], ["https://example.invalid/"], ["C:\\QA\\report.md"],
      ["/tmp/report.md"], ["report.md"], ["./task"], ["--updated"], ["/S"], ["/P"],
      ["/UPDATE"], ["/ARGS", "--external-host", "selection.json"], ["--", "status"], ["unknown"]]) {
      const result = run(args);
      assert.equal(result.status, 0);
      assert.equal(result.stdout, "window\n", JSON.stringify(args));
      assert.equal(result.stderr, "");
    }
    const installer = run(["--stop-engine"]);
    assert.equal(installer.stdout, "stop-engine\n");
    assert.equal(installer.status, 0);

    rmSync(engine);
    const missing = run(["task"]);
    assert.equal(missing.status, 1);
    assert.equal(missing.stdout, "");
    assert.match(missing.stderr, /^cli\.error\.engine_start_failed:/);
  } finally {
    const checked = resolve(scratch);
    assert.equal(dirname(checked), resolve(tmpdir()));
    assert.ok(relative(tmpdir(), checked).startsWith("terminus-forward-"));
    rmSync(checked, { recursive: true, force: true });
  }
});
