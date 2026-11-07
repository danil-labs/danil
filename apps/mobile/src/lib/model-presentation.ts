type SurfaceIdentity = { provider: string; catalogo: string; label: string };

/** Presentación móvil; los ids de proveedor, superficie y modelo no cambian. */
export function surfacePresentation(surface: SurfaceIdentity, labels: { free: string; local: string }) {
  if (surface.catalogo === "gratuitos") return { label: labels.free, mark: "danil" };
  if (surface.provider === "opencode-local") return { label: labels.local, mark: null };
  if (surface.provider === "opencode-zen") return { label: "OpenCode", mark: "opencode-zen" };
  return { label: surface.label, mark: surface.provider };
}

export function selectedModelMark(provider: string | null | undefined, model?: string | null, surface?: SurfaceIdentity) {
  if (model?.startsWith("danil-free/") || (!model && surface?.catalogo === "gratuitos")) return "danil";
  return provider === "opencode-local" ? null : provider;
}

/**
 * «Go» separa la suscripción del saldo de Zen. Los dos sirven el mismo modelo
 * con el mismo nombre y cobran distinto: sin la etiqueta, el renglón que falla
 * por falta de saldo es indistinguible del que ya está pagado.
 */
export function modelBillingTag(provider: string | null | undefined, model?: string | null) {
  return provider === "opencode-zen" && model?.startsWith("opencode-go/") ? "Go" : null;
}
