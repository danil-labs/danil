import assert from "node:assert/strict";
import { test } from "node:test";
import { conservarEnOrden, reutilizar, sessionRefresh, type SessionLists } from "../../../../packages/session/src/sessionRefresh.ts";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function setup(projects = ["", "app"]) {
  const reads: { project: string; result: ReturnType<typeof deferred<string[]>> }[] = [];
  const timers: { run: () => void; ms: number }[] = [];
  let lists: SessionLists<string> = {};
  const refresh = sessionRefresh<string>({
    read: (project) => {
      const result = deferred<string[]>();
      reads.push({ project, result });
      return result.promise;
    },
    apply: (update) => { lists = update(lists); },
    projects: () => projects,
    key: (row) => row,
    schedule: (run, ms) => { timers.push({ run, ms }); return timers.length; },
    cancel: () => {},
  });
  return { refresh, reads, timers, lists: () => lists };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

type Fila = { id: string; title: string };

test("una respuesta anterior se pinta aunque la más nueva no vuelva", async () => {
  const s = setup(["app"]);
  const first = s.refresh.refresh(["app"]);
  void s.refresh.refresh(["app"]);
  s.reads[0].result.resolve(["a", "b"]);
  await first;
  assert.deepEqual(s.lists(), { app: ["a", "b"] });
});

test("una respuesta anterior no pisa a una más nueva ya pintada", async () => {
  const s = setup(["app"]);
  const first = s.refresh.refresh(["app"]);
  const second = s.refresh.refresh(["app"]);
  s.reads[1].result.resolve(["nueva"]);
  await second;
  s.reads[0].result.resolve(["vieja"]);
  await first;
  assert.deepEqual(s.lists(), { app: ["nueva"] });
});

test("un fallo conserva lo que había y reintenta solo, cada vez más espaciado", async () => {
  const s = setup(["app"]);
  const first = s.refresh.refresh(["app"]);
  s.reads[0].result.resolve(["a"]);
  await first;
  const failing = s.refresh.refresh(["app"]);
  s.reads[1].result.reject(new Error("cli.error.app_unavailable"));
  await failing;
  assert.deepEqual(s.lists(), { app: ["a"] });
  assert.equal(s.timers[0].ms, 1000);
  s.timers[0].run();
  s.reads[2].result.reject(new Error("cli.error.app_unavailable"));
  await settle();
  assert.equal(s.timers[1].ms, 2000);
  s.timers[1].run();
  s.reads[3].result.resolve(["a", "b"]);
  await settle();
  assert.deepEqual(s.lists(), { app: ["a", "b"] });
  assert.equal(s.timers.length, 2);
});

// `For` de Solid reconcilia por referencia: con una fila nueva en cada lectura
// destruye y reconstruye el DOM de la lista entera, y el fundido del título se
// dispararía en cada refresco sin que el título haya cambiado.
test("la fila que no cambió conserva su objeto entre dos lecturas", async () => {
  const filas = { reads: [] as { project: string; result: ReturnType<typeof deferred<Fila[]>> }[] };
  let lists: SessionLists<Fila> = {};
  const refresh = sessionRefresh<Fila>({
    read: (project) => {
      const result = deferred<Fila[]>();
      filas.reads.push({ project, result });
      return result.promise;
    },
    apply: (update) => { lists = update(lists); },
    projects: () => ["app"],
    key: (row) => row.id,
  });
  const quieta = { id: "a", title: "sin tocar" };
  const primera = refresh.refresh(["app"]);
  filas.reads[0].result.resolve([quieta, { id: "b", title: "vieja" }]);
  await primera;
  const antes = lists.app;
  const segunda = refresh.refresh(["app"]);
  filas.reads[1].result.resolve([{ id: "a", title: "sin tocar" }, { id: "b", title: "nueva" }]);
  await segunda;
  assert.equal(lists.app[0], antes[0]);
  assert.notEqual(lists.app[1], antes[1]);
  assert.equal(lists.app[1].title, "nueva");
});

test("una fila que se va no deja su objeto en la lista", async () => {
  let lists: SessionLists<Fila> = {};
  const reads: ReturnType<typeof deferred<Fila[]>>[] = [];
  const refresh = sessionRefresh<Fila>({
    read: () => {
      const result = deferred<Fila[]>();
      reads.push(result);
      return result.promise;
    },
    apply: (update) => { lists = update(lists); },
    projects: () => ["app"],
    key: (row) => row.id,
  });
  const primera = refresh.refresh(["app"]);
  reads[0].resolve([{ id: "a", title: "a" }, { id: "b", title: "b" }]);
  await primera;
  const segunda = refresh.refresh(["app"]);
  reads[1].resolve([{ id: "b", title: "b" }]);
  await segunda;
  assert.deepEqual(lists.app.map((row) => row.id), ["b"]);
});

test("cambiar de workspace descarta respuestas y reintentos pendientes", async () => {
  const s = setup(["app"]);
  const pending = s.refresh.refresh(["app"]);
  s.refresh.reset();
  s.reads[0].result.resolve(["otro workspace"]);
  await pending;
  assert.deepEqual(s.lists(), {});
});

test("los pedidos que llegan juntos se leen una sola vez, con todas sus carpetas", async () => {
  const reads: string[] = [];
  const timers: (() => void)[] = [];
  let lists: SessionLists<string> = {};
  const refresh = sessionRefresh<string>({
    read: async (project) => { reads.push(project); return [project]; },
    apply: (update) => { lists = update(lists); },
    projects: () => ["", "app"],
    key: (row) => row,
    schedule: (run) => timers.push(run),
    cancel: () => {},
    gather: 200,
  });
  const first = refresh.gathered([""]);
  const second = refresh.gathered(["", "app"]);
  assert.deepEqual(reads, []);
  assert.equal(timers.length, 1);
  timers[0]();
  await Promise.all([first, second]);
  assert.deepEqual(reads, ["", "app"]);
  assert.deepEqual(lists, { "": [""], app: ["app"] });
});

test("cambiar de workspace suelta a quien esperaba una lectura juntada, sin leer", async () => {
  const reads: string[] = [];
  const refresh = sessionRefresh<string>({
    read: async (project) => { reads.push(project); return []; },
    apply: () => {},
    projects: () => ["app"],
    key: (row) => row,
    schedule: () => 1,
    cancel: () => {},
    gather: 200,
  });
  const waiting = refresh.gathered(["app"]);
  refresh.reset();
  await waiting;
  assert.deepEqual(reads, []);
});

test("releer un hilo conserva los mensajes iguales y no los que cambiaron en su sitio", () => {
  type Mensaje = { turno: string; text: string; questionRequestId?: string };
  const antes: Mensaje[] = [{ turno: "t1", text: "a" }, { turno: "t2", text: "b" }];
  const igual = conservarEnOrden(antes, structuredClone(antes));
  assert.equal(igual, antes);
  const leida = [{ turno: "t1", text: "a" }, { turno: "t2", text: "b", questionRequestId: "q" }, { turno: "t3", text: "c" }];
  const despues = conservarEnOrden(antes, leida);
  assert.equal(despues[0], antes[0]);
  assert.equal(despues[1].questionRequestId, "q");
  assert.equal(despues[2].text, "c");
});

test("releer un mensaje que cambió conserva lo que no cambió de dentro", () => {
  const antes = [
    { turno: "t1", text: "a", tools: [{ name: "Read", target: "x" }], recipients: [{ id: "r" }] },
    { turno: "t2", text: "b", tools: [{ name: "Bash", target: "ls" }, { name: "Edit", target: "y" }] },
  ];
  const leida = structuredClone(antes);
  leida[1].text = "b y más";
  leida[1].tools[1] = { name: "Edit", target: "z" };
  const despues = conservarEnOrden(antes, leida);
  assert.equal(despues[0], antes[0]);
  assert.notEqual(despues[1], antes[1]);
  assert.equal(despues[1].tools[0], antes[1].tools[0]);
  assert.deepEqual(despues, leida);
  // Un campo que aparece, aunque valga `undefined`, es un cambio.
  const conCampo = reutilizar<Record<string, unknown>>({ a: 1 }, { a: 1, b: undefined });
  assert.ok("b" in conCampo);
});

test("una carpeta que no contesta no congela la barra: vence, se queda lo que había y las demás se pintan", async () => {
  let lists: SessionLists<string> = { app: ["vieja"] };
  const timers: { run: () => void; ms: number }[] = [];
  const refresh = sessionRefresh<string>({
    // `app` no vuelve nunca; `otra` contesta.
    read: (project) => (project === "app" ? new Promise<string[]>(() => {}) : Promise.resolve(["nueva"])),
    apply: (update) => { lists = update(lists); },
    projects: () => ["app", "otra"],
    key: (row) => row,
    schedule: (run, ms) => { timers.push({ run, ms }); return timers.length; },
    cancel: () => {},
    timeout: 5,
  });
  await refresh.refresh(["app", "otra"]);
  assert.deepEqual(lists, { app: ["vieja"], otra: ["nueva"] });
  assert.equal(timers.at(-1)?.ms, 1000, "la carpeta vencida se reintenta");
});

test("cada carpeta se pinta en cuanto vuelve, sin esperar a la más lenta", async () => {
  const s = setup(["app", "lenta"]);
  const pending = s.refresh.refresh(["app", "lenta"]);
  s.reads.find((r) => r.project === "app")?.result.resolve(["a"]);
  await settle();
  assert.deepEqual(s.lists(), { app: ["a"] }, "la rápida ya está pintada");
  s.reads.find((r) => r.project === "lenta")?.result.resolve(["l"]);
  await pending;
  assert.deepEqual(s.lists(), { app: ["a"], lenta: ["l"] });
});

test("releer una sola carpeta deja las demás como estaban", async () => {
  const s = setup(["app", "otra"]);
  const first = s.refresh.refresh(["app", "otra"]);
  for (const r of s.reads) r.result.resolve([`${r.project}-1`]);
  await first;
  const second = s.refresh.refresh(["app"]);
  s.reads[2].result.resolve(["app-2"]);
  await second;
  assert.deepEqual(s.lists(), { app: ["app-2"], otra: ["otra-1"] });
});

test("una carpeta que ya no está en el riel se suelta al pintar otra", async () => {
  let projects = ["app", "vieja"];
  let lists: SessionLists<string> = {};
  const refresh = sessionRefresh<string>({
    read: async (project) => [project],
    apply: (update) => { lists = update(lists); },
    projects: () => projects,
    key: (row) => row,
    schedule: () => 0,
    cancel: () => {},
  });
  await refresh.refresh(["app", "vieja"]);
  projects = ["app"];
  await refresh.refresh(["app"]);
  assert.deepEqual(lists, { app: ["app"] });
});

test("un aviso de una carpeta que el riel no enseña no la mete", async () => {
  let lists: SessionLists<string> = {};
  const refresh = sessionRefresh<string>({
    read: async (project) => [project],
    apply: (update) => { lists = update(lists); },
    projects: () => ["app"],
    key: (row) => row,
    schedule: () => 0,
    cancel: () => {},
  });
  await refresh.refresh(["app"]);
  await refresh.refresh(["ajena"]);
  assert.deepEqual(lists, { app: ["app"] });
});

test("limita lecturas simultáneas y salta carpetas en cola superadas por una ola más nueva", async () => {
  const projects = ["p1", "p2", "p3", "p4", "p5", "p6"];
  let inFlight = 0;
  let peak = 0;
  const started: { project: string; result: ReturnType<typeof deferred<string[]>> }[] = [];
  let lists: SessionLists<string> = {};
  const refresh = sessionRefresh<string>({
    read: (project) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      const result = deferred<string[]>();
      started.push({ project, result });
      return result.promise.finally(() => { inFlight--; });
    },
    apply: (update) => { lists = update(lists); },
    projects: () => projects,
    key: (row) => row,
    schedule: () => 0,
    cancel: () => {},
    concurrency: 2,
  });
  const wave1 = refresh.refresh(["p1", "p1", "p2", "p3", "p4", "p5", "p6"]);
  assert.equal(started.length, 2, "solo arranca hasta concurrency");
  const wave2 = refresh.refresh(projects);
  while (started.length > 0) {
    const next = started.shift()!;
    next.result.resolve([next.project]);
    await settle();
  }
  await Promise.all([wave1, wave2]);
  assert.equal(peak, 2, "nunca rebasa el tope de concurrencia");
  assert.deepEqual(Object.keys(lists).sort(), projects);
  // Wave 1 arrancó p1 y p2; p3..p6 en cola se saltaron porque wave 2 ya los pidió.
  // Wave 2 leyó las 6 carpetas -> total 8 lecturas en vez de 12 (o 13 sin deduplicar).
  assert.equal(Object.values(lists).flat().length, 6);
});

