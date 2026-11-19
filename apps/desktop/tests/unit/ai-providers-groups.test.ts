import assert from "node:assert/strict";
import { test } from "node:test";
import {
  grupos,
  idsDeGrupos,
  opcionesDeAlta,
  routers,
  sinCuentas,
  visible,
  visibles,
  type BloqueoAlta,
  type EstadoDeProveedor,
  type EstadosPorProveedor,
} from "../../src/features/settings/ai-providers-groups.ts";
import { SUPPORTED_AGENTS } from "../../src/features/settings/ai-providers-view.ts";
import type { Superficie } from "../../src/lib/surfaces.ts";

const sup = (provider: string, extra: Partial<Superficie> = {}): Superficie => ({
  id: provider, provider, label: provider, catalogo: "todo", usable: true, marca: null, porque: null, ...extra,
});
const est = (o: Partial<EstadoDeProveedor> = {}): EstadoDeProveedor => ({ cuentas: 0, vivo: false, bloqueoAlta: null, falloDeLectura: false, ...o });
const FRASE = { clave: "settings.accounts.shared_remove_first" };

test("P1 S1: todos contestan 0 y nada vive: ningún grupo y «sin cuentas»", () => {
  const e = { claude: est(), codex: est(), grok: est() };
  assert.deepEqual(visibles(["claude", "codex", "grok"], e), { ids: [], vacio: "sin-cuentas" });
});

test("P2 S2: una instancia sin contestar nunca dice «sin cuentas»", () => {
  assert.deepEqual(visibles(["claude", "codex"], { claude: est({ cuentas: null }), codex: est() }), { ids: [], vacio: "cargando" });
  assert.deepEqual(visibles(["claude", "codex"], { codex: est() }), { ids: [], vacio: "cargando" }, "sin aviso aún = no contestó");
  assert.equal(sinCuentas({ claude: est() }, []), false, "sin proveedores no hay nada que decir");
});

test("P3 S4: el orden es el de list_surfaces, no el de conteo ni alfabético", () => {
  const ids = idsDeGrupos([sup("grok"), sup("claude"), sup("codex")]);
  const e = { claude: est({ cuentas: 1 }), codex: est(), grok: est({ cuentas: 3 }) };
  const v = visibles(ids, e);
  assert.deepEqual(v.ids, ["grok", "claude"]);
  assert.deepEqual(v.ids.map((id) => e[id as keyof typeof e].cuentas), [3, 1]);
  assert.equal(v.vacio, null);
});

test("P4 S5: una cuenta que pide reconexión ya cuenta y el grupo se ve", () => {
  assert.deepEqual(visibles(["claude"], { claude: est({ cuentas: 1 }) }).ids, ["claude"]);
});

test("P5 S6: list_accounts falla: el grupo se ve y no es 0 cuentas", () => {
  const e = { claude: est({ cuentas: null, falloDeLectura: true }) };
  assert.deepEqual(visibles(["claude"], e).ids, ["claude"]);
  assert.equal(sinCuentas(e, ["claude"]), false);
  assert.equal(visible(est({ cuentas: null }), ), false, "cargar no muestra el grupo");
});

test("P6 S10, S16, R6: con 0 cuentas pero algo vivo el grupo se ve", () => {
  assert.deepEqual(visibles(["codex"], { codex: est({ vivo: true }) }), { ids: ["codex"], vacio: null });
  assert.equal(sinCuentas({ codex: est({ vivo: true }) }, ["codex"]), false);
});

test("P7 S25: una espera cuenta como vivo (así la avisa Accounts)", () => {
  assert.deepEqual(visibles(["claude"], { claude: est({ vivo: true }) }).ids, ["claude"]);
});

