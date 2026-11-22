// Borde simulado común a las dos apps (misma persona, organizaciones, workspaces y máquinas). Una escuadra que necesite otra ruta la agrega aquí.

export const mockData = {
  person: {
    id: "user_ana_perez",
    name: "Ana Pérez",
    state: "active",
    active_organization_id: "org_danil",
    workspace: "1",
    organizations: [
      {
        id: "org_danil",
        name: "Danil",
        role: "owner",
        type: "organization",
        plan: "enterprise"
      },
      {
        id: "org_personal",
        name: "Personal",
        role: "owner",
        type: "personal",
        plan: "free"
      }
    ]
  },
  organizations: [
    {
      id: "org_danil",
      name: "Danil",
      role: "owner",
      type: "organization",
      plan: "enterprise"
    },
    {
      id: "org_personal",
      name: "Personal",
      role: "owner",
      type: "personal",
      plan: "free"
    }
  ],
  workspaces: [
    { id: "1", org: "org_danil", name: "Alpha", role: "owner" },
    { id: "2", org: "org_danil", name: "Beta", role: "owner" },
    { id: "3", org: "org_personal", name: "Personal 1", role: "owner" },
    { id: "4", org: "org_personal", name: "Personal 2", role: "owner" }
  ],
  machines: [
    {
      machine_id: "mach_cloud_running",
      name: "Danil VM 1",
      state: "running",
      connection: "connected",
      organization_id: "org_danil",
      person_id: null,
      kind: "organization",
      provider: "danil"
    },
    {
      machine_id: "mach_cloud_stopped",
      name: "Danil VM 2",
      state: "stopped",
      connection: "disconnected",
      organization_id: "org_danil",
      person_id: null,
      kind: "organization",
      provider: "danil"
    }
  ],
  credits: {
    organization_id: "org_danil",
    available: {
      currency: "MXN",
      amount_micro: "150000000"
    }
  },
  capabilities: {
    items: [
      { name: "workspaces", version: 1, status: "available" },
      { name: "workspaces.select", version: 1, status: "available" },
      { name: "machines", version: 1, status: "available" },
      { name: "machines.start", version: 1, status: "available" },
      { name: "machines.session", version: 1, status: "available" },
      { name: "identity", version: 1, status: "available" },
      { name: "credentials", version: 1, status: "available" }
    ]
  }
};

/** Los contextos de `/v1/identity/sessions` y su organización (el eco de cada respuesta con contexto). */
const CONTEXT_ORG = { ctx_personal: "org_personal", ctx_danil: "org_danil" };

