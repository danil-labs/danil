/**
 * Una fila de la tabla de coherencia (`tests/fixtures/chat-queue-coherence.json`)
 * contra un motor real, por RPC1 (`service invoke`). Lo corre R0 contra el motor
 * lab, después de montar el estado de la fila; nada de la cadena lo corre contra
 * un motor real. Imprime una línea JSON y sale con 0 si coincide con lo
 * esperado, 1 si no, y 2 si la fila no se puede correr así.
 *
 *   node tests/helpers/chat-queue-coherence-lab.mjs --endpoint <endpoint.json> \
 *     --workspace <id> --project <id> --session <id> --provider <cli de prueba> \
 *     --mode legacy|chat_queue_v1 --case <id>
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createConnection } from "node:net";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";

export const TABLE = JSON.parse(readFileSync(new URL("../fixtures/chat-queue-coherence.json", import.meta.url), "utf8"));

/** Cambia cada marcador (`$project`, `$session`, `$provider`) por su valor. */
export const fill = (value, ids) => JSON.parse(JSON.stringify(value), (_key, item) =>
  typeof item === "string" && item in ids ? ids[item] : item);

/** El código de un error de comando: una cadena, o la clave o el detalle de un `Failure`. */
const code = (error) => (typeof error === "string" ? error : error?.what?.clave ?? error?.clave ?? error?.detail ?? error);
export const outcomeOf = (result) => ("error" in result ? { error: code(result.error) } : { result: result.value });

function line(address, frame) {
  const [host, port] = [address.slice(0, address.lastIndexOf(":")), Number(address.slice(address.lastIndexOf(":") + 1))];
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host, port }, () => socket.write(`${JSON.stringify(frame)}\n`));
    let buffer = "";
    socket.setTimeout(60_000, () => socket.destroy(new Error("sin respuesta en 60 s")));
    socket.on("data", (chunk) => {
      buffer += chunk;
      if (buffer.includes("\n")) { socket.end(); resolve(JSON.parse(buffer.slice(0, buffer.indexOf("\n")))); }
    });
    socket.on("error", reject);
  });
}

/** `service invoke` con el mismo `request_id` hasta que deja de estar pendiente. */
export async function invoke(endpoint, workspace, call) {
  const token = readFileSync(endpoint.token_file, "utf8").trim();
  const frame = { version: 1, token, workspace, folder: null, command: "service invoke", args: { command: call.command, arguments: call.arguments }, request_id: randomUUID() };
  for (const deadline = Date.now() + 60_000; ;) {
    const reply = await line(endpoint.address, frame);
    if (reply.error) throw new Error(`RPC1: ${JSON.stringify(reply.error)}`);
    if (!reply.result?.pending || Date.now() > deadline) return outcomeOf(reply.result);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

/** Corre la fila `id` en `mode` y compara cada llamada con lo esperado. */
export async function runCase({ endpoint, workspace, ids, mode, id }) {
  const row = TABLE.cases.find((entry) => entry.id === id);
  if (!row) return { status: 2, report: { case: id, error: "no existe en la tabla" } };
  if (row.lab === false || row.expect[mode] == null) return { status: 2, report: { case: id, mode, error: "esta fila no se corre por RPC en este modo", note: row.lab_note } };
  const calls = [];
  for (const step of [row, ...(row.then ? [row.then] : [])]) {
    const call = fill(step.call, ids), expected = fill(step.expect[mode], ids);
    calls.push({ call, expected, lab: await invoke(endpoint, workspace, call) });
  }
  const match = calls.every((entry) => JSON.stringify(entry.lab) === JSON.stringify(entry.expected));
  return { status: match ? 0 : 1, report: { case: id, mode, state: row.state, match, calls } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { values } = parseArgs({ options: Object.fromEntries(["endpoint", "workspace", "project", "session", "provider", "mode", "case"].map((name) => [name, { type: "string" }])) });
  if (!values.endpoint || !values.case || !["legacy", "chat_queue_v1"].includes(values.mode ?? "")) {
    console.error("uso: --endpoint <endpoint.json> --workspace <id> --project <id> --session <id> --provider <id> --mode legacy|chat_queue_v1 --case <id>");
    process.exit(2);
  }
  const ids = { $project: values.project, $session: values.session, $provider: values.provider };
  const { status, report } = await runCase({ endpoint: JSON.parse(readFileSync(values.endpoint, "utf8")), workspace: values.workspace ?? null, ids, mode: values.mode, id: values.case });
  console.log(JSON.stringify(report));
  process.exit(status);
}
