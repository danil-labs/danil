export type AuditActorType = "user" | "member" | "ai" | "danil_support" | "system";

export type AuditEntry = {
  id: number;
  created_at: string;
  event_type: string;
  entity_type: string | null;
  action: "insert" | "update" | "delete" | null;
  changed_fields: string[];
  actor_type: AuditActorType;
  actor_name: string | null;
  actor_email: string | null;
  on_behalf_of_name: string | null;
  on_behalf_of_email: string | null;
  support_grant_id: number | null;
};

export type AuditPage =
  | { kind: "ok"; entries: AuditEntry[]; more: boolean }
  | { kind: "no_account" }
  | { kind: "forbidden" }
  | { kind: "unavailable" };

export type AuditLogSource = {
  /** Newest first; `before`, the smallest id already shown. */
  list(before?: number | null): Promise<AuditPage>;
};