test("reset suelta de inmediato las lecturas en cola sin llamar a read", async () => {
  const projects = ["p1", "p2", "p3"];
  const reads: string[] = [];
  const pending: ReturnType<typeof deferred<string[]>>[] = [];
  const refresh = sessionRefresh<string>({
    read: (project) => {
      reads.push(project);
      const d = deferred<string[]>();
      pending.push(d);
      return d.promise;
    },
    apply: () => {},
    projects: () => projects,
    key: (row) => row,
    schedule: () => 0,
    cancel: () => {},
    concurrency: 1,
  });
  const first = refresh.refresh(projects);
  assert.deepEqual(reads, ["p1"]);
  refresh.reset();
  pending[0].resolve(["p1"]);
  await first;
  assert.deepEqual(reads, ["p1"], "p2 y p3 nunca se leyeron tras reset");
});

test("el reintento solo vuelve a leer las carpetas que fallaron", async () => {
  const reads: string[] = [];
  const timers: { run: () => void; ms: number }[] = [];
  let failApp = true;
  let lists: SessionLists<string> = {};
  const refresh = sessionRefresh<string>({
    read: async (project) => {
      reads.push(project);
      if (project === "app" && failApp) throw new Error("busy");
      return [project];
    },
    apply: (update) => { lists = update(lists); },
    projects: () => ["app", "otra"],
    key: (row) => row,
    schedule: (run, ms) => { timers.push({ run, ms }); return timers.length; },
    cancel: () => {},
  });
  await refresh.refresh(["app", "otra"]);
  assert.deepEqual(lists, { app: [], otra: ["otra"] });
  assert.equal(timers.length, 1);
  reads.length = 0;
  failApp = false;
  timers[0].run();
  await settle();
  assert.deepEqual(reads, ["app"], "no relee carpetas sanas");
  assert.deepEqual(lists, { app: ["app"], otra: ["otra"] });
});