export async function handleEdgeRoute(route) {
  const req = route.request();
  const url = new URL(req.url());
  const pathname = url.pathname;
  const method = req.method();
  const origin = req.headers()["origin"] || "*";

  // El borde real repite el contexto pedido y su organización (`X-Danil-Session-Applied[-Org]`); sin el eco
  // la web descarta la respuesta y reintenta, y una carga contaría peticiones que en beta no ocurren.
  const session = req.headers()["x-danil-session"];
  const echo = session && CONTEXT_ORG[session] ? { "x-danil-session-applied": session, "x-danil-session-applied-org": CONTEXT_ORG[session] } : {};
  const jsonHeaders = {
    "content-type": "application/json",
    "access-control-allow-origin": origin,
    "access-control-allow-credentials": "true",
    "access-control-expose-headers": "x-danil-session-applied, x-danil-session-applied-org, retry-after, location",
    ...echo
  };

  if (method === "OPTIONS") {
    return route.fulfill({
      status: 204,
      headers: {
        "access-control-allow-origin": origin,
        "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS",
        "access-control-allow-headers": "*",
        "access-control-allow-credentials": "true"
      }
    });
  }

  if (method === "GET") {
    if (pathname === "/v1/identity/sessions") {
      return route.fulfill({ status: 200, headers: jsonHeaders, body: JSON.stringify({
        items: [{ session_id: "fam_ana", sub: "user_ana_perez", email: "ana@danil.ai", contexts: [
          { context_id: "ctx_personal", org: "org_personal", org_name: "Personal", plan: "free", role: "owner", personal: true },
          { context_id: "ctx_danil", org: "org_danil", org_name: "Danil", plan: "enterprise", role: "owner" },
        ] }],
        default_context: "ctx_personal",
      }) });
    }
    if (pathname === "/v1/identity/sessions/catalog") {
      const of = (org) => mockData.workspaces.filter(w => w.org === org).map(w => ({ engine_workspace_id: `ws_${w.id}`, name: w.name, account_id: null }));
      return route.fulfill({ status: 200, headers: jsonHeaders, body: JSON.stringify({
        items: [{ session_id: "fam_ana", sub: "user_ana_perez", email: "ana@danil.ai", contexts: [
          { context_id: "ctx_personal", org: "org_personal", catalog_state: "listed", workspaces: of("org_personal") },
          { context_id: "ctx_danil", org: "org_danil", catalog_state: "listed", workspaces: of("org_danil") },
        ] }],
      }) });
    }
    if (pathname === "/v1/identity/me") {
      return route.fulfill({
        status: 200,
        headers: jsonHeaders,
        body: JSON.stringify(mockData.person)
      });
    }

    if (pathname === "/v1/identity/organizations") {
      return route.fulfill({
        status: 200,
        headers: jsonHeaders,
        body: JSON.stringify({
          items: mockData.organizations,
          organizations: mockData.organizations,
          active_organization_id: mockData.person.active_organization_id
        })
      });
    }

    if (pathname === "/v1/identity/csrf") {
      return route.fulfill({
        status: 200,
        headers: jsonHeaders,
        body: JSON.stringify({ csrf_token: "csrf_mock_token_12345" })
      });
    }

    if (pathname === "/v1/workspaces") {
      return route.fulfill({
        status: 200,
        headers: jsonHeaders,
        body: JSON.stringify({
          items: mockData.workspaces,
          workspaces: mockData.workspaces,
          next_cursor: null
        })
      });
    }

    if (pathname === "/v1/machines") {
      return route.fulfill({
        status: 200,
        headers: jsonHeaders,
        body: JSON.stringify({
          items: mockData.machines,
          next_cursor: null
        })
      });
    }

    if (pathname === "/v1/credits/balance") {
      const sessionHeader = req.headers()["x-danil-session"];
      const respHeaders = { ...jsonHeaders };
      if (sessionHeader) {
        respHeaders["x-danil-session-applied"] = sessionHeader;
      }
      return route.fulfill({
        status: 200,
        headers: respHeaders,
        body: JSON.stringify(mockData.credits)
      });
    }

    if (pathname === "/v1/capabilities") {
      return route.fulfill({
        status: 200,
        headers: jsonHeaders,
        body: JSON.stringify(mockData.capabilities)
      });
    }

    if (pathname === "/v1/workspaces/preferences") {
      const added = mockData.workspaces.map(w => `ws_${w.id}`);
      return route.fulfill({
        status: 200,
        headers: jsonHeaders,
        body: JSON.stringify({ version: 1, added, updated_at: "2026-11-21T00:00:00Z" })
      });
    }
  }

  if (method === "PUT") {
    if (pathname === "/v1/workspaces/preferences" || pathname.startsWith("/v1/workspaces/preferences/added/")) {
      return route.fulfill({
        status: 204,
        headers: jsonHeaders
      });
    }
  }

  if (method === "DELETE") {
    if (pathname.startsWith("/v1/workspaces/preferences/added/")) {
      return route.fulfill({
        status: 204,
        headers: jsonHeaders
      });
    }
  }

  if (method === "POST") {
    if (pathname === "/v1/workspaces/select") {
      let body = {};
      try { body = req.postDataJSON() || {}; } catch {}
      const targetId = body.workspace || "1";
      const target = mockData.workspaces.find(w => w.id === targetId) || mockData.workspaces[0];
      mockData.person.workspace = target.id;
      return route.fulfill({
        status: 200,
        headers: jsonHeaders,
        body: JSON.stringify({ workspace: target })
      });
    }

    if (pathname === "/v1/identity/organizations/select") {
      let body = {};
      try { body = req.postDataJSON() || {}; } catch {}
      const targetId = body.organization || "org_danil";
      mockData.person.active_organization_id = targetId;
      return route.fulfill({
        status: 200,
        headers: jsonHeaders,
        body: JSON.stringify({ active_organization_id: targetId })
      });
    }

    // Borde real (~/work/terminus-workspace/repos/edge/src/routing.ts:70 y docs/contracts/mvp-v1/machines.openapi.yaml):
    // POST /v1/machines/{machine_id}/tickets emite un ticket de relay; si la máquina está apagada y no lleva wake, responde 409 machine_stopped.
    const ticketMatch = pathname.match(/^\/v1\/machines\/([^/]+)\/tickets$/);
    if (ticketMatch) {
      const machineId = ticketMatch[1];
      const machine = mockData.machines.find(m => m.machine_id === machineId);
      let body = {};
      try { body = req.postDataJSON() || {}; } catch {}
      if (machine?.state === "stopped" && !body.wake) {
        return route.fulfill({
          status: 409,
          headers: {
            "content-type": "application/problem+json",
            "access-control-allow-origin": origin,
            "access-control-allow-credentials": "true",
            "access-control-expose-headers": "x-danil-session-applied, x-danil-session-applied-org, retry-after, location",
            ...echo
          },
          body: JSON.stringify({
            type: "urn:danil:problem:machine_stopped",
            title: "Machine Stopped",
            status: 409,
            code: "machine_stopped",
            detail: "machine_stopped"
          })
        });
      }
      return route.fulfill({
        status: 201,
        headers: jsonHeaders,
        body: JSON.stringify({
          ticket: `tkt_${machineId}`,
          url: `wss://connect.danil.ai/v1/machines/${machineId}/session`,
          protocol: "danil.machine-session.v1"
        })
      });
    }
  }

  // 404 problem+json for everything else
  return route.fulfill({
    status: 404,
    headers: {
      "content-type": "application/problem+json",
      "access-control-allow-origin": origin,
      "access-control-allow-credentials": "true"
    },
    body: JSON.stringify({
      type: "urn:danil:problem:not-found",
      title: "Not Found",
      status: 404,
      detail: `Route ${method} ${pathname} not found in mock`
    })
  });
}

