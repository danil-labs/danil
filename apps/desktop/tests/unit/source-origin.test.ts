/**
 * De dónde viene una fuente, como lo dice la pantalla del proyecto: proveedor y
 * repositorio para un git, la carpeta con el home abreviado para una carpeta.
 * Nunca la ruta de la copia bajo AppData.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  lineaDeProcedencia,
  procedencia,
} from "../../src/lib/sourceOrigin.ts";

test("un repositorio se nombra por su proveedor, su slug y su rama", () => {
  for (const [location, proveedor, sitio] of [
    ["https://github.com/danil-labs/harness-app.git", "GitHub", "danil-labs/harness-app"],
    ["https://github.com/danil-labs/harness-app", "GitHub", "danil-labs/harness-app"],
    ["git@github.com:danil-labs/harness-app.git", "GitHub", "danil-labs/harness-app"],
    ["https://x-token@bitbucket.org/equipo/repo.git", "Bitbucket", "equipo/repo"],
    ["ssh://git@bitbucket.org/equipo/repo.git", "Bitbucket", "equipo/repo"],
    ["https://git.empresa.test/a/b.git", "git.empresa.test", "a/b"],
  ] as const) {
    const p = procedencia({ kind: "git", location, branch: "main" });
    assert.deepEqual(p, { proveedor, sitio, rama: "main" }, location);
    assert.equal(lineaDeProcedencia(p, "Carpeta"), `${proveedor} · ${sitio} · main`);
  }
});

test("una carpeta se nombra por su ruta con el home abreviado, sin rama", () => {
  const p = procedencia({
    kind: "folder",
    location: "C:\\Users\\ana\\Documents\\Manuales",
    branch: null,
  });
  assert.deepEqual(p, { proveedor: null, sitio: "~\\Documents\\Manuales", rama: null });
  assert.equal(lineaDeProcedencia(p, "Carpeta"), "Carpeta · ~\\Documents\\Manuales");
});

test("un git cuya URL no se entiende no se disfraza de carpeta", () => {
  const p = procedencia({ kind: "git", location: "lo-que-sea", branch: "dev" });
  assert.equal(p.proveedor, "git");
  assert.equal(lineaDeProcedencia(p, "Carpeta"), "git · lo-que-sea · dev");
});
