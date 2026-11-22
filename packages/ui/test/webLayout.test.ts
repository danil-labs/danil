import assert from "node:assert/strict";
import { test } from "node:test";
import { chosenWebLayout } from "../src/lib/webLayout.ts";

const browser = (saved: string | null, phone: boolean, blocked = false) => ({
  matchMedia: () => ({ matches: phone }),
  localStorage: {
    getItem: () => {
      if (blocked) throw new Error("blocked");
      return saved;
    },
  },
});

test("la pantalla decide si la persona no eligió", () => {
  assert.equal(chosenWebLayout(browser(null, true)), "mobile");
  assert.equal(chosenWebLayout(browser(null, false)), "desktop");
});

test("lo elegido gana a la pantalla", () => {
  assert.equal(chosenWebLayout(browser("desktop", true)), "desktop");
  assert.equal(chosenWebLayout(browser("mobile", false)), "mobile");
});

test("un valor raro o el almacenamiento bloqueado no rompen", () => {
  assert.equal(chosenWebLayout(browser("tablet", true)), "mobile");
  assert.equal(chosenWebLayout(browser(null, false, true)), "desktop");
});
