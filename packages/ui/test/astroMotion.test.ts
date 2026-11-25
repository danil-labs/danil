import assert from "node:assert/strict";
import { test } from "node:test";
import { astroBlink, astroMotion } from "../src/astroMotion.ts";

test("el cuerpo gira en nueve segundos y la corona en sentido contrario en 24", () => {
  assert.equal(astroMotion("astro-gira", 2250).transform, "rotate(90 32 32)");
  assert.equal(astroMotion("astro-corona", 6000).transform, "rotate(-90 32 32)");
  assert.equal(astroMotion("astro-gira", 9000).transform, "rotate(0 32 32)");
});

test("el anillo oscila y las orejas conservan el anclaje y el sentido opuesto", () => {
  assert.equal(astroMotion("astro-columpio", 2000).transform, "rotate(15 32 32)");
  assert.equal(astroMotion("astro-columpio", 4000).transform, "rotate(-15 32 32)");
  assert.equal(astroMotion("astro-orejas astro-orejas-inv", 500, { "transform-origin": "52px 26px" }).transform, "rotate(-8 52 26)");
});

test("reducir movimiento conserva cuerpo y ojos abiertos sin partículas", () => {
  for (const name of ["gira", "corona", "columpio", "estela", "fotones", "orejas", "cola", "bigotes"]) assert.deepEqual(astroMotion(`astro-${name}`, 0), {});
  assert.deepEqual(astroMotion("astro-particula", 0), { opacity: 0 });
  assert.equal(astroBlink(0), undefined);
});

test("el parpadeo sólo comprime los ojos en el tramo de seis segundos", () => {
  assert.equal(astroBlink(5700), undefined);
  assert.match(astroBlink(5750)!, /scale\(1 0.08\)/);
  assert.equal(astroBlink(5850), undefined);
});

test("la caída respeta el ángulo y desfase de los trazos compartidos", () => {
  assert.equal(astroMotion("astro-caida", 1000, { "--astro-ang": "58deg" }).transform, "rotate(58 32 32)");
  assert.equal(astroMotion("astro-particula", 1000).opacity, 0.75);
  assert.equal(astroMotion("astro-particula", 1000, { "animation-delay": "0.5s" }).opacity, 0.95);
});
