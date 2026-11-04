import assert from "node:assert/strict";
import { test } from "node:test";
import { activeUsage, providerUsage } from "../src/lib/accountUsage.ts";
import type { Host } from "../src/lib/hosts.ts";

function host(id: string, on: boolean, authenticated: boolean, queries: string[]): Host {
  return {
    id,
    power: () => on ? "on" : "off",
    async call(command: string, _workspace: unknown, args: { id?: string }) {
      if (command === "list_accounts") return { value: { accounts: [{ id: `${id}-account`, label: id, plan: "Max", identity: "person@example.com", authenticated_at: authenticated ? 10 : null }] }, cachedAt: null };
      assert.equal(command, "account_limits");
      queries.push(`${id}/${args.id}`);
      return { value: { mode: "read", windows: [{ label: "5h", used_pct: 38, resets_at: null }], plan: "Max", fetched_at: 10 }, cachedAt: on ? null : 10 };
    },
  } as unknown as Host;
}

test("consulta la cuenta autenticada de la máquina encendida aunque la primera fila no tenga sesión", async () => {
  const queries: string[] = [];
  const result = await providerUsage([host("first", false, false, queries), host("second", true, true, queries)], "claude");
  assert.deepEqual(queries, ["second/second-account"]);
  assert.equal(result.groups[0].row.id, "second-account");
  assert.equal(activeUsage(result, "second")?.row.id, "second-account");
  assert.equal(result.groups[0].row.authenticated_at, 10);
  assert.equal(result.limits[result.groups[0].key]?.mode, "read");
});

test("una máquina encendida sin sesión no desplaza a la que sí puede consultar el consumo", async () => {
  const queries: string[] = [];
  const result = await providerUsage([host("first", true, false, queries), host("second", true, true, queries)], "claude");
  assert.deepEqual(queries, ["second/second-account"]);
  assert.equal(result.groups[0].usageFrom.machine, "second");
});

function twoAccounts(active: string | null): Host {
  return {
    id: "mac",
    power: () => "on",
    async call(command: string, _workspace: unknown, args: { id?: string }) {
      if (command === "list_accounts") {
        return {
          value: {
            active,
            accounts: [
              { id: "mac-a", label: "Trabajo", plan: "Pro", identity: "ana@example.com", authenticated_at: 10 },
              { id: "mac-b", label: "Personal", plan: "Max", identity: "ana@example.com", authenticated_at: 10 },
            ],
          },
          cachedAt: null,
        };
      }
      const mine = args.id === "mac-b";
      return { value: { mode: "read", windows: [{ label: "5h", used_pct: mine ? 10 : 90, resets_at: null }], plan: mine ? "Max" : "Pro", fetched_at: 10 }, cachedAt: null };
    },
  } as unknown as Host;
}

function usedPct(result: Awaited<ReturnType<typeof providerUsage>>, id: string): number {
  const group = result.groups.find((item) => item.row.id === id);
  const limits = group ? result.limits[group.key] : null;
  assert.equal(limits?.mode, "read");
  if (limits?.mode !== "read") return -1;
  return limits.windows[0].used_pct;
}

test("la barra es la de la cuenta activa, no la ventana más justa de otra", async () => {
  const result = await providerUsage([twoAccounts("mac-b")], "claude");
  assert.equal(result.groups.length, 2);
  assert.equal(usedPct(result, "mac-a"), 90);
  assert.equal(usedPct(result, "mac-b"), 10);
  const group = activeUsage(result, "mac");
  assert.ok(group);
  assert.equal(group.row.id, "mac-b");
  assert.equal(usedPct(result, group.row.id), 10);
});

test("sin cuenta activa y con varias, no se sustituye por otra", async () => {
  const result = await providerUsage([twoAccounts(null)], "claude");
  assert.equal(activeUsage(result, "mac"), null);
});

test("una cuenta activa que no está en la lista no se sustituye", async () => {
  const result = await providerUsage([twoAccounts("missing")], "claude");
  assert.equal(activeUsage(result, "mac"), null);
});

test("leer cuentas apagadas usa su última lectura de consumo", async () => {
  const queries: string[] = [];
  const result = await providerUsage([host("first", false, true, queries), host("second", true, false, queries)], "claude");
  assert.deepEqual(queries, ["first/first-account"]);
  assert.equal(result.limits[result.groups[0].key]?.mode, "read");
  assert.equal(result.cachedAt[result.groups[0].key], 10);
  assert.equal(result.groups[0].row.authenticated_at, 10);
});
