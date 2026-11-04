import assert from "node:assert/strict";
import { test } from "node:test";
import { TreeFileError, mediaKindOf, readTreeFile, type TreePart } from "../src/treeParts.ts";

const b64 = (bytes: number[]) => btoa(String.fromCharCode(...bytes));

function engine(file: number[], size: number, revisions: string[] = ["r1"]) {
  let calls = 0;
  return {
    calls: () => calls,
    part: async (offset: number, _size: number, revision?: string): Promise<TreePart> => {
      const current = revisions[Math.min(calls++, revisions.length - 1)];
      if (revision && revision !== current) throw new TreeFileError("file_changed");
      const end = Math.min(offset + size, file.length);
      return { data: b64(file.slice(offset, end)), eof: end >= file.length, total: file.length, revision: current, mime: "video/mp4" };
    },
  };
}

test("mediaKindOf reads the extension", () => {
  assert.equal(mediaKindOf("demo/app.MP4"), "video");
  assert.equal(mediaKindOf("nota.m4a"), "audio");
  assert.equal(mediaKindOf("informe.pdf"), null);
  assert.equal(mediaKindOf(".mp4"), null);
});

test("readTreeFile assembles the parts in order", async () => {
  const e = engine([1, 2, 3, 4, 5], 2);
  const seen: number[] = [];
  const { bytes, mime } = await readTreeFile(e.part, { onProgress: (done) => seen.push(done) });
  assert.deepEqual([...bytes], [1, 2, 3, 4, 5]);
  assert.equal(mime, "video/mp4");
  assert.deepEqual(seen, [2, 4, 5]);
});

test("readTreeFile refuses a file above the limit before reading it", async () => {
  const e = engine([1, 2, 3], 1);
  await assert.rejects(readTreeFile(e.part, { max: 2 }), (err: TreeFileError) => err.detail === "tree_file_too_large");
  assert.equal(e.calls(), 1);
});

test("readTreeFile starts over once when the file changes", async () => {
  const e = engine([1, 2, 3], 1, ["r1", "r2", "r2", "r2", "r2"]);
  const { bytes } = await readTreeFile(e.part);
  assert.deepEqual([...bytes], [1, 2, 3]);
});
