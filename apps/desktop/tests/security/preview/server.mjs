import { createServer } from "node:https";
import http from "node:http";
import net from "node:net";
import { readFileSync } from "node:fs";
import { resolve, extname, sep } from "node:path";
import { pathToFileURL } from "node:url";

const arg = name => process.argv[process.argv.indexOf(`--${name}`) + 1];
const { startMock } = await import(pathToFileURL(resolve(arg("contracts"), "preview-v1/mock/server.mjs")).href);
const mock = await startMock({ webOrigins: ["https://beta.danil.ai"] });
const dist = resolve(arg("dist"));
const counts = { created: 0, renewed: 0, deleted: 0, previewCookies: [] };
const json = (res, value) => { res.setHeader("content-type", "application/json"); res.end(JSON.stringify(value)); };
const server = createServer({ key: readFileSync(arg("key")), cert: readFileSync(arg("cert")) }, (req, res) => {
  const host = req.headers.host ?? "";
  const preview = host.startsWith("prv-");
  if (!preview && req.url === "/__lab/state") return json(res, counts);
  if (!preview && req.url === "/v1/identity/csrf") return json(res, { csrf_token: "preview-lab-csrf" });
  if (!preview && req.url === "/v1/machines/mch_1") return json(res, { machine_id: "mch_1", state: "running", preview: { available: true } });
  if (preview || req.url.startsWith("/v1/")) {
    if (preview && req.headers.cookie) counts.previewCookies.push(req.headers.cookie);
    if (!preview && req.method === "POST") req.url.endsWith("/renew") ? counts.renewed++ : counts.created++;
    if (!preview && req.method === "DELETE") counts.deleted++;
    const upstream = http.request({ hostname: "127.0.0.1", port: mock.port, path: req.url, method: req.method, headers: req.headers }, reply => {
      res.writeHead(reply.statusCode, reply.headers); reply.pipe(res);
    });
    upstream.on("error", () => { res.writeHead(502); res.end(); });
    req.pipe(upstream); return;
  }
  const path = resolve(dist, "." + new URL(req.url, "https://beta.danil.ai").pathname.replace(/\/$/, "/index.html"));
  if (!path.startsWith(dist + sep)) { res.writeHead(403); res.end(); return; }
  try {
    const contents = readFileSync(path);
    res.setHeader("content-type", ({ ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2" })[extname(path)] ?? "application/octet-stream");
    res.end(contents);
  } catch { res.writeHead(404); res.end(); }
});
server.on("upgrade", (req, socket, head) => {
  const target = net.connect(mock.port, "127.0.0.1", () => {
    target.write(`${req.method} ${req.url} HTTP/1.1\r\n${Object.entries(req.headers).map(([key, value]) => `${key}: ${value}`).join("\r\n")}\r\n\r\n`);
    if (head.length) target.write(head);
    socket.pipe(target); target.pipe(socket);
  });
  target.on("error", () => socket.destroy());
  socket.on("error", () => target.destroy());
  socket.on("close", () => target.destroy());
});
server.listen(Number(arg("port") || 18443), "127.0.0.1", () => console.log("preview browser lab ready"));
process.on("SIGTERM", () => { server.closeAllConnections(); server.close(); void mock.close().finally(() => process.exit(0)); });
