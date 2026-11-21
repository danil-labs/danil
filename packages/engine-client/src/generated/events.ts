// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
export const EVENTS = [
  "account",
  "account-rejected",
  "activity",
  "agentsview-changed",
  "attention",
  "bootstrap",
  "bootstrap-run",
  "chat",
  "cli-changed",
  "cli-open-task",
  "close-tab",
  "danil-connect",
  "danil-sessions",
  "google-drive",
  "inbox",
  "install",
  "integrations-changed",
  "keep-awake-changed",
  "kn-cloud",
  "local-engine",
  "local-model",
  "mcp",
  "mcp-login",
  "notice",
  "pending",
  "principal_revoked",
  "project_clone",
  "providers",
  "question",
  "radiant",
  "session",
  "site",
  "sitio-pedido",
  "telegram-changed",
  "toolchain",
  "typst-live",
  "usage",
  "account.request",
  "engine-adoption",
  "state.copy_changed",
  "state.changed",
  "machine-usage",
  "person-session"
] as const;
export type EventName = (typeof EVENTS)[number];
/** El contrato no describe payloads de eventos todavía: unknown hasta que lo haga. */
export interface EventPayloads {
  "account": unknown;
  "account-rejected": unknown;
  "activity": unknown;
  "agentsview-changed": unknown;
  "attention": unknown;
  "bootstrap": unknown;
  "bootstrap-run": unknown;
  "chat": unknown;
  "cli-changed": unknown;
  "cli-open-task": unknown;
  "close-tab": unknown;
  "danil-connect": unknown;
  "danil-sessions": unknown;
  "google-drive": unknown;
  "inbox": unknown;
  "install": unknown;
  "integrations-changed": unknown;
  "keep-awake-changed": unknown;
  "kn-cloud": unknown;
  "local-engine": unknown;
  "local-model": unknown;
  "mcp": unknown;
  "mcp-login": unknown;
  "notice": unknown;
  "pending": unknown;
  "principal_revoked": unknown;
  "project_clone": unknown;
  "providers": unknown;
  "question": unknown;
  "radiant": unknown;
  "session": unknown;
  "site": unknown;
  "sitio-pedido": unknown;
  "telegram-changed": unknown;
  "toolchain": unknown;
  "typst-live": unknown;
  "usage": unknown;
  "account.request": unknown;
  "engine-adoption": unknown;
  "state.copy_changed": unknown;
  "state.changed": unknown;
  "machine-usage": unknown;
  "person-session": unknown;
}
