import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { BILLING_CONTRACT_HASH, BILLING_OPERATIONS, CONTRACT_HASH } from "../src/generated/contract.ts";

const at = (rel: string) => new URL(`../${rel}`, import.meta.url);

test("src/generated está al día con los contratos vendorizados", () => {
  execFileSync(process.execPath, [at("scripts/generate.mjs").pathname, "--check"], { stdio: "pipe" });
});

test("los hashes son los de los archivos vendorizados (R7)", () => {
  assert.equal(CONTRACT_HASH, createHash("sha256").update(readFileSync(at("contract/openapi.json"))).digest("hex"));
  const billing = createHash("sha256")
    .update(readFileSync(at("contract/billing-v2/openapi/public.openapi.json")))
    .update(readFileSync(at("contract/billing-v2/schemas/common.v1.schema.json")));
  assert.equal(BILLING_CONTRACT_HASH, billing.digest("hex"));
});

test("treasury usa rutas del contrato de billing-v2", () => {
  assert.equal(BILLING_OPERATIONS.getCreditBalance.path, "/v1/credits/balance");
  assert.equal(BILLING_OPERATIONS.getCatalog.path, "/v1/billing/catalog");
});
