/** Sólo la ruta Beam aprobada tiene atribución comprobada; no se deduce del gateway. */
export function modelPresentation(id: string, label?: string | null): { label: string; creator: string | null } {
  if (id === "danil-free/reflection/beam-free" || id === "reflection/beam-free") {
    return { label: "Beam", creator: "Reflection" };
  }
  return { label: label || id, creator: null };
}

/** Oferta informativa; nunca se agrega al catálogo seleccionable de la máquina. */
export function routerDiscovery(modelIds: readonly string[], query = "") {
  if (modelIds.includes("danil-free/reflection/beam-free")) return null;
  const offer = modelPresentation("danil-free/reflection/beam-free");
  const terms = "Beam Reflection Router IA gratis Free AI Router".toLocaleLowerCase();
  if (!query.trim().toLocaleLowerCase().split(/\s+/).every((word) => terms.includes(word))) return null;
  return offer;
}

/** La aceptación no sustituye al catálogo vivo de la ruta exacta aprobada. */
export function routerAvailable(models: readonly { id: string; gratis?: boolean | null }[]): boolean {
  return models.some((model) => model.id === "danil-free/reflection/beam-free" && model.gratis === true);
}

export type RouterOfferState = "loading" | "update_engine" | "activate" | "unavailable" | "ready";

/** Qué dice la fila del Router en el selector: sin política es motor viejo; sin sí, se ofrece activar. */
export function routerOfferState(policy: { enabled: boolean; accepted: boolean } | null | undefined, routeAvailable: boolean | null): RouterOfferState {
  if (policy === undefined) return "loading";
  if (policy === null) return "update_engine";
  if (!policy.enabled) return "unavailable";
  if (!policy.accepted) return "activate";
  if (routeAvailable === null) return "loading";
  return routeAvailable ? "ready" : "unavailable";
}
