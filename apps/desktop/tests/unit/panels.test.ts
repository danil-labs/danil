import assert from "node:assert/strict";
import test from "node:test";

/**
 * **La ventana única, en lo que se rompe callado.**
 *
 * El marco tiene una sola ventana (`MAX_COLUMNS` y `MAX_ROWS` valen 1): las
 * pestañas viven en la franja de arriba y no hay gesto que parta. Nada de esto
 * da un error cuando falla: aparece una segunda celda que nadie pidió, una
 * pestaña está en dos tiras a la vez, o volver a un espacio con un reparto
 * guardado de antes pierde las pestañas que estaban a la derecha.
 *
 * Y las que este archivo existe para fijar:
 *
 * - **la rejilla no pasa de una ventana**, la pida quien la pida;
 * - **ninguna pestaña está en dos sitios**, que es cómo se rompe un arrastre;
 * - **un reparto guardado de varias ventanas se junta en una**, con delante la
 *   pestaña de la ventana que mandaba.
 */

// `localStorage` no existe en Node sin banderas, y `lib/prefs.ts` lo usa al
// guardar. Un stub en memoria es suficiente: lo que se prueba es qué se guarda,
// no dónde.
const almacen = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = {
  getItem: (k: string) => almacen.get(k) ?? null,
  setItem: (k: string, v: string) => void almacen.set(k, v),
  removeItem: (k: string) => void almacen.delete(k),
  clear: () => void almacen.clear(),
  key: (i: number) => [...almacen.keys()][i] ?? null,
  get length() {
    return almacen.size;
  },
};

const {
  createPanels: createPanels,
  MAX_COLUMNS: MAX_COLUMNS,
  MAX_ROWS: MAX_ROWS,
  gridTracks: gridTracks,
  gridCell: gridCell,
  dividerSpan: dividerSpan,
  sameSite: sameSite,
  saveLayout,
  readLayout,
  deleteLayout,
  spacesWithLayout,
} = await import("../../src/lib/panels.ts");

type P = ReturnType<typeof createPanels>;

/** Que suman uno, que son positivos, y que hay tantos como pistas. */
const fracciones = (ts: number[], cuantas: number, que: string) => {
  assert.equal(ts.length, cuantas, `un ${que} por pista`);
  const suma = ts.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(suma - 1) < 1e-9, `los ${que} suman ${suma}`);
  assert.ok(
    ts.every((t) => t > 0),
    `hay una pista sin ${que}: ${JSON.stringify(ts)}`,
  );
};

/** La rejilla entera en pie. */
const sano = (p: P) => {
  const cols = p.columns();
  fracciones(p.widths(), cols.length, "ancho");
  fracciones(p.heights(), p.rowCount(), "alto");
  assert.ok(
    cols.every((c) => c.length > 0),
    `hay una columna sin ventanas: ${JSON.stringify(cols)}`,
  );
  const todas = cols.flatMap((c) => c.flatMap((g) => g.pestanas));
  assert.equal(
    new Set(todas).size,
    todas.length,
    `una pestaña está en dos ventanas: ${JSON.stringify(cols)}`,
  );
  for (const c of cols)
    for (const g of c) {
      assert.ok(
        g.pestanas.length > 0 || g.activa === null,
        "una ventana se quedó vacía y no se cerró",
      );
      if (g.activa !== null)
        assert.ok(
          g.pestanas.includes(g.activa),
          `una ventana enseña algo que no tiene: ${g.activa}`,
        );
    }
  assert.ok(p.groupAt(p.activeSite()) !== null, "la ventana activa no existe");
  assert.ok(
    cols.length <= MAX_COLUMNS && p.rowCount() <= MAX_ROWS,
    "la rejilla se salió de su tope",
  );
};

/** Una ventana con estas pestañas ya puestas. */
const con = (...ids: string[]): P => {
  const p = createPanels();
  p.sync(ids);
  return p;
};

const uno = { col: 0, fila: 0 };
const lados = ["left", "right", "up", "down"] as const;

test("la ventana no se parte por ningún lado", () => {
  const p = con("a", "b", "c");
  assert.equal(p.canSplit(), false, "con una sola ventana no hay hueco");
  assert.equal(p.split("a"), false);
  for (const side of lados) {
    assert.equal(p.canSplitAt("a", uno, side), false, side);
    assert.equal(p.splitAt("a", uno, side), false, side);
  }
  assert.equal(p.groupCount(), 1);
  assert.equal(p.isSplit(), false);
  assert.deepEqual(p.tabsAt(uno), ["a", "b", "c"], "un intento de partir movió pestañas");
  assert.deepEqual(p.widths(), [1]);
  assert.deepEqual(p.heights(), [1]);
  sano(p);
});

