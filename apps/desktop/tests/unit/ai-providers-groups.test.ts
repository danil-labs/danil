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
  assert.deepEqual(visibles([sup("claude"), sup("codex"), sup("grok")], e), { ids: [], vacio: "sin-cuentas" });
});

test("P2 S2: una instancia sin contestar nunca dice «sin cuentas»", () => {
  const dos = [sup("claude"), sup("codex")];
  assert.deepEqual(visibles(dos, { claude: est({ cuentas: null }), codex: est() }), { ids: [], vacio: "cargando" });
  assert.deepEqual(visibles(dos, { codex: est() }), { ids: [], vacio: "cargando" }, "sin aviso aún = no contestó");
  assert.equal(sinCuentas({ claude: est() }, []), false, "sin proveedores no hay nada que decir");
});

test("P3 S4: el orden es el de list_surfaces, no el de conteo ni alfabético", () => {
  const surfs = [sup("grok"), sup("claude"), sup("codex")];
  assert.deepEqual(idsDeGrupos(surfs), ["grok", "claude", "codex"]);
  const e = { claude: est({ cuentas: 1 }), codex: est(), grok: est({ cuentas: 3 }) };
  const v = visibles(surfs, e);
  assert.deepEqual(v.ids, ["grok", "claude"]);
  assert.deepEqual(v.ids.map((id) => e[id as keyof typeof e].cuentas), [3, 1]);
  assert.equal(v.vacio, null);
});

test("P4 S5: una cuenta que pide reconexión ya cuenta y el grupo se ve", () => {
  assert.deepEqual(visibles([sup("claude")], { claude: est({ cuentas: 1 }) }).ids, ["claude"]);
});

test("P5 S6: list_accounts falla: el grupo se ve y no es 0 cuentas", () => {
  const e = { claude: est({ cuentas: null, falloDeLectura: true }) };
  assert.deepEqual(visibles([sup("claude")], e).ids, ["claude"]);
  assert.equal(sinCuentas(e, ["claude"]), false);
  assert.equal(visible(est({ cuentas: null })), false, "cargar no muestra el grupo");
});

test("P6 S10, S16, R6: con 0 cuentas pero algo vivo el grupo se ve", () => {
  assert.deepEqual(visibles([sup("codex")], { codex: est({ vivo: true }) }), { ids: ["codex"], vacio: null });
  assert.equal(sinCuentas({ codex: est({ vivo: true }) }, ["codex"]), false);
});

test("P7 S25: una espera cuenta como vivo (así la avisa Accounts)", () => {
  assert.deepEqual(visibles([sup("claude")], { claude: est({ vivo: true }) }).ids, ["claude"]);
});

test("S9+S10: sin superficies, con claude vivo, se ve claude; nunca «cargando» sin nada pendiente", () => {
  assert.deepEqual(visibles([], { claude: est({ vivo: true }) }), { ids: ["claude"], vacio: null });
  const todos = Object.fromEntries(SUPPORTED_AGENTS.map((id) => [id, est()]));
  assert.deepEqual(visibles([], todos), { ids: [], vacio: "sin-cuentas" });
  assert.deepEqual(visibles([], { claude: est({ vivo: true }), codex: est() }).ids, ["claude"], "los que no avisaron no cambian el orden");
});

test("P8 S11: segunda cuenta sin aislamiento: bloqueada con el motivo literal", () => {
  const bloqueoAlta: BloqueoAlta = { k: "segunda", porque: FRASE };
  const o = opcionesDeAlta([sup("antigravity")], { antigravity: est({ cuentas: 1, bloqueoAlta }) })[0];
  assert.deepEqual(o, { id: "antigravity", accion: "bloqueada", motivo: "segunda", porque: FRASE });
  assert.equal("porque" in o && o.porque, FRASE, "se copia, no se recalcula");
});

test("P9 S11: la primera cuenta sí se puede", () => {
  assert.deepEqual(opcionesDeAlta([sup("antigravity")], { antigravity: est({ cuentas: 0 }) })[0], { id: "antigravity", accion: "agregar" });
});

test("P10 S12: descarga externa: abre el grupo, sin agregar ni bloquear", () => {
  const o = opcionesDeAlta([sup("grok")], { grok: est({ bloqueoAlta: { k: "externo" } }) })[0];
  assert.deepEqual(o, { id: "grok", accion: "abrir" });
});

test("P11 S19: login en curso en claude: solo claude queda bloqueada", () => {
  const o = opcionesDeAlta([sup("claude"), sup("codex")], { claude: est({ vivo: true, bloqueoAlta: { k: "ocupado" } }), codex: est() });
  assert.deepEqual(o, [{ id: "claude", accion: "bloqueada", motivo: "ocupado" }, { id: "codex", accion: "agregar" }]);
});

test("P12 S9: sin superficies se ofrece SUPPORTED_AGENTS en su orden", () => {
  assert.deepEqual(opcionesDeAlta([], {}).map((o) => o.id), ["claude", "codex", "antigravity", "grok"]);
  assert.deepEqual(opcionesDeAlta([], {}).map((o) => o.id), [...SUPPORTED_AGENTS]);
});

test("P16: gratuitos y Free Router nunca son grupo ni opción; van al bloque Danil", () => {
  const todas = [sup("claude"), sup("opencode", { catalogo: "gratuitos" }), sup("free-router-opencode"), sup("codex")];
  assert.deepEqual(idsDeGrupos(todas), ["claude", "codex"]);
  assert.deepEqual(opcionesDeAlta(todas, {}).map((o) => o.id), ["claude", "codex"]);
  assert.deepEqual(routers(todas, "free-router-opencode"), ["free-router-opencode"]);
  assert.deepEqual(routers([sup("claude")], "free-router-opencode"), ["free-router-opencode"], "sin Free Router declarado, el de por defecto");
});

