/** Se inyecta en la página antes de la app: el puente de Tauri contra un motor de mentira, con turnos deterministas. */
export function backend(options) {
  const { turns: count, turnBytes = 500, pageTurns = 50, latencyMs = 0, activeEveryMs = 0, failOlder = false, tasks = 1, visuals = 0 } = options;
  const lorem = (n, seed) => {
    const words = ["alfa", "ventana", "turno", "hilo", "motor", "tarea", "página", "medida", "ancla", "lectura"];
    let text = "";
    for (let k = seed; text.length < n; k++) text += words[(k * 7) % words.length] + " ";
    return text;
  };
  const taskIds = Array.from({ length: tasks }, (_, n) => `lab-${n}`);
  const store = new Map();
  const turn = (id, i) => i % 2 === 0
    ? { role: "user", id: `${id}-t${i}`, at: 1_700_000_000_000 + i * 60_000, text: `Pregunta ${i} de ${id}` }
    : { role: "agent", id: `${id}-t${i}`, at: 1_700_000_000_000 + i * 60_000, model: "gpt-5.6",
        tools: i % 4 === 1 ? [{ name: "Read", target: `src/file${i}.ts`, ok: true }] : [],
        text: `Respuesta ${i} de ${id}. ${lorem(turnBytes * (1 + (i * 13) % 5) / 3, i)}\n\n- uno\n- dos ${i % 3 === 0 ? `\n\n\`\`\`ts\nconst a${i} = ${i};\n\`\`\`` : ""}` };
  const withVisual = (id, i) => {
    const row = turn(id, i);
    if (visuals && row.role === "agent" && i % visuals === 1) row.text += `\n\n::terminus-visual{file="v${i}.html" title="Visual ${i}"}\n`;
    return row;
  };
  for (const id of taskIds) store.set(id, Array.from({ length: count }, (_, i) => withVisual(id, i)));
  const visualHtml = (file) => `<!doctype html><html><body><div style="height:${240 + (file.length * 37) % 200}px;background:#ddd">${file}</div></body></html>`;
  let visualReads = 0;
  let writes = 1, failing = failOlder, reads = 0;
  const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
  const row = (id) => ({ id, title: `Tarea ${id}`, last_message: "", provider: "codex", model: "gpt-5.6", refs: [], updated_at: writes, turns: store.get(id).length, parent: null, esperando: false });
  const folder = { id: "p", name: "P", working_directory: "/lab/p", kind: "git", portfolio: null, sources: [] };
  const fresh = (value) => structuredClone(value);
  async function page({ id, before: direct, history_request: request }) {
    const before = request?.before ?? direct;
    const all = store.get(id);
    if (before !== null && before !== undefined) {
      reads++;
      if (failing) throw { what: "lab_offline", detail: "lab_offline" };
    }
    if (latencyMs) await sleep(latencyMs);
    const end = Math.min(before ?? all.length, all.length);
    const start = Math.max(0, end - pageTurns);
    return fresh({ id, provider: "codex", sources: [], model: "gpt-5.6", effort: null, permission_mode: null, turns: all.slice(start, end),
      history: { version: 1, revision: `r${writes}`, total: all.length, start, end, limit: pageTurns, has_more: start > 0 } });
  }
  const responses = {
    window_ready: null, window_vitals: null, setup_required: false,
    list_providers: [{ id: "codex", label: "Codex", available: true, driver: true }],
    list_workspaces: { workspaces: [{ id: "w", name: "W", context_root: null }], active: "w" },
    workspaces_startup: { workspaces: [{ id: "w", name: "W", context_root: null }], active: "w" },
    list_projects: () => [fresh(folder)],
    list_portfolios: [], list_sources: [],
    list_live_sessions: ({ project }) => (project === "" || project === "p" ? taskIds.map(row) : []),
    list_agents: { agents: [], rechazados: [] }, list_agent_status: [],
    list_mentions: { fuentes: [], archivos: [] },
    list_models: { provider: "codex", models: [{ id: "gpt-5.6", label: "GPT-5.6", gratis: null, note: null, efforts: [], default_effort: null }], fallback: false },
    list_surfaces: [{ id: "codex", provider: "codex", label: "Codex", catalogo: "todo", usable: true, marca: null, porque: null }],
    session_folder: "/tmp", list_task_trees: [], watch_task_tree: "watch", unwatch_task_tree: null,
    list_live_turns: [], list_active_turns: [],
    service_poll: { cursor: 0, gap: false, replay: false, runtime: "lab", reset: false },
    task_history: { history: { archived: false, events: [], recovery: null }, branch: null, path: "/lab", available: true, owned: false, restorable: false, recreatable: false, incomplete: false },
    load_session: page, load_history: page,
    chat_visual_part: () => { throw { what: "lab", detail: "unknown_command" }; },
    tree_show: ({ path }) => {
      visualReads++;
      const text = visualHtml(path);
      return { kind: "text", text, bytes: new TextEncoder().encode(text).byteLength, truncated: false };
    },
    load_queue: [], save_queue: null, session_usage: null, list_session_git: {},
    send_message: (a) => a.session, inject_message: null,
    check_environment: { ready: true, blocked: false, reason: null, items: [] },
  };
  const callbacks = new Map(), events = new Map();
  let lastId = 0;
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: (event, id) => { callbacks.delete(events.get(event)?.get(id)); events.get(event)?.delete(id); } };
  window.__TAURI_INTERNALS__ = {
    transformCallback: (callback) => { const id = ++lastId; callbacks.set(id, callback); return id; },
    convertFileSrc: (path) => path,
    metadata: { currentWindow: { label: "main" }, currentWebview: { windowLabel: "main", label: "main" } },
    invoke: async (command, args) => {
      if (command === "plugin:event|listen") {
        const id = ++lastId;
        events.set(args.event, (events.get(args.event) ?? new Map()).set(id, args.handler));
        return id;
      }
      if (command.startsWith("plugin:")) return 1;
      if (command in responses) {
        const response = responses[command];
        return typeof response === "function" ? response(args) : response;
      }
      throw new Error(`sin stub: ${command}`);
    },
  };
  const emit = (event, payload) => {
    for (const handler of events.get(event)?.values() ?? []) callbacks.get(handler)?.({ event, id: 0, payload });
  };
  const open = (id) => emit("cli-open-task", { workspace: "w", folder: "p", task: id, operation: "lab" });
  const append = (id = taskIds[0]) => {
    const all = store.get(id);
    all.push(turn(id, all.length));
    writes++;
    emit("session", { workspace: "w", project: "p", session: id, id });
    emit("chat", { session: id, kind: "segment_saved", workspace: "w" });
  };
  window.lab = {
    append, heal: () => { failing = false; },
    openFirst: () => open(taskIds[0]), openOther: () => open(taskIds[1]),
    total: () => store.get(taskIds[0]).length, reads: () => reads, visualReads: () => visualReads,
    stream: (pieces) => {
      let n = 0;
      emit("chat", { session: taskIds[0], kind: "started", workspace: "w" });
      const timer = setInterval(() => {
        emit("chat", { session: taskIds[0], kind: "delta", text: `palabra${n} `, workspace: "w" });
        if (++n >= pieces) clearInterval(timer);
      }, 16);
    },
  };
  if (activeEveryMs) setInterval(() => append(), activeEveryMs);
}
