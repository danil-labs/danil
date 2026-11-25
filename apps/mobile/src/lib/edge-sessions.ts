/**
 * El conjunto de la cookie (`GET /v1/identity/sessions`), igual que la web.
 * Sin React Native: se prueba en Node.
 */

export type EdgeContext = { id: string; org: string; personal: boolean };

export type EdgeSessionSet = {
  defaultContext: string | null;
  contexts: EdgeContext[];
};

const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : null;

/** Ignora familias y contextos incompletos. Un `default_context` que no está en el conjunto no se usa. */
export function sessionSetOf(body: unknown): EdgeSessionSet {
  const raw = record(body);
  const contexts: EdgeContext[] = [];
  for (const item of Array.isArray(raw?.items) ? raw.items : []) {
    const family = record(item);
    for (const entry of Array.isArray(family?.contexts) ? family.contexts : []) {
      const context = record(entry);
      const id = typeof context?.context_id === "string" ? context.context_id : "";
      const org = typeof context?.org === "string" ? context.org : "";
      if (!id || !org) continue;
      contexts.push({ id, org, personal: context?.personal === true });
    }
  }
  const named = typeof raw?.default_context === "string" ? raw.default_context : null;
  return { defaultContext: named && contexts.some((context) => context.id === named) ? named : null, contexts };
}

/**
 * Qué contexto llevan las llamadas, con la misma preferencia que la web:
 * la organización activa, si no el contexto por omisión, si no el personal, si no el único.
 * Varias organizaciones y ninguna activa: no se elige una por su cuenta.
 */
export function contextFor(set: EdgeSessionSet, activeOrg: string | null): string | null {
  if (activeOrg) {
    const match = set.contexts.find((context) => context.org === activeOrg);
    if (match) return match.id;
  }
  if (set.defaultContext) return set.defaultContext;
  const personal = set.contexts.find((context) => context.personal);
  if (personal) return personal.id;
  if (set.contexts.length === 1) return set.contexts[0].id;
  return null;
}