test("P8 S11: segunda cuenta sin aislamiento: deshabilitada con el motivo literal", () => {
  const bloqueoAlta: BloqueoAlta = { k: "segunda", porque: FRASE };
  const o = opcionesDeAlta([sup("antigravity")], { antigravity: est({ cuentas: 1, bloqueoAlta }) })[0];
  assert.deepEqual(o, { id: "antigravity", habilitada: false, motivo: "segunda", porque: FRASE, accion: "agregar" });
  assert.equal(o.porque, FRASE, "se copia, no se recalcula");
});

test("P9 S11: la primera cuenta sí se puede", () => {
  const o = opcionesDeAlta([sup("antigravity")], { antigravity: est({ cuentas: 0 }) })[0];
  assert.equal(o.habilitada, true);
  assert.equal(o.motivo, null);
});

test("P10 S12: descarga externa: habilitada y abre el grupo, sin agregar", () => {
  const o = opcionesDeAlta([sup("grok")], { grok: est({ bloqueoAlta: { k: "externo" } }) })[0];
  assert.deepEqual(o, { id: "grok", habilitada: true, motivo: "externo", porque: null, accion: "abrir" });
});

test("P11 S19: login en curso en claude: solo claude queda deshabilitada", () => {
  const o = opcionesDeAlta([sup("claude"), sup("codex")], { claude: est({ vivo: true, bloqueoAlta: { k: "ocupado" } }), codex: est() });
  assert.deepEqual(o.map((x) => [x.id, x.habilitada, x.motivo]), [["claude", false, "ocupado"], ["codex", true, null]]);
});

test("P12 S9: sin superficies se ofrece SUPPORTED_AGENTS en su orden", () => {
  assert.deepEqual(opcionesDeAlta([], {}).map((o) => o.id), ["claude", "codex", "antigravity", "grok"]);
  assert.deepEqual(opcionesDeAlta([], {}).map((o) => o.id), [...SUPPORTED_AGENTS]);
});

test("P13 Q4 (provisional): un sin_cuenta no instalado se ofrece para instalar; instalado, no", () => {
  const ag = { raro: { sin_cuenta: true, instalado: false } };
  assert.equal(opcionesDeAlta([sup("raro")], {}, ag)[0].accion, "instalar");
  assert.equal(opcionesDeAlta([sup("raro")], {}, { raro: { sin_cuenta: true, instalado: true } })[0].accion, "agregar");
});

test("P16: gratuitos y Free Router nunca son grupo ni opción; van al bloque Danil", () => {
  const todas = [sup("claude"), sup("opencode", { catalogo: "gratuitos" }), sup("free-router-opencode"), sup("codex")];
  assert.deepEqual(idsDeGrupos(todas), ["claude", "codex"]);
  assert.deepEqual(opcionesDeAlta(todas, {}).map((o) => o.id), ["claude", "codex"]);
  assert.deepEqual(routers(todas, "free-router-opencode"), ["free-router-opencode"]);
  assert.deepEqual(routers([sup("claude")], "free-router-opencode"), ["free-router-opencode"], "sin Free Router declarado, el de por defecto");
});

test("visibles: un id repetido sale una sola vez", () => {
  assert.deepEqual(visibles(["claude", "claude"], { claude: est({ cuentas: 2 }) }).ids, ["claude"]);
});

test("grupos: varias superficies del mismo proveedor comparten grupo, en orden de aparición", () => {
  const g = grupos([sup("claude", { id: "a" }), sup("codex"), sup("claude", { id: "b" })]);
  assert.deepEqual(g.map((x) => x.map((s) => s.id)), [["a", "b"], ["codex"]]);
});

// ---- PROP-T1: generador con semilla, 500 secuencias de hasta 12 pasos ----
function prng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let x = s; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
}
type Paso = { op: string; id: string; n?: number } | { op: "superficies"; orden: string[] };
const PROVS = ["claude", "codex", "antigravity", "grok", "kimi"];