test("una tarea del riel arrastrada a un borde no ofrece dónde partir", () => {
  const p = createPanels();
  // App.tsx pinta la zona de soltar solo si `canSplitAt` la acepta: con la
  // ventana única no hay borde que iluminar, tampoco para una tarea sin pestaña.
  for (const side of lados) assert.equal(p.canSplitAt("rail", uno, side, true), false, side);
  assert.equal(p.canSplitAt("rail", { col: 9, fila: 0 }, "right", true), false);
  assert.equal(p.siteOf("rail"), null);
  p.sync(["rail"]);
  assert.equal(p.splitAt("rail", uno, "right"), false);
  assert.deepEqual(p.siteOf("rail"), uno, "entra en la ventana, no en una nueva");
  sano(p);
});

test("partir contra una ventana que no existe no hace nada", () => {
  const p = con("a", "b");
  assert.equal(p.canSplitAt("a", { col: 3, fila: 0 }, "right"), false);
  assert.equal(p.splitAt("a", { col: 3, fila: 0 }, "right"), false);
  assert.equal(p.canSplitAt("fantasma", uno, "right"), false);
  sano(p);
});

test("cerrar la última pestaña deja la ventana en pie y sin nada delante", () => {
  const p = con("a");
  assert.equal(p.close("a"), null);
  assert.equal(p.groupCount(), 1, "la única ventana no se cierra");
  assert.deepEqual(p.tabsAt(uno), []);
  assert.equal(p.activeTabAt(uno), null, "enseña una pestaña cerrada");
  // Lo siguiente que se abre cae en ella.
  p.sync(["b"]);
  assert.deepEqual(p.tabsAt(uno), ["b"]);
  assert.equal(p.activeTabAt(uno), "b");
  sano(p);
});

test("cerrar una de varias deja delante la vecina", () => {
  const p = con("a", "b", "c");
  p.activate("b");
  assert.equal(p.close("b"), "c", "la de la derecha");
  assert.deepEqual(p.tabsAt(uno), ["a", "c"]);
  assert.equal(p.close("c"), "a", "y si no, la de la izquierda");
  sano(p);
});

test("arrastrar dentro de la tira reordena", () => {
  const p = con("a", "b", "c");
  assert.equal(p.move("c", uno, 0), true);
  assert.deepEqual(p.tabsAt(uno), ["c", "a", "b"]);
  assert.equal(p.activeTabAt(uno), "c", "lo soltado queda delante");
  assert.equal(p.move("c", uno, 0), false, "soltar donde ya está no hace nada");
  assert.equal(p.move("a", uno, 2), true);
  assert.deepEqual(p.tabsAt(uno), ["c", "b", "a"]);
  assert.equal(p.move("a", { col: 1, fila: 0 }), false, "no hay otra ventana a la que llevarla");
  assert.equal(p.move("fantasma", uno), false);
  sano(p);
});

test("activar una pestaña la trae delante sin mover el mando", () => {
  const p = con("a", "b");
  assert.equal(p.isVisible("b"), true);
  p.activate("a");
  assert.equal(p.activeTabAt(uno), "a");
  assert.equal(p.isVisible("a"), true);
  assert.equal(p.isVisible("b"), false, "dos pestañas delante en una ventana");
  assert.deepEqual(p.activeSite(), uno);
  p.focus({ col: 1, fila: 0 });
  assert.deepEqual(p.activeSite(), uno, "enfocar una ventana que no existe se llevó el mando");
  sano(p);
});

test("una pestaña nueva entra al final sin robar el frente", () => {
  const p = con("a", "b");
  p.activate("a");
  assert.equal(p.sync(["a", "b", "nueva"]), true);
  assert.deepEqual(p.tabsAt(uno), ["a", "b", "nueva"]);
  assert.equal(p.activeTabAt(uno), "a");
  assert.equal(p.sync(["a", "b", "nueva"]), false, "nada que reconciliar");
  sano(p);
});

test("cerrar una tarea se lleva de golpe las pestañas de sus documentos", () => {
  const p = con("t", "d1", "d2");
  // `cerrarPestana` sincroniza con todo lo que dejó de existir, y una tarea se
  // lleva sus documentos detrás (`lib/tabs.ts`). Se van de una pasada.
  p.sync([]);
  assert.equal(p.groupCount(), 1);
  assert.deepEqual(p.tabsAt(uno), []);
  assert.equal(p.activeTabAt(uno), null);
  sano(p);
});