export async function attachFixtures(page) {
  await page.route("https://edge.danil.ai/**", handleEdgeRoute);

  let cursor = 0;
  await page.routeWebSocket("**/v1/machines/**", (ws) => {
    ws.send(JSON.stringify({ type: "state", state: "online" }));
    ws.send(JSON.stringify({ type: "engine", contract: "1", host_version: "1.0.0" }));
    ws.onMessage((raw) => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }
      if (msg.type === "ping") {
        ws.send(JSON.stringify({ type: "pong", t: msg.t }));
      } else if (msg.type === "auth") {
        ws.send(JSON.stringify({ type: "auth", expires_at: new Date(Date.now() + 600000).toISOString() }));
      } else if (msg.type === "subscribe") {
        ws.send(JSON.stringify({ type: "events", runtime: "rt1", cursor: ++cursor, replay: false, events: [] }));
      } else if (msg.type === "call") {
        let value = [];
        if (msg.command === "list_workspace_attention") {
          value = [];
        } else if (msg.command === "workspaces_startup" || msg.command === "list_workspaces") {
          value = { workspaces: mockData.workspaces.map(w => ({ id: `ws_${w.id}`, name: w.name, context_root: null })), active: "ws_1" };
        } else if (msg.command === "list_projects") {
          value = [{ id: "p1", name: "Proyecto 1", working_directory: "/lab/p1", kind: "git", portfolio: null, sources: [] }];
        } else if (msg.command === "list_live_sessions") {
          value = [{ id: "t1", title: "Tarea de prueba", last_message: "Primera tarea", provider: "codex", model: "gpt-5.6", refs: [], created_at: 1000, updated_at: 1000, turns: 1, parent: null, esperando: false }];
        } else if (msg.command === "load_session") {
          value = {
            id: "t1",
            provider: "codex",
            sources: [],
            model: "gpt-5.6",
            effort: null,
            permission_mode: null,
            turns: [
              { role: "user", id: "u1", at: 1, text: "Primera tarea" },
              { role: "assistant", id: "a1", at: 2, text: "Respuesta del agente" }
            ]
          };
        } else if (msg.command === "list_surfaces") {
          value = [{ id: "codex", provider: "codex", label: "Codex", catalogo: "todo", usable: true, marca: null, porque: null }];
        } else if (msg.command === "list_models") {
          value = { provider: "codex", models: [{ id: "gpt-5.6", label: "GPT-5.6", gratis: null, note: null, efforts: [], default_effort: null }], fallback: false };
        } else if (msg.command === "list_providers") {
          value = [{ id: "codex", label: "Codex", available: true, driver: true }];
        } else if (msg.command === "task_history") {
          value = { history: { archived: false, events: [], recovery: null }, branch: null, path: "/lab", available: true, owned: false, restorable: false, recreatable: false, incomplete: false };
        }
        ws.send(JSON.stringify({ type: "result", id: msg.id, value }));
      }
    });
  });
}
