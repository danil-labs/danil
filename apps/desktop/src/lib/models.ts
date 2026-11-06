import type { AgentModels, ModelOption } from "./model";
import { esDe, type Superficie } from "./surfaces.ts";

export type CatalogosDeModelos = Record<string, AgentModels | null>;

export type OpcionDeModelo = {
  /** Distingue el mismo id cuando lo ofrecen superficies distintas. */
  key: string;
  superficie: string;
  agent: string;
  usable: boolean;
  proveedor: { id: string; label: string; logo: string };
  model: ModelOption;
};

export type GrupoDeModelos = {
  id: string;
  label: string;
  logo: string;
  models: OpcionDeModelo[];
};

/**
 * Una favorita identifica la superficie y el id literal que recibe el CLI.
 * Solo el id no basta: dos proveedores pueden publicar el mismo modelo y
 * marcar uno no debe marcar el otro.
 */
export function esFavorito(key: string, favoritos: readonly string[]) {
  return favoritos.includes(key);
}

/** Mantiene el orden del catálogo; la favorita no crea una segunda copia. */
export function favoritosDeModelos(
  models: OpcionDeModelo[],
  favoritos: readonly string[],
) {
  return models.filter((opcion) => esFavorito(opcion.key, favoritos));
}

/** El proveedor que sirve el modelo puede ser distinto de quien lo fabricó. */
export function proveedorDe(
  superficie: Superficie,
  model: ModelOption,
) {
  if (superficie.provider === "opencode-zen") {
    if (superficie.catalogo === "gratuitos") {
      return { id: "opencode-free", label: "Danil Free AI", logo: "opencode" };
    }
    if (model.id.startsWith("opencode-go/")) {
      return { id: "opencode-go", label: "OpenCode Go", logo: "opencode" };
    }
    return { id: "opencode-zen", label: "OpenCode", logo: "opencode" };
  }
  if (superficie.provider === "opencode-local") {
    return { id: "opencode-local", label: "OpenCode Local", logo: "opencode" };
  }
  return {
    id: superficie.id,
    label: superficie.label,
    logo: superficie.provider,
  };
}

/**
 * Junta los catálogos de todos los agentes en opciones que conservan quién las
 * ejecuta. El modelo solo no alcanza: dos agentes pueden publicar el mismo id.
 */
export function opcionesDeModelos(
  superficies: Superficie[],
  catalogos: CatalogosDeModelos,
): OpcionDeModelo[] {
  return superficies
    .flatMap((superficie) =>
      (catalogos[superficie.provider]?.models ?? [])
        .filter((model) => esDe(superficie, model))
        .map((model) => ({
          key: `${superficie.id}\u0000${model.id}`,
          superficie: superficie.id,
          agent: superficie.provider,
          usable: superficie.usable,
          proveedor: proveedorDe(superficie, model),
          model,
        })),
    );
}

/**
 * **Bajar de caja aquí NO sigue la lengua de la app, y esa es la decisión.**
 *
 * Lo que se normaliza son nombres de modelo —`GPT-5`, `Claude Opus`—, que son
 * identificadores de producto y no prosa. El argumento del turco, que es real,
 * apunta justo al revés de como se lee: con `"tr"`, `"I".toLocaleLowerCase()`
 * da `ı`, así que buscar `GPT-5 Instruct` **dejaría de encontrarlo** en cuanto
 * alguien pusiera la interfaz en turco — y sin error, que es lo peor.
 *
 * Clavarlo en `"es"` tiene el mismo defecto por otro camino: es el locale de una
 * lengua concreta haciendo de invariante. `toLowerCase()` sin
 * locale es la operación invariante de Unicode, que es exactamente lo que pide
 * comparar identificadores.
 */
export function normalizarBusqueda(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Busca también sin separadores: `gpt5` encuentra `GPT-5`. */
export function coincideModelo(query: string, values: string[]) {
  const buscado = normalizarBusqueda(query);
  if (!buscado) return true;
  const compacto = buscado.replaceAll(" ", "");
  return values.some((value) => {
    const normal = normalizarBusqueda(value);
    return normal.includes(buscado) || normal.replaceAll(" ", "").includes(compacto);
  });
}

/** Filtra primero y conserva después la sección de cada resultado. */
export function agruparModelos(
  models: OpcionDeModelo[],
  query: string,
): GrupoDeModelos[] {
  const grupos = new Map<string, GrupoDeModelos>();

  for (const opcion of models) {
    const { model, proveedor } = opcion;
    if (
      !coincideModelo(query, [
        model.label,
        model.id,
        proveedor.label,
        proveedor.id,
        opcion.agent,
      ])
    ) {
      continue;
    }
    const grupo = grupos.get(proveedor.id) ?? { ...proveedor, models: [] };
    grupo.models.push(opcion);
    grupos.set(proveedor.id, grupo);
  }

  return [...grupos.values()];
}

/**
 * Las filas del desplegable de esfuerzo. `""` deja decidir al agente; cuando
 * se sabe qué usa, esa fila lleva su nombre y no se repite en la lista.
 * `label: null` es el rótulo genérico de «sin elegir».
 */
export function effortOptions(efforts: readonly string[], fallback: string | null) {
  if (fallback && efforts.includes(fallback)) {
    return efforts.map((e) => ({ value: e === fallback ? "" : e, label: e }));
  }
  return [{ value: "", label: fallback }, ...efforts.map((e) => ({ value: e, label: e }))];
}

/** El valor elegido tal como lo nombra `effortOptions`. */
export function effortValue(effort: string, fallback: string | null) {
  return fallback && effort === fallback ? "" : effort;
}

/** El nivel con el que queda el turno siguiente tras elegir otro modelo: `""`
 *  deja decidir al agente. */
export function effortAlCambiarDeModelo(
  effort: string,
  nuevo: Pick<ModelOption, "efforts">,
) {
  return nuevo.efforts.includes(effort) ? effort : "";
}

/**
 * Cómo se nombra en la fila de acciones el modelo que contestó, con versión.
 * El id de Claude se nombra como en el selector (`claude-opus-5-5` → «Claude
 * Opus 5.5»; espejo de `models::claude_family`). Los demás, y un alias como
 * `opus`, toman el rótulo del catálogo del agente; sin catálogo, el id.
 */
export function nombreDeModelo(id: string, catalogo?: AgentModels | null): string {
  const limpio = id.split("[")[0];
  const claude = /^claude-([a-z]+)((?:-\d{1,2})*)(?:-\d{8})?$/.exec(limpio);
  if (claude) {
    const [, familia, version] = claude;
    const nombre = `Claude ${familia[0].toUpperCase()}${familia.slice(1)}`;
    return version ? `${nombre} ${version.slice(1).replaceAll("-", ".")}` : nombre;
  }
  return catalogo?.models.find((m) => m.id === limpio)?.label || limpio;
}
