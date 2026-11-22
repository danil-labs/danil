/**
 * Tipos y funciones puras de lo que trae la app preparado (bundled).
 * Compartido entre onboarding, settings y el visor de dependencias.
 */

const INCLUIDAS = ["git", "python", "agent-browser", "ripgrep", "uv", "computer-use"] as const;

export type Motivo = "missing" | "version_mismatch" | "import_failed" | "timed_out" | "damaged";

const MOTIVOS = new Set<string>(["missing", "version_mismatch", "import_failed", "timed_out", "damaged"]);

export type Falla = { id: string | null; reason: Motivo };

export const esIncluida = (id: string) => (INCLUIDAS as readonly string[]).includes(id);

export type Requirement = {
  id: string;
  label: string;
  ok: boolean;
  required: boolean;
  detail: string;
  remedy: string | null;
  source: string | null;
  bytes: number | null;
  installable: boolean;
  redundant: boolean;
  manager: "agent" | "github" | "tool" | null;
  timed_out?: boolean;
  reason?: string | null;
};

export const ORIGEN_SISTEMA = "del sistema";
export const ORIGEN_APP = "instalado por la app";
export const ORIGEN_BUNDLE = "empaquetado con la app";

export type Dependency = {
  id: string;
  label: string;
  version: string;
  location: string;
  bytes: number | null;
};

export type EnvReport = {
  items: Requirement[];
  ready: boolean;
  blocked: boolean;
  reason: string | null;
  build: string;
  engineBuild?: string;
  bootstrap: string[];
  firstRun: boolean;
  essential: string[];
  runtimeVersions: Record<string, string>;
};


const motivoDe = (valor: unknown, timedOut?: boolean): Motivo | null => {
  if (typeof valor === "string" && MOTIVOS.has(valor)) return valor as Motivo;
  return timedOut ? "timed_out" : null;
};

export function fallasIncluidas(
  reporte: { items?: { id: string; reason?: string | null; timed_out?: boolean; ok: boolean; required: boolean }[] } | null,
  fallidas: string[] = [],
): Falla[] {
  const fallas = new Map<string | null, Falla>();
  for (const r of reporte?.items ?? []) {
    if (!esIncluida(r.id)) continue;
    const reason = motivoDe(r.reason, r.timed_out) ?? (!r.ok && r.required ? "missing" : null);
    if (reason) fallas.set(r.id, { id: r.id, reason });
  }
  for (const stage of fallidas) {
    if (esIncluida(stage) && !fallas.has(stage)) fallas.set(stage, { id: stage, reason: "missing" });
  }
  if (!fallas.size && fallidas.some((s) => s !== "platform")) fallas.set(null, { id: null, reason: "missing" });
  return [...fallas.values()];
}
