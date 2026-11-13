export const FEATURES = [
  { id: 'inbox', available: true },
  { id: 'broadcasts', available: true },
  { id: 'agents', available: true },
  { id: 'channels', available: true },
  { id: 'contacts', available: false },
  { id: 'inventory', available: false },
] as const;

export type FeatureId = typeof FEATURES[number]['id'];
export type EnabledFeature = Extract<typeof FEATURES[number], { available: true }>['id'];
export type Selection = { enabled: readonly EnabledFeature[]; writable: boolean };
export type Context = { user: string | null | undefined; workspace: string | null | undefined; space: string | null | undefined };
const eligible = new Set<string>(FEATURES.filter(row => row.available).map(row => row.id));
export const isEnabledFeature = (id: string): id is EnabledFeature => eligible.has(id);
export const emptySelection = (): Selection => ({ enabled: [], writable: true });

export function decodeSelection(raw: string | null): Selection {
  if (raw === null) return emptySelection();
  if (raw.length > 4096) return { enabled: [], writable: false };
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return emptySelection();
    const data = value as Record<string, unknown>;
    if (data.version !== 1) return { enabled: [], writable: false };
    if (!Array.isArray(data.enabled) || data.enabled.length > FEATURES.length || new Set(data.enabled).size !== data.enabled.length || data.enabled.some(id => typeof id !== 'string' || !isEnabledFeature(id))) return emptySelection();
    const enabled = data.enabled as string[];
    return { enabled: FEATURES.flatMap(row => row.available && enabled.includes(row.id) ? [row.id] : []), writable: true };
  } catch { return emptySelection(); }
}

export function toggleFeature(selection: Selection, id: string): Selection {
  if (!selection.writable || !isEnabledFeature(id)) return selection;
  const chosen = new Set(selection.enabled);
  if (chosen.has(id)) chosen.delete(id); else chosen.add(id);
  return { enabled: FEATURES.flatMap(row => row.available && chosen.has(row.id) ? [row.id] : []), writable: true };
}

export function encodeSelection(selection: Selection): string | null {
  if (!selection.writable || selection.enabled.length > 4 || selection.enabled.some(id => !isEnabledFeature(id))) return null;
  return JSON.stringify({ version: 1, enabled: FEATURES.flatMap(row => row.available && selection.enabled.includes(row.id) ? [row.id] : []) });
}

const stableId = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 256 && value.trim() === value && !/[\u0000-\u001f]/.test(value);
export function contextKey(context: Context): string | null {
  if (![context.user, context.workspace, context.space].every(stableId)) return null;
  return `attention.customization.v1.${encodeURIComponent(JSON.stringify([context.user, context.workspace, context.space]))}`;
}
