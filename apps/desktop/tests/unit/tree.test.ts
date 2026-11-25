import assert from "node:assert/strict";
import test from "node:test";

import {
  construir,
  estadoLocal,
  filtrar,
  localesDeGit,
  localesDeKn,
  type Nodo,
  rutasDeCarpetas,
} from "../../../../packages/features/code/src/model/tree.ts";

const RUTAS = [
  "README.md",
  "src/features/code/diff.ts",
  "src/features/code/Code.tsx",
  "src-tauri/src/development.rs",
];
const CAMBIOS = [
  { path: "src/features/code/diff.ts", added: 3, removed: 1, status: "M" },
];

const buscar = (nodos: Nodo[], ruta: string): Nodo | null => {
  for (const n of nodos) {
    if (n.ruta === ruta) return n;
    if (n.tipo === "carpeta") {
      const hallado = buscar(n.hijos, ruta);
      if (hallado) return hallado;
    }
  }
  return null;
};

test("lo que sigue en la nube entra en su carpeta, marcado, sin duplicar lo que ya está", () => {
  const arbol = construir(
    ["docs/acta.md"],
    [],
    [],
    new Map(),
    ["docs/anexo.pdf", "docs/acta.md", "informe.pdf"],
  );
  const anexo = buscar(arbol, "docs/anexo.pdf");
  assert.equal(anexo?.tipo, "archivo");
  if (anexo?.tipo !== "archivo") return;
  assert.equal(anexo.nube, true);
  const acta = buscar(arbol, "docs/acta.md");
  assert.ok(acta?.tipo === "archivo" && !acta.nube);
  const docs = buscar(arbol, "docs");
  assert.ok(docs?.tipo === "carpeta" && docs.hijos.length === 2);
  assert.ok(buscar(arbol, "informe.pdf")?.tipo === "archivo");
});

test("las carpetas de paso se compactan en una sola fila", () => {
  const arbol = construir(
    RUTAS,
    CAMBIOS,
    [],
    localesDeGit([{ path: CAMBIOS[0].path, index: " ", worktree: "M" }]),
  );
  const nombres = arbol.map((n) => n.nombre);
  assert.deepEqual(nombres, [
    "src/features/code",
    "src-tauri/src",
    "README.md",
  ]);

  const src = arbol[0];
  assert.equal(src.tipo, "carpeta");
  if (src.tipo !== "carpeta") return;
  // `src` tiene una sola hija de paso: se junta con ella hasta donde se bifurca.
  assert.equal(src.nombre, "src/features/code");
  assert.equal(src.ruta, "src/features/code");

  const tauri = arbol[1];
  if (tauri.tipo !== "carpeta") throw new Error("src-tauri es una carpeta");
  assert.equal(tauri.nombre, "src-tauri/src");
});

test("una carpeta cuenta los cambios de cualquier profundidad", () => {
  const arbol = construir(
    RUTAS,
    CAMBIOS,
    [],
    localesDeGit([{ path: CAMBIOS[0].path, index: " ", worktree: "M" }]),
  );
  const src = arbol[0];
  if (src.tipo !== "carpeta") throw new Error("src es una carpeta");
  assert.equal(src.cambiados, 1);

  const tauri = arbol[1];
  if (tauri.tipo !== "carpeta") throw new Error("src-tauri es una carpeta");
  assert.equal(tauri.cambiados, 0);
});

test("las carpetas nombradas aparte salen, y un repo anidado no se funde", () => {
  const nodos = construir(
    ["a/b/c.txt", "x/repo/src/main.rs"],
    [],
    [
      { path: "vacia", repo: false },
      { path: "x", repo: false },
      { path: "x/repo", repo: true },
      { path: "x/repo/src", repo: false },
    ],
  );
  const vacia = buscar(nodos, "vacia");
  assert.equal(vacia?.tipo, "carpeta");
  assert.equal(vacia?.tipo === "carpeta" && vacia.hijos.length, 0);

  const ab = buscar(nodos, "a/b");
  assert.equal(ab?.nombre, "a/b");

  const x = buscar(nodos, "x");
  assert.equal(x?.nombre, "x");
  const repo = buscar(nodos, "x/repo");
  assert.equal(repo?.tipo === "carpeta" && repo.repo, true);
  assert.equal(repo?.nombre, "repo");
  assert.equal(buscar(nodos, "x/repo/src")?.nombre, "src");
});

test("los siete conflictos no se confunden con archivos sin seguimiento", () => {
  for (const xy of ["DD", "AU", "UD", "UA", "DU", "AA", "UU"]) {
    assert.deepEqual(
      estadoLocal({ path: "a", index: xy[0], worktree: xy[1] }),
      { marca: "!" },
    );
  }
  assert.deepEqual(estadoLocal({ path: "a", index: "?", worktree: "?" }), {
    marca: "U",
  });
});

test("cada estado conserva si está preparado o no preparado", () => {
  for (const marca of ["M", "A", "D", "R", "C", "T"]) {
    assert.deepEqual(estadoLocal({ path: "a", index: marca, worktree: " " }), {
      marca,
      index: marca,
      worktree: undefined,
    });
    assert.deepEqual(estadoLocal({ path: "a", index: " ", worktree: marca }), {
      marca,
      index: undefined,
      worktree: marca,
    });
  }
});