/**
 * Un archivo abierto antes de la tarea cambia de id cuando el primer turno la
 * crea (`lib/tabs.ts` · `reatar`). Sin renombrarlo aquí, la siguiente pasada de
 * `sincronizar` lo ve como uno que murió y otro que nació: la pestaña salta al
 * final de la tira y pierde el frente.
 */
test("renombrar una pestaña la deja en su sitio y delante", () => {
  const p = con("viejo", "t");
  p.activate("viejo");
  p.renameTabs([["viejo", "nuevo"]]);
  assert.deepEqual(p.tabsAt(uno), ["nuevo", "t"]);
  assert.equal(p.activeTabAt(uno), "nuevo");
  assert.equal(p.sync(["nuevo", "t"]), false, "nada que reconciliar");
  sano(p);
});

test("juntar y repartir no tienen nada que hacer con una ventana", () => {
  const p = con("a", "b");
  assert.equal(p.join(), false);
  p.resizeColumns(0, 0.5, 0.5);
  assert.deepEqual(p.widths(), [1], "sin vecino a la derecha no hay reparto");
  p.resizeRows(0, 0.5, 0.5);
  assert.deepEqual(p.heights(), [1], "ni debajo");
  p.resizeColumns(-1, 0.5, 0.5);
  p.resizeRows(3, 0.5, 0.5);
  assert.deepEqual(p.widths(), [1]);
  sano(p);
});

test("cambiar de workspace deja la ventana vacía", () => {
  const p = con("a", "b", "c");
  p.reset();
  assert.equal(p.groupCount(), 1);
  assert.deepEqual(p.tabsAt(uno), []);
  assert.deepEqual(p.widths(), [1]);
  assert.deepEqual(p.heights(), [1]);
  assert.deepEqual(p.activeSite(), uno);
  sano(p);
});

/**
 * **La geometría de la cuadrícula, que es lo que no se ve fallar.**
 *
 * Un `grid-row` mal numerado no da error: pone dos ventanas en la misma celda y
 * el navegador las apila una encima de la otra. Un `/ -1` que falta deja media
 * pantalla en blanco debajo de una columna sin partir. Y una pista de divisor
 * que se cuenta mal corre todo lo que viene detrás una celda.
 *
 * `Panels.tsx` y `App.tsx` siguen pintando con estas funciones aunque haya
 * una sola ventana. Se prueba aquí y no montando el componente porque **es aritmética**: las
 * pruebas de este repo no levantan jsdom, y lo que hay que fijar son los
 * números, no el DOM.
 */

test("las pistas intercalan la del divisor, y las fr no la pagan", () => {
  assert.equal(gridTracks([1]), "1fr", "sin vecino no hay divisor que intercalar");
  assert.equal(gridTracks([0.5, 0.5]), "0.5fr 12px 0.5fr");
  assert.equal(gridTracks([0.7, 0.3]), "0.7fr 12px 0.3fr");
});

test("la celda cae en la pista impar, y la última de su columna llega al final", () => {
  assert.deepEqual(gridCell({ col: 0, fila: 0 }, 1), {
    "grid-column": "1",
    "grid-row": "1 / -1",
  });
  // La columna 1 salta la pista del divisor: 2·1 + 1 = 3.
  assert.deepEqual(gridCell({ col: 1, fila: 0 }, 1), {
    "grid-column": "3",
    "grid-row": "1 / -1",
  });
  assert.deepEqual(gridCell({ col: 1, fila: 0 }, 2), {
    "grid-column": "3",
    "grid-row": "1",
  });
  assert.deepEqual(gridCell({ col: 1, fila: 1 }, 2), {
    "grid-column": "3",
    "grid-row": "3 / -1",
  });
});

test("el divisor vertical cruza entero; el horizontal, solo lo partido", () => {
  assert.deepEqual(dividerSpan(0, false, [1, 2]), {
    "grid-column": "2",
    "grid-row": "1 / -1",
  });
  // La maqueta `1 + 2`: la línea horizontal no cruza la columna sin partir.
  assert.deepEqual(dividerSpan(0, true, [1, 2]), {
    "grid-row": "2",
    "grid-column": "3 / 4",
  });
  assert.deepEqual(dividerSpan(0, true, [2, 2]), {
    "grid-row": "2",
    "grid-column": "1 / 4",
  });
  assert.deepEqual(dividerSpan(0, true, [2, 1]), {
    "grid-row": "2",
    "grid-column": "1 / 2",
  });
});