function aplicar(estados: Record<string, EstadoDeProveedor>, ids: string[], p: Paso): string[] {
  if (p.op === "superficies") return p.orden;
  const e = estados[p.id] ?? est({ cuentas: null });
  switch (p.op) {
    case "listaOk": estados[p.id] = { ...e, cuentas: p.n!, falloDeLectura: false }; break;
    case "listaFalla": estados[p.id] = { ...e, cuentas: null, falloDeLectura: true }; break;
    case "altaEmpieza": estados[p.id] = { ...e, vivo: true, bloqueoAlta: { k: "ocupado" } }; break;
    case "loginDone": estados[p.id] = { ...e, cuentas: p.n!, vivo: false, bloqueoAlta: null }; break;
    case "descartar": estados[p.id] = { ...e, vivo: false, bloqueoAlta: null }; break;
    case "cerrarAviso": estados[p.id] = { ...e, vivo: false }; break;
    case "quitar": estados[p.id] = { ...e, cuentas: Math.max(0, (e.cuentas ?? 0) - 1) }; break;
    case "esperaCambia": estados[p.id] = { ...e, vivo: p.n! > 0 }; break;
  }
  return ids;
}

function revisar(estados: Record<string, EstadoDeProveedor>, ids: string[]): string | null {
  const v = visibles(ids, estados);
  for (const id of ids) {
    const e = estados[id];
    const debe = !!e && ((e.cuentas ?? 0) > 0 || e.vivo || (e.cuentas === null && e.falloDeLectura));
    if (debe !== v.ids.includes(id)) return `${id}: debe=${debe} pero visibles=${v.ids}`;
    if (e && e.cuentas === 0 && !e.vivo && v.ids.includes(id)) return `${id} con 0 y nada vivo aparece`;
  }
  if (new Set(v.ids).size !== v.ids.length) return "duplicados";
  if (JSON.stringify(v.ids) !== JSON.stringify(ids.filter((i) => v.ids.includes(i)))) return `orden roto ${v.ids} vs ${ids}`;
  if (v.ids.length === 0) {
    if (v.vacio !== "cargando" && v.vacio !== "sin-cuentas") return "vacío sin razón";
    if (v.vacio === "sin-cuentas" && ids.some((i) => estados[i]?.cuentas == null)) return "sin-cuentas con un null";
  } else if (v.vacio !== null) return "vacío con visibles";
  return null;
}

function fallaCon(seed: number, pasos: Paso[]): string | null {
  const estados: Record<string, EstadoDeProveedor> = {};
  let ids = [...PROVS];
  for (const p of pasos) {
    ids = aplicar(estados, ids, p);
    const r = revisar(estados, ids);
    if (r) return r;
  }
  return null;
}

test("PROP-T1: sobre 500 secuencias aleatorias visibles cumple I1, I2, I5, sin duplicados y en orden", () => {
  const OPS = ["listaOk", "listaFalla", "altaEmpieza", "loginDone", "descartar", "cerrarAviso", "quitar", "esperaCambia", "superficies"];
  for (let seed = 1; seed <= 500; seed++) {
    const r = prng(seed);
    const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
    let pasos: Paso[] = Array.from({ length: 1 + Math.floor(r() * 12) }, () => {
      const op = pick(OPS);
      if (op === "superficies") {
        const orden = PROVS.filter(() => r() > 0.25);
        for (let i = orden.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [orden[i], orden[j]] = [orden[j], orden[i]]; }
        return { op, orden } as Paso;
      }
      return { op, id: pick(PROVS), n: Math.floor(r() * 4) } as Paso;
    });
    const mal = fallaCon(seed, pasos);
    if (mal) {
      for (let i = 0; i < pasos.length; ) { // recorte: quitar pasos mientras siga fallando
        const menos = pasos.filter((_, k) => k !== i);
        if (fallaCon(seed, menos)) pasos = menos; else i++;
      }
      assert.fail(`semilla ${seed}: ${mal}\n${JSON.stringify(pasos)}`);
    }
  }
});
