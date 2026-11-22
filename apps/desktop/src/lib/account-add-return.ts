export type ReturnGroup = { context_id: string; org: string; org_name: string | null; available: readonly { id: string }[] | null; added: ReadonlySet<string> | null };
type AddReturnState = { phase: "pending" | "returned" | "error"; before: string[]; attempt: number; detail?: string };
export type AddReturnResult = { ids: string[]; organizations: string[] };

/** Solo guarda ids públicos en la pestaña; nunca credenciales ni respuestas del borde. */
export function createAccountReturn(changed: () => void, storage?: Pick<Storage, "getItem" | "setItem" | "removeItem">) {
  const key = "danil.account-add.pending";
  let state: AddReturnState | null = null;
  let epoch = 0;
  try { const saved = JSON.parse(storage?.getItem(key) ?? "null"); if (Array.isArray(saved?.before) && saved.before.every((s: unknown) => typeof s === "string") && Date.now() - saved.at < 600_000) state = { phase: "returned", before: saved.before, attempt: ++epoch }; } catch {}
  const clear = () => { state = null; try { storage?.removeItem(key); } catch {} changed(); };
  const begin = (before: readonly string[]) => {
    state = { phase: "pending", before: [...before], attempt: ++epoch };
    try { storage?.setItem(key, JSON.stringify({ before, at: Date.now() })); } catch {}
    changed(); return epoch;
  };
  return {
    state: () => state,
    begin, clear,
    returned: (attempt: number) => { if (state?.attempt === attempt) { state = { ...state, phase: "returned" }; changed(); } },
    failed: (attempt: number, cause: unknown) => {
      if (state?.attempt !== attempt) return;
      const detail = (cause as { detail?: string } | null)?.detail;
      if (["cancelled", "access_denied", "expired", "timeout"].includes(detail ?? "")) { clear(); return; }
      state = { ...state, phase: "error", detail }; try { storage?.removeItem(key); } catch {} changed();
    },
    take: (groups: readonly ReturnGroup[] | null): AddReturnResult | null => {
      if (state?.phase !== "returned" || !groups) return null;
      const added = groups.filter((g) => !state!.before.includes(g.context_id));
      if (!added.length || added.some((g) => !g.available || (g.available.length > 0 && !g.added))) return null;
      const ids = [...new Set(added.flatMap((g) => (g.available ?? []).filter((w) => g.added?.has(w.id)).map((w) => w.id)))];
      const organizations = [...new Set(added.map((g) => g.org_name ?? g.org))];
      clear(); return { ids, organizations };
    },
  };
}