test("la ventana única ocupa la celda entera", () => {
  const p = con("a", "b");
  assert.deepEqual(p.sites(), [uno]);
  assert.deepEqual(p.rowsPerColumn(), [1]);
  assert.deepEqual(gridCell(uno, p.rowsPerColumn()[0]), { "grid-column": "1", "grid-row": "1 / -1" });
  assert.equal(gridTracks(p.widths()), "1fr");
  assert.equal(sameSite({ col: 0, fila: 0 }, { col: 0, fila: 0 }), true);
  assert.equal(sameSite({ col: 0, fila: 0 }, { col: 1, fila: 0 }), false);
  assert.equal(sameSite(null, { col: 0, fila: 0 }), false);
});

/**
 * **La conversación en blanco, que es lo único que ocupa una celda sin ser una
 * pestaña.**
 *
 * `blanquear()` deja la ventana con sus pestañas y sin ninguna delante. Eso
 * inventa un vacío que el invariante de arriba no mide: `sano` cuenta
 * `pestanas.length`, y aquí la cuenta está bien —lo que falta es qué enseñar—.
 *
 * Lo que se afirma es el contrato que `App.tsx` pinta: **una ventana sin
 * pestaña delante es una ventana en blanco**.
 */
test("blanquear deja la ventana sin nada delante, y conserva sus pestañas", () => {
  const p = con("a", "b");
  assert.equal(p.activeTabAt({ col: 0, fila: 0 }), "b");
  p.showDraft();
  assert.equal(
    p.activeTabAt({ col: 0, fila: 0 }),
    null,
    "la ventana sigue enseñando algo después de blanquear",
  );
  assert.deepEqual(
    p.tabsAt({ col: 0, fila: 0 }),
    ["a", "b"],
    "blanquear se llevó las pestañas, y solo debía soltar la de delante",
  );
  assert.equal(p.isVisible("b"), false);
  sano(p);
});

/**
 * El reparto de un espacio, que vuelve al cambiar de espacio y al reiniciar.
 *
 * Un reparto guardado antes de la ventana única puede traer dos columnas y dos
 * filas. Leerlo celda a celda perdería las pestañas que no caben; por eso se
 * juntan todas en la ventana, en orden de columnas, y delante queda la de la
 * celda que mandaba. Nada de esto da error cuando falla.
 */

const dosColumnas = (activo: { col: number; fila: number }) => ({
  columnas: [[{ pestanas: ["a", "b"], activa: "a" }], [{ pestanas: ["c"], activa: "c" }]],
  anchos: [0.7, 0.3],
  altos: [1],
  activo,
});

test("el reparto vuelve entero: pestañas, frente y geometría", () => {
  const p = con("a", "b", "c");
  p.activate("b");
  const q = createPanels();
  q.restore(p.layout(), ["a", "b", "c"]);
  assert.deepEqual(q.tabsAt(uno), ["a", "b", "c"]);
  assert.equal(q.activeTabAt(uno), "b");
  assert.deepEqual(q.widths(), [1]);
  assert.deepEqual(q.activeSite(), uno);
  sano(q);
});

test("un reparto guardado de varias ventanas se junta en una", () => {
  const q = createPanels();
  q.restore(dosColumnas({ col: 1, fila: 0 }), ["a", "b", "c"]);
  assert.equal(q.groupCount(), 1);
  assert.deepEqual(q.tabsAt(uno), ["a", "b", "c"], "se perdió una pestaña de la otra ventana");
  assert.equal(q.activeTabAt(uno), "c", "delante va la de la ventana que mandaba");
  assert.deepEqual(q.widths(), [1], "se quedaron los anchos de dos columnas");
  assert.deepEqual(q.activeSite(), uno);
  sano(q);

  const r = createPanels();
  r.restore(dosColumnas({ col: 0, fila: 0 }), ["a", "b", "c"]);
  assert.equal(r.activeTabAt(uno), "a");
  sano(r);

  // Con dos filas también: el orden es el de lectura por columnas.
  const s = createPanels();
  s.restore(
    {
      columnas: [
        [{ pestanas: ["a"], activa: "a" }, { pestanas: ["b"], activa: "b" }],
        [{ pestanas: ["c"], activa: "c" }],
      ],
      anchos: [0.5, 0.5],
      altos: [0.5, 0.5],
      activo: { col: 0, fila: 1 },
    },
    ["a", "b", "c"],
  );
  assert.deepEqual(s.tabsAt(uno), ["a", "b", "c"]);
  assert.equal(s.activeTabAt(uno), "b");
  assert.deepEqual(s.heights(), [1]);
  sano(s);
});

