/**
 * La memoria versionada del plano de control (computers, `/v1/workspaces/:id/memory/*`)
 * simulada en memoria: commits lineales con la foto entera de archivos y la misma
 * regla de conflicto que el Worker (gana la escritura, la versión pisada queda en
 * `<base>.conflicto-<autor>.md`; un borrado contra otra versión responde 409).
 *
 * Se instala envolviendo `globalThis.fetch` (después de `boot`, que pone el suyo):
 * las demás URLs siguen su camino.
 */
import { createHash } from "node:crypto";

export const oidOf = (content) => createHash("sha1").update(`blob ${Buffer.byteLength(content)}\0${content}`).digest("hex");

const slug = (text) =>
  (text ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "anterior";

export function fakeMemoryWorker({ endpoint = "https://memory.test", workspace = "w1", token } = {}) {
  const commits = [];
  const requests = [];
  let busy = false;
  let n = 0;

  const head = () => commits.at(-1) ?? null;
  const filesAt = (ref) => (ref === "main" || !ref ? head()?.files : commits.find((c) => c.commit === ref)?.files) ?? null;

  function commit(files, message, author) {
    n += 1;
    const c = { commit: n.toString(16).padStart(40, "0"), message, author, at: new Date(Date.UTC(2026, 9, 20, 10, n)).toISOString(), files };
    commits.push(c);
    return c.commit;
  }

  /** Un commit de una computadora (push directo al repo). */
  function push(path, content, author = { name: "Mac de Ana", email: "ana@mac" }, message = `memory: ${path}`) {
    const files = new Map(head()?.files ?? []);
    if (content === null) files.delete(path);
    else files.set(path, content);
    return commit(files, message, author);
  }

  function lastAuthor(path) {
    for (let i = commits.length - 1; i >= 0; i -= 1) {
      if (commits[i].files.get(path) !== commits[i - 1]?.files.get(path)) return commits[i].author;
    }
    return null;
  }

  function history(path) {
    const out = [];
    let previous;
    for (const c of commits) {
      const now = c.files.get(path);
      if (now !== previous) out.unshift({ commit: c.commit, message: c.message, author: c.author, at: c.at, oid: now === undefined ? null : oidOf(now) });
      previous = now;
    }
    return out;
  }

  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const fail = (status, code, extra = {}) => json({ error: { code }, ...extra }, status);

  async function handle(request) {
    const url = new URL(request.url);
    const m = /^\/v1\/workspaces\/([^/]+)\/memory\/(files|file|history|log)$/.exec(url.pathname);
    if (!m) return null;
    const auth = request.headers.get("authorization");
    requests.push({ method: request.method, path: `${url.pathname}${url.search}`, auth, body: request.method === "PUT" ? await request.clone().json() : null });
    if (token && auth !== `Bearer ${token}`) return fail(401, "unauthorized");
    if (decodeURIComponent(m[1]) !== workspace) return fail(404, "not_found");
    const action = m[2];
    const path = url.searchParams.get("path");
    if (action === "files") {
      const files = filesAt(url.searchParams.get("ref") ?? "main");
      if (!files) return json({ commit: null, files: [] });
      return json({ commit: head().commit, files: [...files].sort(([a], [b]) => a.localeCompare(b)).map(([p, c]) => ({ path: p, oid: oidOf(c) })) });
    }
    if (action === "history") return json({ path, versions: history(path) });
    if (action === "log") return json({ commits: [...commits].reverse().map(({ files: _f, ...c }) => c) });
    if (request.method === "GET") {
      const ref = url.searchParams.get("ref") ?? "main";
      const content = filesAt(ref)?.get(path);
      return content === undefined ? fail(404, "not_found") : json({ path, ref, oid: oidOf(content), content });
    }
    if (busy) return fail(503, "memory_busy");
    const files = new Map(head()?.files ?? []);
    const body = request.method === "PUT" ? await request.json() : null;
    const target = body?.path ?? path ?? "";
    const current = files.has(target) ? oidOf(files.get(target)) : null;
    if (request.method === "DELETE") {
      if (current === null) return fail(404, "not_found");
      if (current !== url.searchParams.get("base")) return fail(409, "memory_conflict", { current });
      files.delete(path);
      return json({ status: "deleted", commit: commit(files, `memory: delete ${path} (web)`, { name: "Ana", email: "ana@danil.ai" }), path });
    }
    let copy = null;
    if (current !== null && current !== body.base) {
      const who = lastAuthor(body.path)?.name ?? "anterior";
      const stem = body.path.slice(0, -3);
      copy = `${stem}.conflicto-${slug(who)}.md`;
      for (let i = 2; files.has(copy); i += 1) copy = `${stem}.conflicto-${slug(who)}-${i}.md`;
      files.set(copy, files.get(body.path));
    }
    files.set(body.path, body.content);
    const id = commit(files, `memory: edit ${body.path} (web)`, { name: "Ana", email: "ana@danil.ai" });
    return json({ status: "written", commit: id, path: body.path, conflict_copy: copy, changed: true });
  }

  const previous = globalThis.fetch;
  const wrapped = async (input, init) => {
    const request = new Request(input, init);
    if (request.url.startsWith(endpoint)) {
      const answer = await handle(request);
      if (answer) return answer;
    }
    return previous(input, init);
  };
  wrapped.__jsdomApp = previous.__jsdomApp;
  globalThis.fetch = wrapped;

  return {
    push,
    requests,
    files: () => head()?.files ?? new Map(),
    setBusy: (v) => {
      busy = v;
    },
    restore: () => {
      globalThis.fetch = previous;
    },
  };
}
