import assert from "node:assert/strict";
import test from "node:test";

import { siguienteLista } from "../../../../packages/features/code/src/model/trees.ts";

/**
 * **Un error transitorio no puede vaciar la lista de árboles.**
 *
 * Vaciarla no se lee como «no pude leer»: el reparto de las dos filas de la caja
 * del chat sale de qué árboles hay, así que una lista vacía manda la fuente que
 * se trajo como código a «Contexto» —material de solo lectura— y el panel Código
 * afirma que la tarea no edita nada. Las dos frases son falsas y ninguna falla.
 *
 * Y no se recupera solo: no hay refresco periódico. Lo que se pinte tras el
 * fallo se queda hasta el turno siguiente.
 */

/**
 * **Y una lectura buena que no encuentra nada sí vacía.** Es lo que separa esto
 * de «no vaciar nunca»: un árbol que el agente borró tiene que desaparecer del
 * panel, y eso solo lo puede afirmar una respuesta.
 */
test("una lectura buena y vacía sí vacía", () => {
  assert.deepEqual(siguienteLista(["viejo"], { ok: true, lista: [] }), []);
});

test("un fallo conserva lo último bueno", () => {
  assert.deepEqual(siguienteLista(["viejo"], { ok: false }), ["viejo"]);
});


test("Git conserva la última rama ante un error, pero una carpeta sin Git la retira", async () => {
  const { retainGitObservation } = await import("../../../../packages/ui/src/lib/tasks/git.ts");
  const row = { kind: "branch" as const, kn: null, repository: "repo", branch: "feature", alias: "vega-260910", head: "abc", shared_with: null,
    pull: { number: 2, state: "merged" as const, head_sha: "abc" }, pull_known: true, checked_at: 10, stale: false, has_remote: true, merged_locally: false };
  const previous = { task: row };
  assert.deepEqual(retainGitObservation(previous, { task: { ...row, kind: "unknown", branch: null } }), { task: { ...row, stale: true } });
  const absent = { ...row, kind: "none" as const, branch: null, pull: null, pull_known: false };
  assert.deepEqual(retainGitObservation(previous, { task: absent }), { task: absent });
  const renamed = { ...row, branch: "renamed", pull: null, pull_known: false };
  assert.deepEqual(retainGitObservation(previous, { task: renamed }), { task: renamed });
  assert.deepEqual(retainGitObservation(previous, {}), {});
});
