/** Regression guard for front architecture boundaries fixed in Bloque 4 (R3, R9, and chat/shell R6) + shared URL helper. */
import assert from "node:assert/strict";
import test from "node:test";
import { loadFiles } from "../../../../scripts/verify-front/lib.mjs";
import { r3 } from "../../../../scripts/verify-front/r2-r5.mjs";
import { r6 } from "../../../../scripts/verify-front/r6.mjs";
import { r9 } from "../../../../scripts/verify-front/r9.mjs";
import { isSafeExternalUrl, originOf } from "../../../../packages/ui/src/lib/url.ts";

test("verify-front keeps zero R3 cross-feature imports and zero R9 duplicated blocks across packages", () => {
  const files = loadFiles();
  assert.deepEqual(r3(files), [], "R3 must stay at 0 cross-feature relative imports");
  assert.deepEqual(r9(files), [], "R9 must stay at 0 duplicated 12-line blocks");
});

test("verify-front keeps zero R6 oversized files in packages/shell and packages/features/chat", () => {
  const files = loadFiles();
  const chatAndShellR6 = r6(files).filter(
    (v) => v.path.startsWith("packages/shell/") || v.path.startsWith("packages/features/chat/"),
  );
  assert.deepEqual(chatAndShellR6, [], "packages/shell and packages/features/chat must stay <= 400 lines per file");
});

test("ui/src/lib/url validates origins and rejects unsafe external URL schemes", () => {
  assert.equal(originOf("https://beta.danil.ai/terminus/?x=1"), "https://beta.danil.ai");
  assert.equal(originOf("http://localhost:5173/test"), "http://localhost:5173");
  assert.equal(originOf("not a url"), null);

  assert.equal(isSafeExternalUrl("https://danil.ai/docs"), true);
  assert.equal(isSafeExternalUrl("http://localhost:3000"), true);
  assert.equal(isSafeExternalUrl("javascript:alert(1)"), false);
  assert.equal(isSafeExternalUrl("data:text/html,hi"), false);
  assert.equal(isSafeExternalUrl("file:///etc/passwd"), false);
  assert.equal(isSafeExternalUrl(null), false);
  assert.equal(isSafeExternalUrl(123), false);
});
