import assert from "node:assert/strict";
import test from "node:test";

import { crearLector, esTransitorio } from "../../../../packages/features/code/src/model/treeLoader.ts";

/**
 * El panel «Carpeta» no se queda con un error viejo: una lectura a la vez,
 * reintentos solos tras un fallo del transporte y lo último bueno sin tocar.
 */

type Pendiente = { resolve: (v: string) => void; reject: (e: unknown) => void };

function banco() {
  const lecturas: Pendiente[] = [];
  const aplicadas: string[] = [];
  const fallos: unknown[] = [];
  const timers: { fn: () => void; ms: number; vivo: boolean }[] = [];
  let reloj = 0;
  const lector = crearLector<string>({
    leer: () => new Promise<string>((resolve, reject) => lecturas.push({ resolve, reject })),
    aplicar: (v) => aplicadas.push(v),
    fallar: (e) => fallos.push(e),
    ahora: () => reloj,
    programar: (fn, ms) => {
      const t = { fn, ms, vivo: true };
      timers.push(t);
      return () => { t.vivo = false; };
    },
    esperas: [10, 20],
    lentaTras: 1_000,
  });
  const disparar = () => {
    const vivos = timers.filter((t) => t.vivo);
    for (const t of vivos) { t.vivo = false; t.fn(); }
    return vivos.map((t) => t.ms);
  };
  return { lector, lecturas, aplicadas, fallos, disparar, avanzar: (ms: number) => { reloj += ms; } };
}

const tick = () => new Promise((r) => setTimeout(r, 0));
const io = { what: { clave: "shell.service.unreachable" }, detail: "io" };

test("lo que se pide con una lectura en vuelo se junta en una sola al terminar", async () => {
  const b = banco();
  b.lector.pedir();
  b.lector.pedir();
  b.lector.pedir();
  assert.equal(b.lecturas.length, 1);
  b.lecturas[0].resolve("a");
  await tick();
  assert.deepEqual(b.aplicadas, ["a"]);
  assert.equal(b.lecturas.length, 2, "una más, no tres");
  b.lecturas[1].resolve("b");
  await tick();
  assert.equal(b.lecturas.length, 2);
  assert.deepEqual(b.aplicadas, ["a", "b"]);
});

test("una lectura lenta no bloquea la siguiente, y su respuesta tardía no pisa la nueva", async () => {
  const b = banco();
  b.lector.pedir();
  b.avanzar(1_500);
  b.lector.pedir();
  assert.equal(b.lecturas.length, 2);
  b.lecturas[1].resolve("nueva");
  await tick();
  b.lecturas[0].resolve("vieja");
  await tick();
  assert.deepEqual(b.aplicadas, ["nueva"]);
});

test("el fallo de una lectura vieja no cuenta si ya salió otra", async () => {
  const b = banco();
  b.lector.pedir();
  b.avanzar(1_500);
  b.lector.pedir();
  b.lecturas[0].reject(io);
  await tick();
  assert.deepEqual(b.fallos, []);
  assert.equal(b.lector.pendiente(), false);
  b.lecturas[1].resolve("ok");
  await tick();
  assert.deepEqual(b.aplicadas, ["ok"]);
});

test("un io se reintenta solo con espera creciente y solo al agotarse se enseña", async () => {
  const b = banco();
  b.lector.pedir();
  b.lecturas[0].reject(io);
  await tick();
  assert.deepEqual(b.fallos, [], "el primer io no se enseña");
  assert.equal(b.lector.pendiente(), true);
  assert.deepEqual(b.disparar(), [10]);
  b.lecturas[1].reject(io);
  await tick();
  assert.deepEqual(b.disparar(), [20]);
  b.lecturas[2].reject(io);
  await tick();
  assert.equal(b.fallos.length, 1);
  assert.deepEqual(b.disparar(), [], "agotado, ya no se programa más");
  assert.equal(b.lector.pendiente(), true, "volver a la ventana lo vuelve a pedir");
});

test("un reintento que contesta bien borra el fallo y vuelve a contar de cero", async () => {
  const b = banco();
  b.lector.pedir();
  b.lecturas[0].reject(io);
  await tick();
  b.disparar();
  b.lecturas[1].resolve("ok");
  await tick();
  assert.deepEqual(b.aplicadas, ["ok"]);
  assert.equal(b.lector.pendiente(), false);
  b.lector.pedir();
  b.lecturas[2].reject(io);
  await tick();
  assert.deepEqual(b.disparar(), [10]);
});

test("pedir durante la espera de un reintento lee ya, sin esperar", async () => {
  const b = banco();
  b.lector.pedir();
  b.lecturas[0].reject(io);
  await tick();
  b.lector.pedir();
  assert.equal(b.lecturas.length, 2);
  assert.deepEqual(b.disparar(), [], "el reintento programado se quitó");
});

test("un fallo del comando se enseña a la primera, y Reintentar vuelve a leer", async () => {
  const b = banco();
  const borrada = { what: { clave: "code.tree.missing" }, detail: "missing" };
  b.lector.pedir();
  b.lecturas[0].reject(borrada);
  await tick();
  assert.deepEqual(b.fallos, [borrada]);
  b.lector.reintentar();
  assert.equal(b.lecturas.length, 2);
});

test("soltado, nada se aplica ni se programa", async () => {
  const b = banco();
  b.lector.pedir();
  b.lector.soltar();
  b.lecturas[0].resolve("tarde");
  await tick();
  assert.deepEqual(b.aplicadas, []);
});

test("qué cuenta como transitorio", () => {
  assert.equal(esTransitorio(io), true);
  assert.equal(esTransitorio({ what: "x", detail: "service_busy" }), true);
  assert.equal(esTransitorio({ what: { clave: "shell.service.busy" }, detail: "" }), true);
  assert.equal(esTransitorio({ what: { clave: "code.tree.missing" }, detail: "x" }), false);
  assert.equal(esTransitorio("io"), false);
});
