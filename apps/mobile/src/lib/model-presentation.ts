import { canonicalAgentId, danilCreditsTierLabel, danilServiceOf, isDanilCreditsModel, isDanilCreditsSurface, isFreeRouterAgent, isRetiredAgent, modelName, OPENCODE } from "@terminus/tasks";

type ModelCatalog = Parameters<typeof modelName>[1];

type SurfaceIdentity = { id?: string; provider: string; catalogo: string; label: string };

/** Presentación móvil; los ids de proveedor, superficie y modelo no cambian. */
export function surfacePresentation(surface: SurfaceIdentity, labels: { free: string; credits?: string }) {
  const provider = canonicalAgentId(surface.provider);
  if (isDanilCreditsSurface(surface.id)) return { label: labels.credits ?? surface.label, mark: "danil" };
  if (surface.catalogo === "gratuitos" || isFreeRouterAgent(provider)) return { label: labels.free, mark: "danil" };
  if (provider === OPENCODE) return { label: "OpenCode", mark: OPENCODE };
  return { label: surface.label, mark: surface.provider };
}

export function selectedModelMark(provider: string | null | undefined, model?: string | null, surface?: SurfaceIdentity) {
  if (isDanilCreditsModel(model) || model?.startsWith("danil-free/") || (!model && surface?.catalogo === "gratuitos") || isFreeRouterAgent(provider)) return "danil";
  return isRetiredAgent(provider) ? null : canonicalAgentId(provider, model);
}

/** Un servicio de Danil se nombra por el servicio, nunca por su modelo; los demás, por su modelo. */
export function modelLabel(id: string, labels: { credits: string; router: string }, catalog?: ModelCatalog): string {
  const baseId = id.split("[")[0];
  const service = danilServiceOf(baseId);
  if (service === "credits") {
    const tier = catalog?.models.find((m) => m.id === baseId)?.label ?? danilCreditsTierLabel(baseId);
    return tier ? `${labels.credits} · ${tier}` : labels.credits;
  }
  if (service) return labels[service];
  return modelName(id, catalog);
}
