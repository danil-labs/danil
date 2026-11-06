export type FreePolicy = {
  version: string;
  generation: number;
  locale: string;
  text_sha256: string;
};

export type FreeDecisionRequest = {
  provider: "opencode";
  operation_id: string;
  expected_account_id: string;
  accepted: boolean;
  policy_version?: string;
  policy_generation?: number;
  locale?: string;
  text_sha256?: string;
};

const DEFINITIVE = new Set(["invalid_argument", "invalid_credential", "operation_conflict", "user_not_found"]);

export type FreeDecisionResult =
  | { kind: "saved" }
  | { kind: "policy_changed" | "session_changed" | "outcome_unknown" | "failed"; code: string };

/** One operation retains its ID and the exact policy, including across uncertain replies. */
export function createFreeDecision(account: string, accepted: boolean, policy: FreePolicy, operationId: string) {
  const body: FreeDecisionRequest = {
    provider: "opencode", operation_id: operationId, expected_account_id: account, accepted,
    ...(accepted ? { policy_version: policy.version, policy_generation: policy.generation, locale: policy.locale, text_sha256: policy.text_sha256 } : {}),
  };
  const payload = JSON.stringify(body);

  return async (post: (payload: string) => Promise<Response>): Promise<FreeDecisionResult> => {
    let response: Response;
    let result: unknown;
    try {
      response = await post(payload);
      result = await response.json();
    } catch {
      return { kind: "outcome_unknown", code: "outcome_unknown" };
    }
    if (!response.ok) {
      const code = (result as { error?: { code?: unknown } } | null)?.error?.code;
      if (response.status >= 500 || typeof code !== "string") return { kind: "outcome_unknown", code: "outcome_unknown" };
      if (code === "policy_changed" || code === "session_changed" || code === "outcome_unknown") return { kind: code, code };
      return DEFINITIVE.has(code) ? { kind: "failed", code } : { kind: "outcome_unknown", code: "outcome_unknown" };
    }
    const receipt = result as Record<string, unknown> | null;
    if (!receipt || receipt.operation_id !== operationId || receipt.account_id !== account ||
      receipt.decision !== (accepted ? "accepted" : "revoked") ||
      !Number.isSafeInteger(receipt.revision) || (receipt.revision as number) < 1 ||
      receipt.policy_version !== (body.policy_version ?? null) ||
      receipt.policy_generation !== (body.policy_generation ?? null)) {
      return { kind: "outcome_unknown", code: "outcome_unknown" };
    }
    return { kind: "saved" };
  };
}

export type PendingFreeDecision = {
  account: string;
  accepted: boolean;
  policy: FreePolicy;
  operationId: string;
};

const PENDING_PREFIX = "danil:free:pending:";

/** Persist only the decision identity, never a credential. */
export function saveFreeDecision(storage: Storage, pending: PendingFreeDecision) {
  storage.setItem(PENDING_PREFIX + pending.operationId, JSON.stringify(pending));
}

export function removeFreeDecision(storage: Storage, operationId: string) {
  storage.removeItem(PENDING_PREFIX + operationId);
}

export function pendingFreeDecisions(storage: Storage, account: string): PendingFreeDecision[] {
  const pending: PendingFreeDecision[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key?.startsWith(PENDING_PREFIX)) continue;
    let value: PendingFreeDecision;
    try { value = JSON.parse(storage.getItem(key) ?? ""); } catch { throw new Error("invalid_pending"); }
    if (!value || typeof value !== "object" || typeof value.account !== "string" || !/^[1-9][0-9]*$/.test(value.account) ||
        typeof value.accepted !== "boolean" || typeof value.operationId !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value.operationId) ||
        key !== PENDING_PREFIX + value.operationId || !value.policy || typeof value.policy.version !== "string" || !value.policy.version ||
        !Number.isSafeInteger(value.policy.generation) || value.policy.generation < 1 || typeof value.policy.locale !== "string" ||
        typeof value.policy.text_sha256 !== "string" || !/^[0-9a-f]{64}$/.test(value.policy.text_sha256)) throw new Error("invalid_pending");
    if (value.account === account) pending.push(value);
  }
  return pending;
}
