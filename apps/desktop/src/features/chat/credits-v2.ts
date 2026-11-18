export type InferenceLevel = { id: string; label: string; default: boolean };

export function prepareCreditsV2(
  headers: Record<string, string>,
  invoke: (command: string, args: Record<string, unknown>) => Promise<unknown>,
): Promise<unknown> {
  const workspace = headers["x-terminus-workspace"];
  const machine = headers["x-terminus-machine"];
  if (!workspace || (machine && machine !== "local")) return Promise.reject(new Error("credits_unavailable"));
  return invoke("credits_pilot_prepare", { workspace, account: null });
}

export function inferenceLevels(models: unknown, catalog: unknown): InferenceLevel[] {
  if (!models || typeof models !== "object" || (models as { object?: unknown }).object !== "list") return [];
  const data = (models as { data?: unknown }).data;
  const tiers = (catalog as { inference_tiers?: unknown } | null)?.inference_tiers;
  if (!Array.isArray(data) || !Array.isArray(tiers)) return [];
  const offered = new Set(
    data.filter((row) => row && typeof row === "object" && row.object === "model" && typeof row.id === "string")
      .map((row) => row.id as string),
  );
  return tiers.flatMap((tier): InferenceLevel[] =>
    tier && typeof tier.id === "string" && typeof tier.label === "string" && typeof tier.default === "boolean" && offered.has(tier.id)
      ? [{ id: tier.id, label: tier.label, default: tier.default }]
      : [],
  );
}
