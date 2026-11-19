/**
 * El modelo de vista de los grupos de Configuración › Proveedores de IA, sin DOM
 * ni motor: qué grupos se ven, cuándo la pantalla dice «sin cuentas» y qué se
 * ofrece en el selector de «Agregar cuenta». Cada `Accounts` avisa su
 * `EstadoDeProveedor`; aquí solo se decide con eso (`docs/engineering/
 * 2026-11-19-proveedores-ia.md` § 2 y § 3).
 */
// Con extensión: este módulo se carga también desde `node --test`.
import { isFreeRouterAgent } from "../../../../../packages/tasks/src/agents.ts";
import type { Frase } from "../../lib/prose.ts";
import type { Superficie } from "../../lib/surfaces.ts";
import { SUPPORTED_AGENTS } from "./ai-providers-view.ts";

/** Por qué un proveedor no deja agregar ahora (`bloqueoAlta()` de `Accounts`, § 3). */
export type BloqueoAlta =
  | null
  | { k: "ocupado" }
  | { k: "segunda"; porque: Frase }
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

/** Los grupos a la vista, en el orden dado, y por qué no hay ninguno. */
export function visibles(ids: readonly string[], estados: EstadosPorProveedor): { ids: string[]; vacio: null | "cargando" | "sin-cuentas" } {
  const unicos = [...new Set(ids)];
  const vistos = unicos.filter((id) => {
    const e = estados[id];
    return !!e && visible(e);
  });
  if (vistos.length) return { ids: vistos, vacio: null };
  return { ids: vistos, vacio: sinCuentas(estados, unicos) ? "sin-cuentas" : "cargando" };
}

/** Lo que la máquina dice de un agente que no se conecta con cuenta (`sin_cuenta`). */
export type AgenteInstalable = { sin_cuenta?: boolean; instalado?: boolean };

export type OpcionDeAlta = {
  id: string;
  habilitada: boolean;
  /** Por qué no se puede, o por qué se abre el grupo: el `k` de `bloqueoAlta`. */
  motivo: null | "ocupado" | "segunda" | "externo";
  /** El texto de `segunda` (`shared_credential`), literal, para pintarlo visible. */
  porque: Frase | null;
  /** `agregar`: llama `add_account`. `abrir`: despliega el grupo. `instalar`: Q4, provisional. */
  accion: "agregar" | "abrir" | "instalar";
};

/**
 * Lo que ofrece el selector: los proveedores no gratuitos de `list_surfaces` y,
 * sin superficies, `SUPPORTED_AGENTS`. Copia `bloqueoAlta` de cada uno sin recalcularlo.
 */
export function opcionesDeAlta(
  superficies: readonly Superficie[],
  estados: EstadosPorProveedor,
  agentes: Readonly<Record<string, AgenteInstalable | undefined>> = {},
): OpcionDeAlta[] {
  const ids = superficies.length ? idsDeGrupos(superficies) : [...SUPPORTED_AGENTS];
  return ids.map((id): OpcionDeAlta => {
    const a = agentes[id];
    if (a?.sin_cuenta && !a.instalado) return { id, habilitada: true, motivo: null, porque: null, accion: "instalar" };
    const b = estados[id]?.bloqueoAlta ?? null;
    if (!b) return { id, habilitada: true, motivo: null, porque: null, accion: "agregar" };
    if (b.k === "externo") return { id, habilitada: true, motivo: "externo", porque: null, accion: "abrir" };
    return { id, habilitada: false, motivo: b.k, porque: b.k === "segunda" ? b.porque : null, accion: "agregar" };
  });
}
