import { createSignal } from "solid-js";
import type { Project } from "./model";

type Tipo = Pick<Project, "kind" | "cloud">;

// Qué es cada carpeta (repositorio, nube o documentos), para que su icono salga
// donde solo se tiene el id. Lo llena quien lee la lista de carpetas.
const [tipos, setTipos] = createSignal<ReadonlyMap<string, Tipo>>(new Map());

export function recordarCarpetas(projects: readonly Project[]): void {
  setTipos((previo) => {
    let cambio = false;
    const siguiente = new Map(previo);
    for (const p of projects) {
      const antes = previo.get(p.id);
      if (antes && antes.kind === p.kind && antes.cloud === (p.cloud ?? null)) continue;
      siguiente.set(p.id, { kind: p.kind, cloud: p.cloud ?? null });
      cambio = true;
    }
    return cambio ? siguiente : previo;
  });
}

export function tipoDeCarpeta(id: string): Tipo | undefined {
  return tipos().get(id);
}
