import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { noticer } from "../src/lib/engine.ts";

// El mismo archivo que `test/fixtures/push-events.json` de danil-labs/computers: el relay avisa con esta regla.
const fixture = JSON.parse(readFileSync(new URL("./fixtures/push-events.json", import.meta.url), "utf8"));

test("los avisos del teléfono y los push del relay salen de los mismos eventos", () => {
  const take = noticer("host");
  const notices = fixture.events.flatMap((event: never) => take.take(event));
  assert.deepEqual(
    notices.map((n) => ({ kind: n.state, workspace: n.workspace, session: n.session, folder: n.folder })),
    fixture.notices,
  );
});
