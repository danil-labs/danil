import assert from "node:assert/strict";
import test from "node:test";

const { sharesTaskGit, UNKNOWN_GIT } = await import("../../../../packages/features/projects/src/queries/taskGit.ts");

const rama = {
  ...UNKNOWN_GIT,
  kind: "branch" as const,
  branch: "fix/ejemplo",
  head: "commit",
  repository: "harness-app",
};

test("la rama es de la fila solo cuando la tarea tiene su propio árbol", () => {
  const madre = { id: "madre", parent: null };
  const compartida = { id: "compartida", parent: "madre" };
  const hija = { id: "hija", parent: "madre", subagent: "nativa" };
  const propia = { id: "propia", parent: "madre" };
  const sessions = [madre, compartida, hija, propia];
  const rows = {
    madre: rama,
    compartida: { ...rama, shared_with: "madre" },
    propia: { ...rama, branch: "fix/otra", head: "otro" },
  };
  assert.equal(sharesTaskGit(madre, rows, sessions), false);
  assert.equal(sharesTaskGit(compartida, rows, sessions), true);
  assert.equal(sharesTaskGit(hija, rows, sessions), true);
  assert.equal(sharesTaskGit(propia, rows, sessions), false);
});

// Sin la dueña en la lista nadie enseña esa rama: quitarla de aquí la esconde.
test("una fila compartida cuya dueña no está en la lista conserva su rama", () => {
  const huerfana = { id: "huerfana", parent: "ausente" };
  const rows = { huerfana: { ...rama, shared_with: "ausente" } };
  assert.equal(sharesTaskGit(huerfana, rows, [huerfana]), false);
});
