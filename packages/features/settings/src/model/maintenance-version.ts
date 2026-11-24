import type { MachineResources, Startup } from "../../../../engine-client/src/index.ts";
import type { Machine } from "../../../../ui/src/lib/machine";

export type EngineVersionInfo = {
  version: string;
  build: string | null;
};

export type StartupWithResources = Startup & {
  machine_resources_by_machine?: Record<string, MachineResources>;
};

/**
 * Elige la máquina cuya versión del motor representa esta instalación:
 * primero la local (Desk), luego la activa en línea, y por último cualquier otra conocida.
 */
export function pickTargetMachine(list: readonly Machine[]): Machine | undefined {
  return (
    list.find((m) => m.local)
    ?? list.find((m) => m.active && m.on)
    ?? list.find((m) => m.active)
    ?? list.find((m) => m.on)
    ?? list[0]
  );
}

/**
 * Extrae `machine_resources` de la respuesta de `list_workspaces`, tanto en
 * respuesta directa del motor como en la respuesta mezclada de la flota.
 */
export function resourcesFromStartup(
  startup: Partial<StartupWithResources> | null | undefined,
  machineId?: string,
): MachineResources | undefined {
  if (!startup) return undefined;
  if (startup.machine_resources) return startup.machine_resources;
  const byMachine = startup.machine_resources_by_machine;
  if (!byMachine) return undefined;
  if (machineId && byMachine[machineId]) return byMachine[machineId];
  return Object.values(byMachine).find((r) => !!r?.engine?.version) ?? Object.values(byMachine)[0];
}

/**
 * Parsea la versión y el commit corto (7 caracteres) del motor a partir de las
 * fuentes reales de la app: `machine_resources.engine`, `machine.version`
 * (`host_version`, p. ej. `0.3.5-45867e9`) o `engineBuild` (`0.3.5 45867e9`).
 */
export function parseEngineVersion(
  resources: MachineResources | undefined,
  hostVersion?: string | null,
  engineBuild?: string | null,
): EngineVersionInfo | null {
  const engine = resources?.engine;
  if (engine?.version) {
    const version = engine.version.trim().replace(/^v/i, "");
    const build = engine.build?.trim() ? engine.build.trim().slice(0, 7) : null;
    if (version) return { version, build };
  }
  const raw = hostVersion?.trim() || engineBuild?.trim();
  if (!raw) return null;
  const clean = raw.replace(/^v/i, "");
  const match = clean.match(/^(\d+(?:\.\d+)*(?:-[0-9A-Za-z.]+)?)(?:[\s+]+|-)([0-9a-f]{7,})$/i);
  if (match) {
    return { version: match[1], build: match[2].slice(0, 7) };
  }
  const semver = clean.match(/^(\d+(?:\.\d+)*(?:-[0-9A-Za-z.]+)?)$/);
  if (semver) return { version: semver[1], build: null };
  return { version: clean, build: null };
}

export function normalizeVersion(version: string): string {
  return version.trim().replace(/^v/i, "");
}

export function formatEngineVersion(info: EngineVersionInfo): string {
  const version = `v${normalizeVersion(info.version)}`;
  return info.build ? `${version} · ${info.build}` : version;
}
