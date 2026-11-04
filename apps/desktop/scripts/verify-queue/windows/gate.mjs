#!/usr/bin/env node
/**
 * La entrada de la cola en Windows, donde Tailscale SSH no tiene servidor: escucha en la IP
 * de Tailscale y pasa a la cola (loopback) solo las conexiones que `tailscale whois` atribuye
 * a una persona o un tag de `gate.json`. La ACL de la tailnet es la primera puerta; esta, la segunda.
 * La cola escucha en un pipe (`target`), no en loopback: otra cuenta de la VM no llega a ella.
 *
 *   node gate.mjs D:\ci\queue\gate.json
 */
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { connect, createServer } from "node:net";
import { setTimeout as sleep } from "node:timers/promises";

const WHOIS_TIMEOUT_MS = 10_000;
const config = JSON.parse(readFileSync(process.argv[2], "utf8"));
const users = new Set(config.users ?? []);
const tags = new Set(config.tags ?? []);

const tailscale = (args) =>
  new Promise((resolve, reject) => {
    execFile(config.tailscale, args, { timeout: WHOIS_TIMEOUT_MS, windowsHide: true }, (error, stdout) => (error ? reject(error) : resolve(stdout)));
  });

/** Quién llama, o `null`: un whois que falla no deja pasar. */
async function caller(socket) {
  try {
    const who = JSON.parse(await tailscale(["whois", "--json", `${socket.remoteAddress.replace(/^::ffff:/, "")}:${socket.remotePort}`]));
    const login = who.UserProfile?.LoginName ?? "";
    const nodeTags = who.Node?.Tags ?? [];
    if (users.has(login) || nodeTags.some((tag) => tags.has(tag))) return `${who.Node?.ComputedName ?? who.Node?.Name ?? "?"} (${nodeTags.length ? nodeTags.join(",") : login})`;
    console.log(`${new Date().toISOString()} rechazo ${socket.remoteAddress}: ${nodeTags.join(",") || login || "sin identidad"}`);
  } catch (error) {
    console.log(`${new Date().toISOString()} rechazo ${socket.remoteAddress}: whois falló (${error.message.split("\n")[0]})`);
  }
  return null;
}

function serve(address) {
  const server = createServer({ pauseOnConnect: true }, async (socket) => {
    socket.on("error", () => socket.destroy());
    const who = await caller(socket);
    if (!who) return socket.destroy();
    console.log(`${new Date().toISOString()} paso ${who}`);
    const upstream = connect({ path: config.target });
    upstream.on("error", () => socket.destroy());
    socket.on("close", () => upstream.destroy());
    upstream.on("close", () => socket.destroy());
    socket.pipe(upstream).pipe(socket);
    socket.resume();
  });
  server.on("error", (error) => {
    console.error(`no escucho en ${address}:${config.port}: ${error.message}`);
    process.exit(1);
  });
  server.listen(config.port, address, () => console.log(`gate en ${address}:${config.port} hacia ${config.target}`));
}

// tailscaled puede arrancar después que esta tarea: se espera a su IP.
for (;;) {
  const ip = (await tailscale(["ip", "-4"]).catch((error) => console.error(`sin IP de Tailscale: ${error.message.split("\n")[0]}`) ?? "")).trim();
  if (/^100\./.test(ip)) {
    serve(ip);
    break;
  }
  await sleep(5_000);
}
