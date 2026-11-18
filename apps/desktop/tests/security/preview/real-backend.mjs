/** Adaptador de pruebas: solo el borde se simula; relay, conector Rust y Vite son reales. */
import { cpSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

export async function realBackend(control, fixtureDir) {
  if (!fixtureDir || new URL(control).hostname !== "127.0.0.1") throw new Error("laboratory requires an explicit scratch directory and loopback control");
  const lab = await fetch(`${control}/lab/config`).then(response => response.json());
  if (!lab.synthetic) throw new Error("laboratory requires synthetic credentials");
  const root = resolve(fixtureDir);
  mkdirSync(root, { recursive: true });
  cpSync(fileURLToPath(new URL("./fixture/", import.meta.url)), root, { recursive: true });
  const vite = await createServer({ configFile: false, root, logLevel: "error", server: { host: "127.0.0.1", port: 0, hmr: { clientPort: 443, protocol: "wss" } }, plugins: [{
    name: "preview-fixture",
    configureServer(server) {
      server.middlewares.use("/api/ping", (_, res) => { res.setHeader("content-type", "application/json"); res.end('{"ok":true}'); });
      server.ws.on("echo", (value, client) => client.send("echo", value));
    },
  }] });
  await vite.listen();
  return {
    port: Number(new URL(lab.relay_http).port),
    config: { machine: lab.machine_id, workspace: lab.engine_workspace_id, platformWorkspace: lab.platform_workspace_claim, port: vite.httpServer.address().port },
    touch: () => writeFileSync(resolve(root, "message.js"), 'export const message = "hmr-updated";\n'),
    close: () => vite.close(),
    async api(req, res) {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const raw = Buffer.concat(chunks).toString();
      const workspace = req.headers["x-danil-workspace"];
      // El borde simulado firma exactamente el contexto enviado por el cliente.
      const result = await fetch(`${control}/lab/edge`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
        method: req.method, path: req.url, key: req.headers["idempotency-key"], ...(raw ? { body: JSON.parse(raw) } : {}), claims: { workspace: workspace ?? null },
      }) }).then(response => response.json());
      res.writeHead(result.status, { "content-type": result.status >= 400 ? "application/problem+json" : "application/json", "cache-control": "no-store" });
      res.end(result.body === null ? undefined : JSON.stringify(result.body));
    },
  };
}
