/**
 * El modelo de vista de los grupos de Configuración › Proveedores de IA, sin DOM
 * ni motor: qué grupos se ven, cuándo la pantalla dice «sin cuentas» y qué se
 * ofrece en el selector de «Agregar cuenta». Cada `Accounts` avisa su
 * `EstadoDeProveedor`; aquí solo se decide con eso (`docs/engineering/
 * 2026-11-19-proveedores-ia.md` § 2 y § 3).
 */
// Con extensión: este módulo se carga también desde `node --test`.
import { isFreeRouterAgent } from "../../../../ui/src/lib/tasks/agents.ts";
import type { Prosa } from "../../../../../apps/desktop/src/lib/prose.ts";
import type { Superficie } from "../../../../ui/src/lib/surfaces.ts";
import { SUPPORTED_AGENTS } from "./ai-providers-view.ts";

/** Por qué un proveedor no deja agregar ahora (`bloqueoAlta()` de `Accounts`, § 3). */
export type BloqueoAlta =
  | null
  | { k: "ocupado" }
  | { k: "segunda"; porque: Prosa }
  | { k: "externo" };

/** Lo que cada `Accounts` avisa de su proveedor. */
export type EstadoDeProveedor = {
  /** `null`: todavía no contesta, o `list_accounts` falló. No es 0. */
  cuentas: number | null;
  /** Algo que la persona tiene que ver aunque no haya cuentas (alta, login, fallo, espera…). */
  vivo: boolean;
  bloqueoAlta: BloqueoAlta;
  /** `list_accounts` falló: con `cuentas === null` el grupo se ve con su fallo. */
  falloDeLectura: boolean;
};

export type EstadosPorProveedor = Readonly<Record<string, EstadoDeProveedor | undefined>>;

/** Las superficies del mismo proveedor comparten grupo; gratuitos y Free Router quedan fuera. Orden de `list_surfaces`. */
export function grupos(superficies: readonly Superficie[]): Superficie[][] {
  const vistos = new Map<string, Superficie[]>();
  for (const s of superficies.filter((x) => x.catalogo !== "gratuitos" && !isFreeRouterAgent(x.provider))) {
    const grupo = vistos.get(s.provider);
    if (grupo) grupo.push(s);
    else vistos.set(s.provider, [s]);
  }
  return [...vistos.values()];
}

/** Una sección del Free Router por motor; sin superficies todavía, la de OpenCode. */
export function routers(superficies: readonly Superficie[], porDefecto: string): string[] {
  const ids = [...new Set(superficies.map((s) => s.provider).filter(isFreeRouterAgent))];
  return ids.length ? ids : [porDefecto];
}

/** Ids de proveedor de los grupos, en orden: la identidad con que se une cada `Accounts`. */
export const idsDeGrupos = (superficies: readonly Superficie[]): string[] => grupos(superficies).map((g) => g[0].provider);

export function visible(e: EstadoDeProveedor): boolean {
  return (e.cuentas !== null && e.cuentas > 0) || e.vivo || (e.cuentas === null && e.falloDeLectura);
}

/** Verdadero solo si **todos** contestaron 0 y nada está vivo. Sin proveedores, falso. */
export function sinCuentas(estados: EstadosPorProveedor, ids: readonly string[]): boolean {
  if (ids.length === 0) return false;
  return ids.every((id) => {
    const e = estados[id];
    return !!e && e.cuentas === 0 && !e.vivo;
  });
}

/** Los ids de proveedor de la pantalla: los de `list_surfaces` y, sin grupos de proveedor (ni superficies, o solo gratuitas y Free Router), `SUPPORTED_AGENTS`. Una sola lista para `visibles` y `opcionesDeAlta`. */
export function idsDeProveedor(superficies: readonly Superficie[]): string[] {
  const ids = idsDeGrupos(superficies);
  return ids.length ? ids : [...SUPPORTED_AGENTS];
}

/** Los grupos a la vista, en el orden de `list_surfaces`, y por qué no hay ninguno. */
export function visibles(superficies: readonly Superficie[], estados: EstadosPorProveedor): { ids: string[]; vacio: null | "cargando" | "sin-cuentas" } {
  const ids = idsDeProveedor(superficies);
  const vistos = ids.filter((id) => {
    const e = estados[id];
    return !!e && visible(e);
  });
  if (vistos.length) return { ids: vistos, vacio: null };
  return { ids: vistos, vacio: sinCuentas(estados, ids) ? "sin-cuentas" : "cargando" };
}

/**
 * Una opción del selector. `bloqueada` lleva su motivo; `segunda` lleva el texto
 * literal de `shared_credential`. No hay combinaciones ilegales.
 */
export type OpcionDeAlta =
  | { id: string; accion: "agregar" }
  | { id: string; accion: "abrir" } // descarga externa: despliega el grupo, no llama `add_account`
  | { id: string; accion: "bloqueada"; motivo: "ocupado" }
  | { id: string; accion: "bloqueada"; motivo: "segunda"; porque: Prosa };

/** Lo que ofrece el selector. Copia `bloqueoAlta` de cada proveedor sin recalcularlo. */
export function opcionesDeAlta(superficies: readonly Superficie[], estados: EstadosPorProveedor): OpcionDeAlta[] {
  return idsDeProveedor(superficies).map((id): OpcionDeAlta => {
    const b = estados[id]?.bloqueoAlta ?? null;
    if (!b) return { id, accion: "agregar" };
    if (b.k === "externo") return { id, accion: "abrir" };
    if (b.k === "segunda") return { id, accion: "bloqueada", motivo: "segunda", porque: b.porque };
    return { id, accion: "bloqueada", motivo: "ocupado" };
  });
}
