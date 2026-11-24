import { accountReturn } from "./account-return-state.ts";
import type { ContextGroup, ContextInvoke } from "./session-context-types.ts";

export async function addSessionAccount(rpc: ContextInvoke, refresh: () => Promise<void>, groups: () => ContextGroup[] | null) {
  const attempt = accountReturn.begin((groups() ?? []).map((g) => g.context_id));
  try {
    let result: { error?: string | null };
    try { result = await rpc("danil_sign_in", { mode: "add" }); }
    catch (cause) {
      const refusal = cause as { detail?: string; status?: number } | null;
      if (refusal?.detail !== "not_available_yet" && refusal?.status !== 404 && refusal?.status !== 501) throw cause;
      result = await rpc("danil_sign_in");
    }
    await refresh();
    if (result.error) throw { detail: result.error };
    accountReturn.returned(attempt);
  } catch (cause) {
    accountReturn.failed(attempt, cause);
    throw cause;
  }
}