test("si la ventana que mandaba estaba en blanco, delante va la primera que tenía algo", () => {
  const q = createPanels();
  q.restore(
    {
      columnas: [[{ pestanas: ["a"], activa: "a" }], [{ pestanas: ["b"], activa: null }]],
      anchos: [0.5, 0.5],
      altos: [1],
      activo: { col: 1, fila: 0 },
    },
    ["a", "b"],
  );
  assert.deepEqual(q.tabsAt(uno), ["a", "b"]);
  assert.equal(q.activeTabAt(uno), "a");
  sano(q);
});

test("restaurar solo trae lo que sigue vivo", () => {
  const q = createPanels();
  // `c` murió —una pestaña de contenido no vuelve—: no se cuela, y el frente
  // que apuntaba a ella cae en lo que queda.
  q.restore(dosColumnas({ col: 1, fila: 0 }), ["a", "b"]);
  assert.deepEqual(q.tabsAt(uno), ["a", "b"]);
  assert.equal(q.activeTabAt(uno), "a");
  sano(q);
  // Y una que no estaba guardada entra por `sincronizar`.
  q.sync(["a", "b", "nueva"]);
  assert.deepEqual(q.siteOf("nueva"), uno);
  sano(q);
});

test("un reparto guardado roto no deja la rejilla rota", () => {
  const q = createPanels();
  q.restore(
    {
      columnas: [[{ pestanas: ["a"], activa: "fantasma" }]],
      anchos: [2, -1],
      altos: [],
      activo: { col: 9, fila: 9 },
    },
    ["a"],
  );
  assert.deepEqual(q.tabsAt(uno), ["a"]);
  assert.equal(q.activeTabAt(uno), "a", "una activa inventada no se sostiene");
  assert.deepEqual(q.widths(), [1], "unos anchos que no suman uno se rehacen");
  assert.deepEqual(q.heights(), [1]);
  assert.deepEqual(q.activeSite(), uno);
  sano(q);
  // Basura dentro de las columnas tampoco.
  q.restore(
    { columnas: ["no", [null, { pestanas: "x" }, { pestanas: [7, "a"], activa: 3 }]], anchos: [], altos: [], activo: uno } as never,
    ["a"],
  );
  assert.deepEqual(q.tabsAt(uno), ["a"]);
  sano(q);
  // Sin nada guardado también queda la rejilla sana.
  q.restore(null, []);
  assert.equal(q.groupCount(), 1);
  assert.deepEqual(q.tabsAt(uno), []);
  sano(q);
});

test("restaurar no repite una pestaña", () => {
  const q = createPanels();
  q.restore(
    {
      columnas: [[{ pestanas: ["a", "a"], activa: "a" }], [{ pestanas: ["a", "b"], activa: "b" }]],
      anchos: [0.5, 0.5],
      altos: [1],
      activo: { col: 0, fila: 0 },
    },
    ["a", "b"],
  );
  assert.deepEqual(q.tabsAt(uno), ["a", "b"]);
  sano(q);
});

test("el reparto se guarda y se lee por workspace y espacio", () => {
  saveLayout("w", "i1", {
    columnas: [[{ pestanas: ["a"], activa: "a" }], [{ pestanas: ["b"], activa: "b" }]],
    anchos: [0.5, 0.5],
    altos: [1],
    activo: { col: 1, fila: 0 },
  });
  assert.deepEqual(readLayout("w", "i1")?.columnas, [
    [{ pestanas: ["a"], activa: "a" }],
    [{ pestanas: ["b"], activa: "b" }],
  ]);
  assert.equal(readLayout("w", "i2"), null, "el reparto de un espacio no es el de otro");
  assert.deepEqual(spacesWithLayout("w"), ["i1"]);
  assert.deepEqual(spacesWithLayout("otro"), []);
  deleteLayout("w", "i1");
  assert.equal(readLayout("w", "i1"), null);
  // Lo escrito sin la forma mínima no se toma por un reparto.
  almacen.set("harness.layout.panels.w.i9", JSON.stringify({ columnas: "no" }));
  assert.equal(readLayout("w", "i9"), null);
  almacen.set("harness.layout.panels.w.i9", "no es json");
  assert.equal(readLayout("w", "i9"), null);
});

