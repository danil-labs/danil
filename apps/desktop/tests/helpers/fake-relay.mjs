/**
 * A Danil Machines relay simulated in Node for the browser build: one session
 * socket per connection, answering `call` from a table of engine replies.
 */
const row = (id) => ({ id, title: `Tarea ${id}`, last_message: "", provider: "codex", model: "gpt-5.6", refs: [], updated_at: 0, turns: 0, parent: null, esperando: false });

export const engine = {
  setup_required: false,
  check_environment: { ready: true, blocked: false, reason: null, items: [] },
  list_providers: [{ id: "codex", label: "Codex", available: true, driver: true }],
  list_workspaces: { workspaces: [{ id: "w", name: "W", context_root: null }], active: "w" },
  workspaces_startup: { workspaces: [{ id: "w", name: "W", context_root: null }], active: "w" },
  list_projects: [{ id: "p1", name: "P1", working_directory: "/lab/p1", kind: "git", portfolio: null, sources: [] }],
  list_portfolios: [],
  list_sources: [],
  list_live_sessions: ({ project }) => (project === "" || project === "p1" ? ["t1"].map(row) : []),
  list_agents: { agents: [], rechazados: [] },
  list_agent_status: [],
  list_mentions: { fuentes: [], archivos: [] },
  list_models: { provider: "codex", models: [{ id: "gpt-5.6", label: "GPT-5.6", gratis: null, note: null, efforts: [], default_effort: null }], fallback: false },
  list_surfaces: [{ id: "codex", provider: "codex", label: "Codex", catalogo: "todo", usable: true, marca: null, porque: null }],
  session_folder: "/tmp",
  list_task_trees: [],
  task_history: { history: { archived: false, events: [], recovery: null }, branch: null, path: "/lab", available: true, owned: false, restorable: false, recreatable: false, incomplete: false },
  list_live_turns: [],
  list_active_turns: [],
  load_queue: [],
  save_queue: null,
  session_usage: null,
  list_session_git: {},
  load_session: ({ id }) => ({ id, provider: "codex", sources: [], model: "gpt-5.6", effort: null, permission_mode: null, turns: [] }),
};

/** One relay session socket per connection, speaking protocol v1 to the page. */
/** The relay's wake list (protocol v1): only these start an off computer. */
const INTENT = new Set(["send_message", "inject_message", "create_project", "create_agent", "add_account", "login_account", "submit_login_code", "respond_permission", "answer_question", "answer_shell_output", "run_shell_command", "queue_ready", "resume_awaiting_quota", "recreate_task_work", "add_workspace", "radiant_login", "materialize_workspace", "ensure_project"]);

/**
 * `cachedAt`: with the computer off, the relay answers every known read from its copy of that time.
 * `table`: this computer's engine replies; `outdated`: its engine speaks another contract;
 * `notStartable`: the person's own machine, which the relay refuses to start.
 * `delay`: milliseconds before an online computer answers.
 * `contract`: the engine's, from its last `hello`; a session that sent other `contracts` gets `version_mismatch`.
 */
