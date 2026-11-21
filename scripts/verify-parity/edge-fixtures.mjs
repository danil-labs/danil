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

export async function handleEdgeRoute(route) {
  const req = route.request();
  const url = new URL(req.url());
  const pathname = url.pathname;
  const method = req.method();
  const origin = req.headers()["origin"] || "*";

  const jsonHeaders = {
    "content-type": "application/json",
    "access-control-allow-origin": origin,
    "access-control-allow-credentials": "true"
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
}
