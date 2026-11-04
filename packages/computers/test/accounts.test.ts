import assert from "node:assert/strict";
import { test } from "node:test";
import { groupAccounts, immediateWindow, resetLabel, usageTone, windowLabel, windowLeft } from "../src/index.ts";

test("cada credencial conserva su tarjeta y su máquina aunque comparta correo", () => {
  const groups = groupAccounts("claude", [
    { machine: "vm", on: false, accounts: [{ id: "a1", label: "Trabajo", identity: "Ana@Example.com" }, { id: "a2", label: "Sin correo", identity: null }] },
    { machine: "mac", on: true, accounts: [{ id: "m1", label: "", identity: "ana@example.com" }] },
  ]);
  assert.equal(groups.length, 3);
  assert.equal(groups[0].email, "ana@example.com");
  assert.deepEqual(groups[0].members, [{ machine: "vm", id: "a1", on: false }]);
  assert.deepEqual(groups[0].usageFrom, { machine: "vm", id: "a1", on: false });
  assert.deepEqual(groups[2].usageFrom, { machine: "mac", id: "m1", on: true });
  assert.equal(groups[1].email, null);
  assert.equal(groups[1].key, "claude:vm~a2");
});

test("Claude Personal y Team del mismo correo conservan consumo y cierre de sesión independientes", () => {
  const groups = groupAccounts("claude", [
    { machine: "vm", on: true, accounts: [{ id: "personal", label: "Personal", identity: "ana@example.com" }, { id: "team", label: "Team", identity: "ana@example.com" }] },
    { machine: "mac", on: true, accounts: [{ id: "personal", label: "Otra credencial", identity: "ana@example.com" }] },
  ]);
  assert.equal(new Set(groups.map((g) => g.key)).size, 3);
  assert.deepEqual(groups.map((g) => [g.row.label, g.usageFrom.machine, g.usageFrom.id]), [
    ["Personal", "vm", "personal"], ["Team", "vm", "team"], ["Otra credencial", "mac", "personal"],
  ]);
  assert.ok(groups.every((g) => g.members.length === 1));
});

test("la misma suscripción une máquinas, elige una encendida y conserva el id de cada chip", () => {
  const groups = groupAccounts("claude", [
    { machine: "vm", on: false, accounts: [{ id: "personal", identity: "Ana@Example.com", plan: " Pro " }, { id: "team", identity: "ana@example.com", plan: "Team" }] },
    { machine: "mac", on: true, accounts: [{ id: "copy", identity: "ana@example.com", plan: "pro" }] },
  ]);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0].members, [{ machine: "vm", id: "personal", on: false }, { machine: "mac", id: "copy", on: true }]);
  assert.equal(groups[0].row.id, "copy");
  assert.deepEqual(groups[0].usageFrom, { machine: "mac", id: "copy", on: true });
  assert.deepEqual(groups[1].members, [{ machine: "vm", id: "team", on: false }]);
});

test("OpenCode une el mismo correo y orgID aunque el plan visible cambie", () => {
  const groups = groupAccounts("opencode-zen", [
    { machine: "vm", on: false, accounts: [{ id: "oauth", identity: "Ana@Example.com", credential_group: "org-1", plan: "Go" }] },
    { machine: "mac", on: true, accounts: [{ id: "copy", identity: "ana@example.com", credential_group: "org-1" }] },
  ]);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].members, [
    { machine: "vm", id: "oauth", on: false },
    { machine: "mac", id: "copy", on: true },
  ]);
  assert.deepEqual(groups[0].usageFrom, { machine: "mac", id: "copy", on: true });
});

test("OpenCode no une el mismo correo en organizaciones distintas", () => {
  const groups = groupAccounts("opencode-zen", [
    { machine: "vm", on: true, accounts: [{ id: "org-1", identity: "ana@example.com", credential_group: "org-1", plan: "Go" }] },
    { machine: "mac", on: true, accounts: [{ id: "org-2", identity: "ana@example.com", credential_group: "org-2", plan: "Go" }] },
  ]);
  assert.equal(groups.length, 2);
  assert.ok(groups.every((group) => group.members.length === 1));
});

test("el tipo desconocido y dos cuentas del mismo tipo en una máquina no se atribuyen por correo", () => {
  const groups = groupAccounts("claude", [
    { machine: "vm", on: true, accounts: [{ id: "a", identity: "ana@example.com", plan: "team" }, { id: "b", identity: "ana@example.com", plan: "team" }] },
    { machine: "mac", on: true, accounts: [{ id: "c", identity: "ana@example.com", plan: "team" }, { id: "unknown", identity: "ana@example.com", plan: null }] },
  ]);
  assert.equal(groups.length, 4);
  assert.ok(groups.every((g) => g.members.length === 1));
});

test("la barra mide la ventana que corre ahora, no la que queda más apretada", () => {
  const now = 1_000_000_000_000;
  const windows = [
    { label: "últimas 5 horas", used_pct: 10, resets_at: now + 5 * 3_600_000 },
    { label: "esta semana", used_pct: 91, resets_at: now + 4 * 86_400_000 },
  ];
  assert.equal(immediateWindow(windows, now)?.label, "últimas 5 horas");
  assert.equal(windowLeft(immediateWindow(windows, now)!), 90);
  // La semana ya reseteada no tapa a la de cinco horas, que sigue corriendo.
  assert.equal(immediateWindow([windows[1], { ...windows[1], resets_at: now - 1 }, windows[0]], now)?.label, "últimas 5 horas");
  // Sin fechas manda el orden del proveedor.
  assert.equal(immediateWindow([{ label: "primera", resets_at: null }, { label: "segunda", resets_at: null }], now)?.label, "primera");
  assert.equal(immediateWindow([], now), null);
});

test("lo que queda, su tono y cuándo vuelve, con las palabras del escritorio", () => {
  assert.equal(windowLeft({ used_pct: 37.6 }), 62);
  assert.equal(windowLeft({ used_pct: 120 }), 0);
  assert.equal(usageTone(4), "error");
  assert.equal(usageTone(20), "warning");
  assert.equal(usageTone(60), "neutral");
  const now = 1_000_000_000_000;
  assert.equal(resetLabel("es", null, 0, now), "sin empezar");
  assert.equal(resetLabel("es", null, 3, now), "sin fecha de reset");
  assert.equal(resetLabel("es", now - 1, 3, now), "ya reseteó");
  assert.equal(resetLabel("es", now + 25 * 60_000, 3, now), "reset en 25 min");
  assert.equal(resetLabel("es", now + 3 * 3_600_000, 3, now), "reset en 3 h");
  assert.equal(resetLabel("es", now + 5 * 86_400_000, 3, now), "reset en 5 días");
  assert.equal(windowLabel("es", { used_pct: 38, resets_at: now + 3 * 3_600_000 }, now), "resta 62% · reset en 3 h");
});