test("un archivo limpio puede abrir su diff de rama sin marca local", () => {
  const arbol = construir(RUTAS, CAMBIOS);
  const archivo = buscar(arbol, CAMBIOS[0].path);
  assert.ok(archivo?.tipo === "archivo");
  assert.equal(archivo.cambio, CAMBIOS[0]);
  assert.equal(archivo.local, undefined);
  assert.ok(arbol[0].tipo === "carpeta");
  assert.equal(arbol[0].cambiados, 0);
  assert.equal(
    estadoLocal({ path: "a", index: " ", worktree: " " }),
    undefined,
  );
  assert.equal(
    estadoLocal({ path: "a", index: "!", worktree: "!" }),
    undefined,
  );
});

test("los eliminados ausentes aparecen una sola vez y marcan su carpeta", () => {
  const estados = [
    { path: "src/borrado.ts", index: "D", worktree: " " },
    { path: "src/otro.ts", index: " ", worktree: "D" },
    { path: "src/nuevo.ts", index: "R", worktree: " " },
  ];
  const arbol = construir(
    ["src/otro.ts", "src/nuevo.ts", "src/nuevo.ts"],
    [],
    [],
    localesDeGit(estados),
  );
  assert.ok(arbol[0].tipo === "carpeta");
  assert.equal(arbol[0].cambiados, 3);
  assert.deepEqual(
    arbol[0].hijos.map((n) => n.ruta),
    ["src/borrado.ts", "src/nuevo.ts", "src/otro.ts"],
  );
  const borrado = buscar(arbol, "src/borrado.ts");
  assert.ok(borrado?.tipo === "archivo");
  assert.equal(borrado.local?.marca, "D");
});

test("en una copia kn cada archivo lleva lo que Guardar haría con él", () => {
  const arbol = construir(
    ["acta.md", "anexos/nuevo.pdf"],
    [],
    [],
    localesDeKn([
      { path: "acta.md", kind: "modified" },
      { path: "anexos/nuevo.pdf", kind: "added" },
      { path: "viejo.docx", kind: "deleted" },
    ]),
  );
  const local = (ruta: string) => {
    const n = buscar(arbol, ruta);
    return n?.tipo === "archivo" ? n.local : undefined;
  };
  assert.deepEqual(local("acta.md"), { marca: "M", kn: true });
  assert.deepEqual(local("anexos/nuevo.pdf"), { marca: "A", kn: true });
  assert.deepEqual(local("viejo.docx"), { marca: "D", kn: true });
  const anexos = buscar(arbol, "anexos");
  assert.ok(anexos?.tipo === "carpeta" && anexos.cambiados === 1);
});

test("buscar por nombre deja el archivo y abre su carpeta", () => {
  const arbol = construir(["src/ui/Badge.tsx", "src/ui/Button.tsx", "CREDITS.md"], []);
  const hallado = filtrar(arbol, "badge");
  assert.equal(hallado.length, 1);
  assert.equal(hallado[0].tipo, "carpeta");
  if (hallado[0].tipo !== "carpeta") return;
  assert.equal(hallado[0].hijos.length, 1);
  assert.equal(hallado[0].hijos[0].ruta, "src/ui/Badge.tsx");
  assert.ok(rutasDeCarpetas(hallado).has("src/ui"));
});

test("buscar el nombre de una carpeta deja el subárbol entero", () => {
  const arbol = construir(["src/ui/Badge.tsx", "README.md"], []);
  const hallado = filtrar(arbol, "src");
  assert.equal(hallado.length, 1);
  assert.equal(hallado[0].tipo, "carpeta");
  if (hallado[0].tipo !== "carpeta") return;
  assert.ok(hallado[0].hijos.some((n) => n.ruta === "src/ui/Badge.tsx" || n.tipo === "carpeta"));
});

test("una carpeta pesada sale plegada y se llena con sus páginas sin perder la marca de ignorada", () => {
  const carpetas = [
    { path: ".venv", repo: false, lazy: true, ignored: true },
    { path: "node_modules", repo: false, lazy: true, ignored: false },
  ];
  const plegado = construir(["main.py"], [], carpetas);
  const venv = buscar(plegado, ".venv");
  assert.ok(venv?.tipo === "carpeta" && venv.plegada && venv.ignorada && venv.hijos.length === 0);
  const deps = buscar(plegado, "node_modules");
  assert.ok(deps?.tipo === "carpeta" && deps.plegada && !deps.ignorada);

  // Lo que dan las páginas de `tree_folder`: un nivel cada vez, subcarpetas plegadas.
  const nivel = [{ path: ".venv/lib", repo: false, lazy: true, ignored: false }];
  const sitio = [{ path: ".venv/lib/site-packages", repo: false, lazy: true, ignored: false }];
  const paginas = Array.from({ length: 1500 }, (_, i) => `.venv/lib/site-packages/m${String(i).padStart(4, "0")}.py`);
  const abierto = construir(["main.py", ".venv/pyvenv.cfg", ...paginas], [], [...carpetas, ...nivel, ...sitio]);
  const lib = buscar(abierto, ".venv/lib");
  assert.ok(lib?.tipo === "carpeta" && lib.nombre === "lib" && lib.ignorada, "una plegada no se compacta con su hija");
  const site = buscar(abierto, ".venv/lib/site-packages");
  assert.ok(site?.tipo === "carpeta" && site.ignorada && site.hijos.length === 1500);
  assert.equal(site.hijos[0].ruta, ".venv/lib/site-packages/m0000.py");
  const main = buscar(abierto, "main.py");
  assert.ok(main?.tipo === "archivo");
  assert.equal(abierto[abierto.length - 1].ruta, "main.py");
});
