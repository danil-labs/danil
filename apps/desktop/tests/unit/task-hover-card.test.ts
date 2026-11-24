import assert from "node:assert/strict";
import test from "node:test";

const { folderColor } = await import("../../src/lib/folderColor.ts");
const { hoverCardPull } = await import("../../../../packages/features/projects/src/model/hoverCardPull.ts");
const { UNKNOWN_TASK_GIT: UNKNOWN_GIT } = await import("../../../../packages/ui/src/lib/tasks/git.ts");

const PALETA = ["#a78bfa", "#38bdf8", "#f59e0b", "#f472b6", "#34d399", "#fb7185", "#60a5fa", "#facc15"];

// FNV-1a de 32 bits: «a» → 0xe40c292c y la cadena vacía → 0x811c9dc5, vectores publicados.
test("el color de una carpeta sale del FNV-1a de su id", () => {
  assert.equal(folderColor(""), PALETA[0x811c9dc5 % 8]);
  assert.equal(folderColor("a"), PALETA[0xe40c292c % 8]);
  assert.equal(folderColor("foobar"), PALETA[0xbf9cf968 % 8]);
});

test("el mismo id da siempre el mismo color, y siempre de la paleta", () => {
  for (const id of ["fqgx1w8m", "zkjet805", "carpeta con espacios", "ñandú 🚀"]) {
    assert.equal(folderColor(id), folderColor(id));
    assert.ok(PALETA.includes(folderColor(id)));
  }
});

const conPr = (pull: object, head = "abc") => ({
  ...UNKNOWN_GIT,
  kind: "branch" as const,
  branch: "feat/x",
  head,
  pull_known: true,
  pull: { number: 7, state: "open" as const, head_sha: "abc", ...pull },
});

test("la tarjeta no afirma un PR que nadie confirmó", () => {
  assert.equal(hoverCardPull(undefined), null);
  assert.equal(hoverCardPull(UNKNOWN_GIT), null);
  assert.equal(hoverCardPull({ ...conPr({}), pull_known: false }), null);
});

test("el CI se muestra solo si es del HEAD actual y dice algo", () => {
  assert.deepEqual(hoverCardPull(conPr({ checks: "failure" })), { number: 7, state: "open", checks: "failure" });
  assert.equal(hoverCardPull(conPr({ checks: "failure" }, "otro"))?.checks, null);
  assert.equal(hoverCardPull(conPr({ checks: "none" }))?.checks, null);
});

test("un PR fusionado desde otro HEAD no se pinta como fusionado", () => {
  assert.equal(hoverCardPull(conPr({ state: "merged" }))?.state, "merged");
  assert.equal(hoverCardPull(conPr({ state: "merged" }, "otro"))?.state, "merged_other_head");
});