export function relay({ state: initial = "online", wakeAfter = 300, cachedAt = null, table = engine, outdated = false, notStartable = false, delay: initialDelay = 0, contract: initialContract = null } = {}) {
  let delay = initialDelay;
  let contract = initialContract;
  const auths = [];
  const sockets = [];
  const calls = [];
  const subscriptions = [];
  let state = initial;
  const push = (message) => {
    for (const s of sockets) if (s.readyState === 1) s.onmessage?.({ data: JSON.stringify(message) });
  };
  class Socket {
    constructor(url, protocols) {
      Object.assign(this, { url, protocols, readyState: 0, onopen: null, onmessage: null, onclose: null, onerror: null });
      sockets.push(this);
      setTimeout(() => {
        this.readyState = 1;
        this.onopen?.({});
        push({ type: "state", state });
        if (contract) this.onmessage?.({ data: JSON.stringify({ type: "engine", contract, host_version: null }) });
      }, 0);
    }
    send(data) {
      const m = JSON.parse(data);
      if (m.type === "subscribe") subscriptions.push(m.after);
      if (m.type === "auth") {
        auths.push(m.token);
        return void setTimeout(() => this.onmessage?.({ data: JSON.stringify({ type: "auth", expires_at: new Date(Date.now() + 600_000).toISOString() }) }), 0);
      }
      if (m.type !== "call") return;
      calls.push(m);
      const spoken = new URL(this.url.replace(/^ws/, "http")).searchParams.get("contracts");
      if (spoken && contract && !spoken.split(",").includes(contract)) {
        const refused = { type: "result", id: m.id, error: { code: "version_mismatch", detail: { engine: contract, supported: spoken.split(",") } } };
        return void setTimeout(() => this.readyState === 1 && this.onmessage?.({ data: JSON.stringify(refused) }), 0);
      }
      const respond = () => {
        const answer = table[m.command];
        const reply = outdated
          ? { type: "result", id: m.id, error: { code: "version_mismatch" } }
          : answer === undefined
          ? { type: "result", id: m.id, error: { code: "command" } }
          : { type: "result", id: m.id, value: typeof answer === "function" ? answer(m.args, m) : answer };
        if (reply.value instanceof Promise) {
          void reply.value.then((value) => {
            if (this.readyState === 1) this.onmessage?.({ data: JSON.stringify({ ...reply, value }) });
          });
          return;
        }
        if (this.readyState === 1) this.onmessage?.({ data: JSON.stringify(reply) });
      };
      if (state === "online") return void setTimeout(respond, delay);
      if (!INTENT.has(m.command) && cachedAt && table[m.command] !== undefined) {
        const answer = table[m.command];
        const value = typeof answer === "function" ? answer(m.args, m) : answer;
        const reply = { type: "result", id: m.id, value, cached: { updated_at: cachedAt } };
        return void setTimeout(() => this.readyState === 1 && this.onmessage?.({ data: JSON.stringify(reply) }), 0);
      }
      if (!INTENT.has(m.command)) {
        const off = { type: "result", id: m.id, error: { code: "machine_off" } };
        return void setTimeout(() => this.readyState === 1 && this.onmessage?.({ data: JSON.stringify(off) }), 0);
      }
      if (notStartable) {
        const refused = { type: "result", id: m.id, error: { code: "not_remotely_startable" } };
        return void setTimeout(() => this.readyState === 1 && this.onmessage?.({ data: JSON.stringify(refused) }), 0);
      }
      // An intent starts the computer and is delivered once it says hello.
      setState("starting");
      setTimeout(() => {
        setState("online");
        respond();
      }, wakeAfter);
    }
    close(code = 1000, reason = "") {
      this.readyState = 3;
      setTimeout(() => this.onclose?.({ code, reason }), 0);
    }
  }
  function setState(next) {
    state = next;
    push({ type: "state", state });
  }
  const drop = (code, reason = "") => {
    for (const s of sockets) if (s.readyState === 1) s.close(code, reason);
  };
  /** `delay`: how long an online computer takes to answer; a long one is a machine that does not answer. */
  const setDelay = (ms) => {
    delay = ms;
  };
  /** A new `hello` of the engine with `next`: every session hears `engine`. */
  const hello = (next) => {
    contract = next;
    push({ type: "engine", contract, host_version: null });
  };
  return { Socket, sockets, calls, subscriptions, auths, push, drop, setState, setDelay, hello };
}


/** Several computers behind one relay origin: each session socket reaches the computer in its URL. */
export function fleet(computers) {
  const relays = Object.fromEntries(Object.entries(computers).map(([id, options]) => [id, relay(options)]));
  class Socket {
    constructor(url, protocols) {
      const id = decodeURIComponent(/\/v1\/computers\/([^/]+)\/session/.exec(url)?.[1] ?? "");
      const target = relays[id];
      if (!target) throw new Error(`no fake computer ${id}`);
      return new target.Socket(url, protocols);
    }
  }
  return { Socket, relays };
}