test("cada cambio del reparto se guarda bajo el espacio encuadrado", () => {
  const p = con("a", "b");
  p.bindTo("w", "i1");
  assert.deepEqual(readLayout("w", "i1")?.columnas, [[{ pestanas: ["a", "b"], activa: "b" }]]);
  p.activate("a");
  assert.equal(readLayout("w", "i1")?.columnas[0][0].activa, "a", "activar no llegó a lo guardado");
  p.sync(["a", "b", "c"]);
  assert.deepEqual(readLayout("w", "i1")?.columnas[0][0].pestanas, ["a", "b", "c"]);
  // Al dejar el espacio deja de escribir: no pisa su reparto con el del que
  // llega, que es lo que rompería el cambio de espacio.
  p.bindTo(null, null);
  p.close("a");
  assert.deepEqual(readLayout("w", "i1")?.columnas[0][0].pestanas, ["a", "b", "c"], "sin encuadrar se pisó lo guardado");
});

// Reabrir con Ctrl+Shift+T: la tira que se pinta es la de la ventana, y `sync`
// deja lo que entra al final aunque fuera la primera pestaña.
test("lo reabierto vuelve tras su vecina izquierda, no al final", () => {
  const p = con("b", "c");
  p.sync(["a", "b", "c"]);
  assert.deepEqual(p.tabsAt(p.activeSite()), ["b", "c", "a"]);
  p.placeLikeStrip(["a"], ["a", "b", "c"]);
  assert.deepEqual(p.tabsAt(p.activeSite()), ["a", "b", "c"]);
  const q = con("a", "d");
  q.sync(["a", "b", "c", "d"]);
  q.placeLikeStrip(["b", "c"], ["a", "b", "c", "d"]);
  assert.deepEqual(q.tabsAt(q.activeSite()), ["a", "b", "c", "d"]);
  sano(q);
});


test("el layout solo guarda la misma proyección de tareas restaurables", () => {
  const p = createPanels(() => ["saved"]);
  p.sync(["saved", "preview", "file"]);
  p.activate("preview");
  p.bindTo("restorable-layout", "space");
  const stored = readLayout("restorable-layout", "space")!;
  assert.deepEqual(stored.columnas, [[{ pestanas: ["saved"], activa: "saved" }]]);
  assert.deepEqual(p.tabsAt({ col: 0, fila: 0 }), ["saved", "preview", "file"]);
});

test("la tarea conservada vuelve delante aunque su ventana guardada estuviera aparte", () => {
  saveLayout("empty-origin", "space", {
    columnas: [[{ pestanas: [], activa: null }], [{ pestanas: ["saved"], activa: "saved" }]],
    anchos: [0.5, 0.5],
    altos: [1],
    activo: { col: 1, fila: 0 },
  });
  const restored = createPanels(() => ["saved"]);
  restored.restore(readLayout("empty-origin", "space"), ["saved"]);
  assert.deepEqual(restored.siteOf("saved"), uno);
  assert.equal(restored.activeTabAt(uno), "saved");
  sano(restored);
});

test("panel layouts for the same workspace are isolated by session context", async () => {
  const { setDisplayWorkspaceContext } = await import("../../src/lib/workspace-context.ts");
  const layout = (id: string) => ({ columnas: [[{ pestanas: [id], activa: id }]], anchos: [1], altos: [1], activo: { col: 0, fila: 0 } });
  try {
    setDisplayWorkspaceContext("ana"); saveLayout("same-context-workspace", "desk", layout("ana-task"));
    setDisplayWorkspaceContext("bea"); assert.equal(readLayout("same-context-workspace", "desk"), null); saveLayout("same-context-workspace", "desk", layout("bea-task"));
    setDisplayWorkspaceContext("ana"); assert.deepEqual(readLayout("same-context-workspace", "desk"), layout("ana-task"));
    setDisplayWorkspaceContext("bea"); assert.deepEqual(readLayout("same-context-workspace", "desk"), layout("bea-task"));
  } finally { setDisplayWorkspaceContext(null); }
});

test("showDraft keeps the blank in front when sync adds another tab", () => {
  const p = con("a", "b");
  p.showDraft();
  assert.equal(p.activeTabAt(uno), null);
  p.sync(["a", "b", "c"]);
  assert.equal(p.activeTabAt(uno), null, "sync must not steal focus from an intentional blank draft");
  assert.deepEqual(p.tabsAt(uno), ["a", "b", "c"]);
  p.activate("c");
  assert.equal(p.activeTabAt(uno), "c");
  sano(p);
});
