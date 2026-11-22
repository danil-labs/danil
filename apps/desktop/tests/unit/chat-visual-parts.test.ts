import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_VISUAL_BYTES,
  readVisualHtml,
  VISUAL_PART_BYTES,
  type VisualPart,
  type VisualWhole,
} from "../../../../packages/ui/src/lib/chat/visual.ts";

const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");

/** Un motor con `chat_visual_part` que sirve `page` en partes y anota cada llamada. */
function engine(page: Uint8Array, revision = "r1") {
  const calls: { offset: number; size: number; revision?: string }[] = [];
  return {
    calls,
    part: async (offset: number, size: number, wanted?: string): Promise<VisualPart> => {
      calls.push({ offset, size, revision: wanted });
      if (wanted && wanted !== revision) throw { detail: "visual_changed" };
      const end = Math.min(page.byteLength, offset + size);
      return { data: b64(page.subarray(offset, end)), eof: end >= page.byteLength, total: page.byteLength, revision };
    },
    whole: async (): Promise<VisualWhole> => {
      throw new Error("tree_show no debe llamarse");
    },
  };
}

test("junta las partes de 512 KiB y decodifica UTF-8, también cortado a mitad de un carácter", async () => {
  const text = "á📈".repeat(300_000);
  const page = new TextEncoder().encode(text);
  const fake = engine(page);
  assert.equal(await readVisualHtml(fake), text);
  assert.equal(fake.calls.length, Math.ceil(page.byteLength / VISUAL_PART_BYTES));
  assert.ok(fake.calls.every((c) => c.size === VISUAL_PART_BYTES));
  assert.deepEqual(fake.calls.map((c) => c.revision), [undefined, ...Array(fake.calls.length - 1).fill("r1")]);
});

test("un motor sin chat_visual_part cae a tree_show con su tope de 512 KiB", async () => {
  for (const missing of [{ detail: "command" }, { detail: "service.error.command" }, Object.assign(new Error("x"), { code: "command_not_allowed", detail: "chat_visual_part" })]) {
    const html = "<p>hola</p>";
    const got = await readVisualHtml({
      part: async () => { throw missing; },
      whole: async () => ({ kind: "text", text: html, bytes: html.length, truncated: false }),
    });
    assert.equal(got, html);
  }
  await assert.rejects(readVisualHtml({
    part: async () => { throw { detail: "command" }; },
    whole: async () => ({ kind: "text", text: "a".repeat(512 * 1024 + 1), bytes: 512 * 1024 + 1, truncated: false }),
  }), { detail: "visual_too_large" });
});

test("los fallos del visual no prueban tree_show", async () => {
  for (const detail of ["visual_too_large", "invalid_visual_file", "visual_read_failed"]) {
    await assert.rejects(readVisualHtml({
      part: async () => { throw { detail }; },
      whole: async () => { throw new Error("no"); },
    }), { detail });
  }
});

test("si la página cambia entre partes, empieza otra vez una sola vez", async () => {
  const page = new Uint8Array(VISUAL_PART_BYTES + 10).fill(97);
  let changes = 0;
  const flaky = engine(page);
  const part = flaky.part;
  flaky.part = async (offset, size, wanted) => {
    if (offset > 0 && changes++ === 0) throw { detail: "visual_changed" };
    return part(offset, size, wanted);
  };
  assert.equal((await readVisualHtml(flaky)).length, page.byteLength);

  const always = engine(page);
  always.part = async (offset, size) => ({ ...(await part(offset, size)), revision: String(offset) });
  await assert.rejects(readVisualHtml(always), { detail: "visual_read_failed" });
});

test("rechaza una página de más de 25 MiB, partes que no avanzan y UTF-8 inválido", async () => {
  await assert.rejects(readVisualHtml({
    part: async () => ({ data: "", eof: false, total: MAX_VISUAL_BYTES + 1, revision: "r" }),
    whole: async () => { throw new Error("no"); },
  }), { detail: "visual_too_large" });
  await assert.rejects(readVisualHtml({
    part: async () => ({ data: "", eof: false, total: 4, revision: "r" }),
    whole: async () => { throw new Error("no"); },
  }), { detail: "invalid_visual_file" });
  await assert.rejects(readVisualHtml(engine(new Uint8Array([0xff]))), { detail: "invalid_visual_file" });
});
