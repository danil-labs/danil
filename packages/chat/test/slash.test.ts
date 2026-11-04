import assert from "node:assert/strict";
import { test } from "node:test";
import { replaceSlash, slashAt, slashTokens } from "../src/slash.ts";

const at = (text: string) => slashAt(text, text.length);

test("a slash opens at the start or after a space or a line break", () => {
  assert.deepEqual(at("/sta"), { from: 0, to: 4, name: "sta", inline: false });
  assert.deepEqual(at("revisa esto con /code"), { from: 16, to: 21, name: "code", inline: true });
  assert.deepEqual(at("primera línea\n/code"), { from: 14, to: 19, name: "code", inline: true });
  assert.equal(at("mira /")?.name, "");
  assert.equal(at("  /goal")?.inline, false);
});

test("a slash inside a mention, a URL or a path does not open", () => {
  assert.equal(at("@src/a/b"), null);
  assert.equal(at("mira @src/a/b"), null);
  assert.equal(at("https://x/y"), null);
  assert.equal(at("abre https://x/y"), null);
  assert.equal(at("a/b"), null);
  assert.equal(at("mira /usr/bin"), null);
  assert.equal(at('mira @"mi carpeta /cod'), null);
  assert.equal(at('mira @"mi carpeta" /cod')?.name, "cod");
});

test("the caret decides which token is being typed", () => {
  const text = "usa /code-review y luego @src/App.tsx";
  assert.equal(slashAt(text, 8)?.name, "code-review");
  assert.equal(slashAt(text, text.length), null);
});

test("choosing replaces only the token and keeps the rest", () => {
  const text = "revisa /co y dime";
  const token = slashAt(text, 10)!;
  assert.deepEqual(replaceSlash(text, token, "code-review"), { text: "revisa /code-review y dime", caret: 20 });
  assert.deepEqual(replaceSlash("/sta", slashAt("/sta", 4)!, "status"), { text: "/status ", caret: 8 });
});

test("every complete token is found for painting", () => {
  assert.deepEqual(slashTokens("/goal usa /code-review. y @src/a/b https://x/y").map((t) => [t.name, t.inline]),
    [["goal", false], ["code-review", true]]);
});