test("visibles: varias superficies de un proveedor lo cuentan una sola vez", () => {
  assert.deepEqual(visibles([sup("claude", { id: "a" }), sup("claude", { id: "b" })], { claude: est({ cuentas: 2 }) }).ids, ["claude"]);
});

test("grupos: varias superficies del mismo proveedor comparten grupo, en orden de aparición", () => {
  const g = grupos([sup("claude", { id: "a" }), sup("codex"), sup("claude", { id: "b" })]);
  assert.deepEqual(g.map((x) => x.map((s) => s.id)), [["a", "b"], ["codex"]]);
});

// ---- PROP-T1: generador con semilla, 500 secuencias de hasta 12 pasos ----
// El oráculo lleva sus propias señales por proveedor (cuántas cuentas, qué está
// vivo, si la lectura falló) y afirma las dos direcciones de I1/I2 por separado,
// sin repetir la fórmula de `visible`.
function prng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let x = s; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
}
type Paso = { op: string; id: string; n?: number } | { op: "superficies"; orden: string[] };
const PROVS = ["claude", "codex", "antigravity", "grok", "kimi"];
type Senales = { cuentas: number | undefined; falloLectura: boolean; alta: boolean; aviso: boolean; esperando: number };
const nuevas = (): Senales => ({ cuentas: undefined, falloLectura: false, alta: false, aviso: false, esperando: 0 });

/** Lo que `Accounts` avisaría dadas las señales: la traducción, no la regla. */
function avisoDe(s: Senales): EstadoDeProveedor {
  return {
    cuentas: s.cuentas ?? null,
    falloDeLectura: s.falloLectura,
    vivo: s.alta || s.aviso || s.esperando > 0,
    bloqueoAlta: s.alta ? { k: "ocupado" } : null,
  };
}

function aplicar(m: Record<string, Senales>, orden: string[], p: Paso): string[] {
  if (p.op === "superficies") return p.orden;
  const s = (m[p.id] ??= nuevas());
  switch (p.op) {
    case "listaOk": s.cuentas = p.n!; s.falloLectura = false; break;
    case "listaFalla": s.cuentas = undefined; s.falloLectura = true; break;
    case "altaEmpieza": s.alta = true; break;
    case "loginDone": s.alta = false; s.cuentas = p.n! > 0 ? p.n! : 0; if (p.n === 0) s.aviso = true; break;
    case "descartar": s.alta = false; break;
    case "cerrarAviso": s.aviso = false; break;
    case "quitar": s.cuentas = Math.max(0, (s.cuentas ?? 0) - 1); break;
    case "esperaCambia": s.esperando = p.n!; break;
  }
  return orden;
}

function revisar(m: Record<string, Senales>, orden: string[]): string | null {
  const estados = Object.fromEntries(Object.entries(m).map(([id, s]) => [id, avisoDe(s)]));
  const surfs = orden.map((id) => sup(id));
  const v = visibles(surfs, estados);
  const ids = orden.length ? orden : [...SUPPORTED_AGENTS];
  for (const id of ids) {
    const s = m[id];
    const dentro = v.ids.includes(id);
    // I1/I2: cada señal por separado obliga a verlo.
    if (s && (s.cuentas ?? 0) > 0 && !dentro) return `${id} con ${s.cuentas} cuentas no se ve`;
    if (s?.alta && !dentro) return `${id} con alta en curso no se ve`;
    if (s?.aviso && !dentro) return `${id} con aviso abierto no se ve`;
    if (s && s.esperando > 0 && !dentro) return `${id} con espera no se ve`;
    if (s && s.cuentas === undefined && s.falloLectura && !dentro) return `${id} con fallo de lectura no se ve`;
    // Sin ninguna señal, no se ve.
    if (dentro && (!s || ((s.cuentas ?? 0) === 0 && !s.alta && !s.aviso && s.esperando === 0 && !(s.cuentas === undefined && s.falloLectura)))) return `${id} sin señal aparece`;
  }
  if (new Set(v.ids).size !== v.ids.length) return "duplicados";
  const orden2 = ids.filter((i) => v.ids.includes(i));
  if (v.ids.some((x, i) => x !== orden2[i]) || v.ids.length !== orden2.length) return `orden roto ${v.ids} vs ${ids}`;
  // I5
  if (v.ids.length === 0) {
    if (v.vacio !== "cargando" && v.vacio !== "sin-cuentas") return "vacío sin razón";
    if (v.vacio === "sin-cuentas" && ids.some((i) => m[i]?.cuentas === undefined)) return "sin-cuentas con un proveedor sin contestar";
  } else if (v.vacio !== null) return "vacío con visibles";
  return null;
}

function fallaCon(pasos: Paso[]): string | null {
  const m: Record<string, Senales> = {};
  let orden = [...PROVS];
  for (const p of pasos) {
    orden = aplicar(m, orden, p);
    const r = revisar(m, orden);
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
    const mal = fallaCon(pasos);
    if (mal) {
      for (let i = 0; i < pasos.length; ) { // recorte: quitar pasos mientras siga fallando
        const menos = pasos.filter((_, k) => k !== i);
        if (fallaCon(menos)) pasos = menos; else i++;
      }
      assert.fail(`semilla ${seed}: ${mal}\n${JSON.stringify(pasos)}`);
    }
  }
});
