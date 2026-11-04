import { render } from "solid-js/web";
import { createSupportAccess } from "../../../../../packages/attention/src/support-access.ts";
import { aplicarLengua, aplicarLenguaDeWorkspace, t } from "../../lib/i18n";
import { accountSources, agentsSession } from "../attention/workspace-sources";
import { activeAccountOf, webAuditLog } from "../audit-log";
import { webHarnessOrg } from "../../features/settings/harness-org";
import { authLocation } from "../auth/return";
import type { WatchedSession } from "../session";
import { AdminPage, type AdminSource } from "./AdminPage";
import type { Section } from "./sections";
import "../phrases";
import "../../styles/global.css";

const root = () => document.getElementById("root") as HTMLElement;
const home = () => import.meta.env.BASE_URL;

/** `/admin` con la sesión de la app de Danil en este mismo origen; sin ella, a entrar. */
export async function startAdmin(settings: { endpoint: string; login: string; supabaseUrl: string; supabaseKey: string; workos?: boolean }) {
  aplicarLengua();
  const [{ seguirElTema }, { supabaseSession }] = await Promise.all([import("../../lib/theme"), import("../session")]);
  seguirElTema();
  const leave = () => window.location.assign(authLocation(settings.login, window.location.origin, `${window.location.pathname}${window.location.search}`));
  const session: WatchedSession = settings.workos
    ? (await import("../workos-session")).workosSession({ onGone: leave })
    : supabaseSession(settings.supabaseUrl, settings.supabaseKey, { onGone: leave });
  if (!(await session.user().catch(() => null))) return leave();
  const agents = agentsSession(settings.endpoint, session);
  const api = createSupportAccess(agents, fetch, `${import.meta.env.BASE_URL}alpha-api`);
  const source: AdminSource = {
    memberships: api.memberships,
    accounts: accountSources(agents),
    active: async () => activeAccountOf(await session.getToken()),
    support: { demo: false, workspaces: api.workspaces, list: api.list },
    auditLog: webAuditLog(settings.supabaseUrl, settings.supabaseKey, () => session.getToken(), () => void session.unauthorized()),
    harness: webHarnessOrg(settings.endpoint, () => session.getToken()),
    // La organización y sus workspaces salen del BFF; si no manda la organización, la sección no aparece.
    organization: { workspaces: api.organizationWorkspaces },
    workspace: new URLSearchParams(window.location.search).get("workspace"),
    home: home(),
    settings: `${home()}?settings=usage`,
  };
  render(() => <AdminPage source={source} />, root());
}

/** `/admin?demo=1`: datos de ejemplo, sin red ni sesión. `account`, `menu` y `section` eligen qué enseñar. */
export async function startAdminDemo(options: { dark: boolean }) {
  const [{ beginDemoIsolation }, { supportAccessDemo }, { seguirElTema }, { adminDemo }] = await Promise.all([import("../attention/demo"), import("../attention/support-access"), import("../../lib/theme"), import("./demo")]);
  const storage = beginDemoIsolation();
  storage.setItem("harness:apariencia", options.dark ? "oscuro" : "claro");
  aplicarLenguaDeWorkspace(null);
  seguirElTema();
  const query = new URLSearchParams(window.location.search);
  const workspace = t("web.alpha.demo_workspace");
  const source: AdminSource = {
    ...adminDemo(query.get("account"), workspace, t("web.admin.demo_other"), query.get("policy") === "internal"),
    accounts: { directory: async () => [], active: async () => 1, enter: async () => undefined },
    support: supportAccessDemo(workspace),
    section: (query.get("section") as Section | null) ?? undefined,
    home: `${home()}?demo=1${options.dark ? "&theme=dark" : ""}`,
    settings: `${home()}?demo=1&account=personal&settings=usage${options.dark ? "&theme=dark" : ""}`,
  };
  render(() => <AdminPage source={source} />, root());
}
