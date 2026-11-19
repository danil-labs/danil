/**
 * Una sesión de Danil con la organización personal Free, para las pruebas que
 * pasan por el alta (plan de cuentas F1.2): el alta exige la sesión y entra al
 * workspace Free sellándolo aquí; ya no crea uno local.
 */
export const SIGNED_IN = { "danil.onboarding.account_choice": "connected" };

export function freeSession() {
  const sealed = [];
  const status = {
    state: "connected",
    sessions: [{ family: "f1", email: "ana@norte.mx", contexts: [{ context_id: "c1", org: "org_1", org_name: "Ana", plan: "free" }] }],
    default_context: "c1",
  };
  return {
    sealed,
    table: {
      danil_session_status: () => status,
      machine_list: [{ id: "m_local", local: true, features: ["account_workspace_v1"] }],
      danil_edge_fetch: ({ method, path }) => {
        if (method === "GET" && path === "/v1/workspaces") return { status: 200, body: { items: [{ id: "42", org: "org_1", name: "Personal", engine_workspace_id: "n" }], next_cursor: null } };
        return { status: 404, body: null };
      },
      create_account_workspace: ({ id, name }) => {
        sealed.push(id);
        return { id, name };
      },
    },
  };
}
