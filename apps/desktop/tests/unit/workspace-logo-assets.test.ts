import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { EdgeTransport } from "../../../../packages/platform-client/src/edge.ts";
import { deskEdgeWorkspaceAssets, webEdgeWorkspaceAssets } from "../../../../packages/session/src/workspace-assets.ts";

const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
]);

describe("webEdgeWorkspaceAssets", () => {
  it("lee el logo compartido desde /v1/workspaces/:id/logo?v=N con caché HTTP y mantiene personal el fondo", async () => {
    const calls: { method: string; path: string; headers: Record<string, string>; cache?: RequestCache }[] = [];
    let version = 1;
    let hasLogo = true;

    const transport: EdgeTransport = {
      async call(path, init) {
        const headers = Object.fromEntries(new Headers(init?.headers).entries());
        calls.push({ method: init?.method ?? "GET", path, headers, cache: init?.cache });
        if (path === "workspaces") {
          return new Response(
            JSON.stringify({
              items: [
                {
                  id: "42",
                  org: "org_A",
                  name: "Danil",
                  engine_workspace_id: "fqgx1w8m",
                  ...(hasLogo ? { logo_version: version, logo_url: `/v1/workspaces/42/logo?v=${version}` } : {}),
                },
                {
                  id: "43",
                  org: "org_A",
                  name: "Sin Logo",
                  engine_workspace_id: "abcd1234",
                },
              ],
              next_cursor: null,
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        if (path.startsWith("workspaces/42/logo")) {
          return new Response(PNG_BYTES, {
            status: 200,
            headers: {
              "content-type": "image/png",
              etag: `"ws-42-v${version}"`,
              "cache-control": "private, max-age=31536000, immutable",
            },
          });
        }
        return new Response(null, { status: 404 });
      },
      async mutation(path, init) {
        const headers = Object.fromEntries(new Headers(init?.headers).entries());
        calls.push({ method: init?.method ?? "POST", path, headers });
        if (init?.method === "PUT" && path === "workspaces/42/logo") {
          version += 1;
          hasLogo = true;
          return new Response(
            JSON.stringify({
              id: "42",
              logo_version: version,
              logo_url: `/v1/workspaces/42/logo?v=${version}`,
              content_type: "image/png",
              bytes: PNG_BYTES.byteLength,
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        if (init?.method === "DELETE" && path === "workspaces/42/logo") {
          version += 1;
          hasLogo = false;
          return new Response(JSON.stringify({ id: "42", logo_version: version, logo_url: null }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response(null, { status: 404 });
      },
    };

    const assets = webEdgeWorkspaceAssets(transport, () => "ctx_active");

    // El fondo de chats NO es compartido: siempre cae al flujo local sin red.
    assert.equal(await assets.read("fqgx1w8m", "background", "ctx_team"), undefined);
    assert.equal(await assets.setting("fqgx1w8m"), null);
    assert.equal(await assets.put("fqgx1w8m", "background", new Blob([PNG_BYTES], { type: "image/png" }), "ctx_team"), false);
    assert.equal(await assets.remove("fqgx1w8m", "background", "ctx_team"), false);
    assert.equal(calls.length, 0);

    // Lectura compartida del logo por engine_workspace_id en el contexto de equipo.
    const dataUrl = await assets.read("fqgx1w8m", "logo", "ctx_team");
    assert.ok(dataUrl?.startsWith("data:image/png;base64,"));
    const logoFetch = calls.find((c) => c.path === "workspaces/42/logo?v=1");
    assert.ok(logoFetch);
    assert.equal(logoFetch.headers["x-danil-session"], "ctx_team");
    assert.equal(logoFetch.headers.accept, "image/png,image/jpeg,image/webp");
    assert.equal(logoFetch.cache, "default");

    // Segunda lectura usa caché en memoria: no vuelve a pedir a red.
    const countBefore = calls.length;
    assert.equal(await assets.read("fqgx1w8m", "logo", "ctx_team"), dataUrl);
    assert.equal(calls.length, countBefore);

    // Un workspace en el catálogo sin logo devuelve null (monograma sin error).
    assert.equal(await assets.read("abcd1234", "logo", "ctx_team"), null);

    // PUT actualiza la versión en caché y la siguiente lectura pide ?v=2.
    assert.equal(await assets.put("fqgx1w8m", "logo", new Blob([PNG_BYTES], { type: "image/png" }), "ctx_team"), true);
    const updatedUrl = await assets.read("fqgx1w8m", "logo", "ctx_team");
    assert.ok(updatedUrl?.startsWith("data:image/png;base64,"));
    assert.ok(calls.some((c) => c.path === "workspaces/42/logo?v=2"));

    // DELETE limpia el logo compartido.
    assert.equal(await assets.remove("fqgx1w8m", "logo", "ctx_team"), true);
    assert.equal(await assets.read("fqgx1w8m", "logo", "ctx_team"), null);

    // forget() obliga a releer GET /v1/workspaces en la siguiente consulta.
    assets.forget("ctx_team");
    hasLogo = true;
    version = 4;
    const refetched = await assets.read("fqgx1w8m", "logo", "ctx_team");
    assert.ok(refetched?.startsWith("data:image/png;base64,"));
    assert.ok(calls.some((c) => c.path === "workspaces/42/logo?v=4"));
  });
});

describe("deskEdgeWorkspaceAssets", () => {
  it("lee el logo compartido por danil_edge_fetch JSON para miembros en Desk y no toca fondos", async () => {
    const calls: string[] = [];
    const send = async (context: string, method: string, path: string) => {
      calls.push(`${context}:${method}:${path}`);
      if (path === "/v1/workspaces") {
        return {
          status: 200,
          body: {
            items: [
              {
                id: "99",
                org: "org_A",
                name: "Equipo",
                engine_workspace_id: "wsdesk01",
                logo_version: 2,
                logo_url: "/v1/workspaces/99/logo?v=2",
              },
            ],
            next_cursor: null,
          },
        };
      }
      if (path === "/v1/workspaces/99/logo?v=2") {
        return {
          status: 200,
          body: {
            id: "99",
            logo_version: 2,
            content_type: "image/png",
            data_url: "data:image/png;base64,iVBORw0KGgo=",
          },
        };
      }
      return { status: 404 };
    };

    const assets = deskEdgeWorkspaceAssets(send);
    assert.equal(await assets.read("wsdesk01", "background", "ctx_desk"), undefined);
    assert.equal(await assets.read("wsdesk01", "logo", "ctx_desk"), "data:image/png;base64,iVBORw0KGgo=");
    // Segunda lectura usa caché.
    assert.equal(await assets.read("wsdesk01", "logo", "ctx_desk"), "data:image/png;base64,iVBORw0KGgo=");
    assert.deepEqual(calls, [
      "ctx_desk:GET:/v1/workspaces",
      "ctx_desk:GET:/v1/workspaces/99/logo?v=2",
    ]);
  });
});
