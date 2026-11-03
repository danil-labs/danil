import assert from "node:assert/strict";
import { test } from "node:test";
import { accountKind } from "../../src/web/account-capability.ts";

test("only an explicit plan makes an account personal, so a missing plan never locks out an organization", () => {
  assert.equal(accountKind({ plan: "Enterprise" }), "enterprise");
  assert.equal(accountKind({ plan: "Teams" }), "teams");
  assert.equal(accountKind({ plan: "Personal" }), "personal");
  assert.equal(accountKind({ plan: null }), "teams");
});

test("the BFF saying a workspace has no organization makes it personal; a missing field does not", () => {
  assert.equal(accountKind({ plan: null, personal: true }), "personal");
  assert.equal(accountKind({ plan: null, personal: undefined }), "teams");
  assert.equal(accountKind({ plan: "Enterprise", personal: true }), "enterprise");
});
