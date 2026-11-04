import { installIpc } from '../ipc';

export class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
  removeItem(key: string) { this.values.delete(key); }
}

const isolationTrace: { commands: string[]; denied: string[]; network: string[] } = { commands: [], denied: [], network: [] };
let isolated: MemoryStorage | null = null;
export function beginDemoIsolation() {
  if (isolated) return isolated;
  const storage = new MemoryStorage();
  isolated = storage;
  for (const target of new Set([window, globalThis])) {
    Object.defineProperty(target, 'localStorage', { configurable: true, value: storage });
    Object.defineProperty(target, 'sessionStorage', { configurable: true, value: new MemoryStorage() });
  }
  const trace = isolationTrace;
  Object.assign(window, { terminusDemoTrace: trace });
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input), location.href);
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
    if (url.origin !== location.origin || !url.pathname.startsWith(`${import.meta.env.BASE_URL}assets/`) || !['GET', 'HEAD'].includes(method)) {
      trace.network.push(url.pathname); throw new Error('demo_read_only');
    }
    return originalFetch(input, init);
  };
  const blockedSocket = class { constructor(url: string | URL) { trace.network.push(String(url)); throw new Error('demo_read_only'); } };
  Object.assign(window, { WebSocket: blockedSocket, EventSource: blockedSocket, XMLHttpRequest: blockedSocket });
  Object.defineProperty(navigator, 'sendBeacon', { configurable: true, value: (url: string) => { trace.network.push(String(url)); throw new Error('demo_read_only'); } });
  return storage;
}

export function installDemo(labels: { workspace: string; space: string; folder: string; task: string; answer: string; denied: string }, options: { dark: boolean; ordinary: boolean }) {
  const storage = beginDemoIsolation();
  storage.setItem('harness:apariencia', options.dark ? 'oscuro' : 'claro');
  storage.setItem('harness.layout.sidebar.view.demo-workspace', JSON.stringify({group:'none'}));
  storage.setItem('harness.layout.space.demo-workspace', JSON.stringify('demo-space'));
  storage.setItem('harness.layout.pestanas.demo-workspace.demo-space', JSON.stringify({abiertas:[{clase:'tarea',id:'demo-task',session:'demo-task',project:'demo-folder',titulo:labels.task}],activa:'demo-task'}));
  const trace = isolationTrace;
  const workspace = { id: 'demo-workspace', name: labels.workspace, context_root: null, lengua: null, lengua_de_salida: null, terminal_theme: null, worktrees_root: null, default_permission_mode: null, git_host: null, remote: null, memoria: { tipo: 'local' }, created_at: 0, sessions: 1, logo: null };
  const project = { id: 'demo-folder', name: labels.folder, node: null, sources: [], created_at: 0, updated_at: 0, sessions: 1, kind: 'folder', working_directory: null };
  const task = { id: 'demo-task', title: labels.task, last_message: labels.answer, provider: 'codex', model: 'gpt-5.6', refs: [], updated_at: 0, turns: 1, parent: null, esperando: false, archived: false, space: 'demo-space' };
  const agent = { name: 'atencion-demo', description: labels.answer, instructions: '', tools: [], model: null, origin: '', folder: null, providers: ['codex'], own: true, own_scope: { kind: 'workspace' } };
  const profile = {display_name:null,body:null,background:null,avatar:null,veil:0.82,provider:null,model:null,effort:null,hidden:false};
  const replies: Record<string, unknown> = {
    get_project_directory: "/demo", get_profile: {name: labels.workspace, account_name: null}, source_freshness: [],
    launcher_state: { phase: 'ready', blank_0274: false }, setup_required: false,
    workspaces_startup: { workspaces: [workspace], active: workspace.id, migrations: [] }, list_workspaces: { workspaces: [workspace], active: workspace.id, migrations: [] },
    list_projects: [project], list_spaces: [{ id: 'demo-space', name: labels.space, folders: [project.id], created_at: 0, updated_at: 0 }, { id: 'demo-space-alt', name: labels.folder, folders: [], created_at: 0, updated_at: 0 }],
    list_sources: [], list_live_sessions: [task], list_workspace_attention: [], list_live_turns: [],
    list_agents: { agents: [agent], rechazados: [] }, list_agent_profiles: { 'atencion-demo': profile }, list_agent_status: [{ name: agent.name, status: 'asleep', live_tasks: 0, minutes_since_last_turn: null }],
    list_providers: [{id:'codex',label:'Codex',available:true,driver:true}], list_surfaces: [{id:'codex',provider:'codex',label:'Codex',catalogo:'todo',usable:true,marca:null,porque:null}],
    list_models: { provider:'codex', models:[{id:'gpt-5.6',label:'GPT-5.6',gratis:null,efforts:[],default_effort:null}], fallback:false },
    list_mentions: {fuentes:[],archivos:[]}, list_task_trees: [], list_permissions: [], list_questions: [], load_queue: [], list_language_packs: [], list_bundled_language_packs: [],
    load_session: { id:task.id, provider:'codex',sources:[],model:'gpt-5.6',effort:null,permission_mode:null,turns:[{role:'user',text:labels.task},{role:'assistant',text:labels.answer}] },
    task_history:{history:{archived:false,events:[],recovery:null},branch:null,path:null,available:true,owned:false,restorable:false,incomplete:false},
    session_usage:null, workspace_usage:null, session_folder:null, list_session_git: [], list_task_git_status: [], list_machine_agents: {own:[{agent,profile,folders:[project.id],all_folders:true,blocked:[],catalog_taken:null}],repository:[]},
    list_integrations:{workspace:workspace.id,plugins:[]}, list_skills:{skills:[],errors:[]}, list_mcp_servers:[], list_known_mcp:[], list_mcp_providers:[], account_credentials_list:{credentials:[],machines:[]}, list_accounts:{provider:'codex',env_var:'',shared_credential:null,secret_note:null,accounts:Array.from({length:5},(_,i)=>({id:`demo-account-${i}`,label:`Cuenta ${i+1}`,created_at:i,email:null})),active:'demo-account-0'}, tasks_awaiting_quota:[], account_status:{id:'demo-account-0',authenticated:true,detail:'sesión iniciada'}, account_limits:{mode:'read',windows:[{label:'esta semana',used_pct:40,resets_at:null}],at:0}, list_provider_logins:[],
    update_pending:false, app_version:'alfa-demo', service_poll:{cursor:0,gap:false,replay:false,runtime:'demo',reset:false},
  };
  const local = new Set(['window_ready','window_vitals','window_background','plugin:event|listen','plugin:event|unlisten']);
  installIpc(window, { handle: async (command) => {
    trace.commands.push(command);
    if (Object.hasOwn(replies, command)) return structuredClone(replies[command]);
    if (local.has(command)) return null;
    trace.denied.push(command);
    throw { clave: 'web.alpha.demo_denied', message: labels.denied, detail: 'demo_read_only' };
  } });
  return storage;
}
