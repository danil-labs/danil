import test from "node:test";
import assert from "node:assert/strict";
import { ArtifactDownloadError, readArtifactDownload } from "../../../../packages/features/artifacts/src/model/download.ts";

const reference = { project: "project", session: "task", artifact: "report.txt", n: 2 };
const limits = { maxBytes: 8, partBytes: 3, timeoutMs: 200 };
const unsupported = { detail: { code: "command" } };
const failure = (reason: string) => (error: unknown) => error instanceof ArtifactDownloadError && error.reason === reason;

test("descarga las partes exactas de la versión sellada", async () => {
  const blob = await readArtifactDownload(reference, 5, true, {
    part: async (version, offset, size) => {
      assert.equal(version, reference);
      assert.equal(size, 3);
      return { data: btoa(offset === 0 ? "abc" : "de"), eof: offset !== 0 };
    },
    text: async () => { throw new Error("unexpected fallback"); },
  }, limits);
  assert.equal(await blob.text(), "abcde");
});

test("un motor anterior recupera solo el texto sellado, incluso la versión actual", async () => {
  const blob = await readArtifactDownload(reference, 2, true, {
    part: async () => { throw unsupported; },
    text: async version => { assert.equal(version, reference); return "á"; },
  }, limits);
  assert.equal(await blob.text(), "á");
});

test("los errores de transporte no activan el respaldo", async () => {
  const broken = { detail: "machine_lost" };
  await assert.rejects(readArtifactDownload(reference, 2, true, {
    part: async () => { throw broken; },
    text: async () => { assert.fail("must not fallback"); },
  }, limits), error => error === broken);
});

test("un motor anterior rechaza binarios sin leerlos como texto", async () => {
  await assert.rejects(readArtifactDownload(reference, 2, false, {
    part: async () => { throw unsupported; },
    text: async () => { assert.fail("binary must not be decoded"); },
  }, limits), failure("remote_outdated"));
});

test("rechaza EOF prematuro, partes vacías y partes que exceden los bytes sellados", async () => {
  for (const part of [{ data: "", eof: false }, { data: btoa("a"), eof: true }, { data: btoa("abc"), eof: true }]) {
    await assert.rejects(readArtifactDownload(reference, 2, true, {
      part: async () => part,
      text: async () => { assert.fail("must not fallback"); },
    }, limits), failure("incomplete"));
  }
});

test("acota tamaño antes de leer y espera total de la descarga", async () => {
  const reader = { part: async () => new Promise<{ data: string; eof: boolean }>(() => {}), text: async () => "" };
  await assert.rejects(readArtifactDownload(reference, 9, true, reader, limits), failure("too_large"));
  await assert.rejects(readArtifactDownload(reference, 2, true, reader, { ...limits, timeoutMs: 5 }), failure("timeout"));
});
