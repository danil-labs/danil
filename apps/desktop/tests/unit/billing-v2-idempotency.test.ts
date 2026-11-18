import { strict as assert } from "node:assert";
import { test } from "node:test";
import { bindCreationCheckout, clearCreationCheckout, creationKey } from "../../src/web/billing-v2-idempotency.ts";

test("an uncertain organization checkout keeps its key after reopening without storing the name", async () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  const first = await creationKey(storage, "team", 3, "  Cafe\u0301 Danil  ");
  const again = await creationKey(storage, "team", 3, "Café Danil");
  assert.equal(first, again);
  assert.ok(![...values.values()].join(" ").includes("Café"));
  assert.notEqual(await creationKey(storage, "pro", 3, "Café Danil"), first);
  assert.equal(await creationKey(storage, "team", 3, "Café Danil"), first);
});

test("only the terminal result of the matching checkout clears the pending creation", async () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
  const key = await creationKey(storage, "team", 3, "Danil");
  bindCreationCheckout(storage, key, "bchk_01SYNTHETICCHK0001");
  clearCreationCheckout(storage, "bchk_01SYNTHETICCHK0002");
  assert.equal(await creationKey(storage, "team", 3, "Danil"), key);
  clearCreationCheckout(storage, "bchk_01SYNTHETICCHK0001");
  assert.notEqual(await creationKey(storage, "team", 3, "Danil"), key);
});
