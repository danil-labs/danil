import { batch, createEffect, createMemo, createSignal, on, onCleanup, onMount, untrack } from "solid-js";
import type { Agent, AgentModels, ModoDePermiso } from "../../../../apps/desktop/src/lib/model.ts";
import { type CatalogosDeModelos, effortAlCambiarDeModelo, type OpcionDeModelo } from "../../../../apps/desktop/src/lib/models.ts";
import type { CliCommand, Skill, SlashMenu } from "../../../../apps/desktop/src/lib/skills.ts";
import { esDe, paraElMenu, type Superficie, superficieDe } from "../../../../apps/desktop/src/lib/surfaces.ts";
import { modoInicial, modoRecordado, recordarModo } from "../../chat/src/index.ts";
import { OPENCODE } from "../../../tasks/src/agents.ts";

type Invoke = <T>(command: string, args?: Record<string, unknown>, options?: { headers: Record<string, string> }) => Promise<T>;
export type ComposerConfiguration = { agent: string; surface: string; model: string; effort: string; mode?: string };
type DraftSelection = { configuration?: ComposerConfiguration; provider?: { from: string; to: string } };
type Scope = { workspace: () => string | null; machine: () => string | null; machineOn: () => boolean | undefined; connected: () => boolean; session: () => string | null };

/** Owns the composer selection and the catalogs that make it executable. Task sending owns persistence. */
export function createComposerStore(deps: {
  invoke: Invoke;
  withLastAnswer: <T>(machine: string | null, key: string, read: () => Promise<T>) => Promise<T>;
  scope: Scope;
  workspaceMode: () => string | null;
  draftConfiguration: () => ComposerConfiguration | undefined;
}) {
  const { invoke, withLastAnswer } = deps;
  const composerMachine = deps.scope.machine;
  const workspaceActivo = deps.scope.workspace;
  const connected = deps.scope.connected;
  const sessionId = deps.scope.session;
  const workspaceMode = deps.workspaceMode;
  const borrador = () => ({ configuration: deps.draftConfiguration() });
  let disposed = false;
  let installed = false;
  const [agents, setAgents] = createSignal<Agent[]>([]);
  const [agent, setAgent] = createSignal("claude");
  const [superficies, setSuperficies] = createSignal<Superficie[] | null>(null);
  const [superficie, setSuperficie] = createSignal("");
  const [catalogos, setCatalogos] = createSignal<CatalogosDeModelos>({});
  const models = createMemo(() => catalogos()[agent()] ?? null);
  const modelosParaAgentes = createMemo(() => ({
    superficies: superficies() ?? [],
    catalogos: catalogos(),
  }));
  const [model, setModel] = createSignal("");
  const [effort, setEffort] = createSignal("");
  const [modo, setModo] = createSignal("");
  const [modos, setModos] = createSignal<ModoDePermiso[]>([]);
  const [skills, setSkills] = createSignal<Skill[]>([]);
  const [cliCommands, setCliCommands] = createSignal<CliCommand[]>([]);
  const [sideCommand, setSideCommand] = createSignal<string | null>(null);
  const options = () => {
    const machine = composerMachine(), workspace = workspaceActivo();
    return { headers: {
      ...(machine && machine !== "local" ? { "x-terminus-machine": machine } : {}),
      ...(workspace ? { "x-terminus-workspace": workspace } : {}),
    } };
  };
  let composerRevision = 0;
  const catalogosEnVuelo = new Map<string, Promise<void>>();
  const cargarComandos = (a: string) => {
    if (disposed) return;
    const revision = composerRevision;
    const poner = (menu: SlashMenu) => {
      if (a !== agent() || disposed || revision !== composerRevision) return;
      setCliCommands(menu.commands);
      setSkills(menu.skills);
      setSideCommand(menu.side_question ?? null);
    };
    void invoke<SlashMenu>("list_slash_menu", { provider: a }, options())
      .then(poner)
      .catch(() => poner({ commands: [], skills: [] }));
  };
  function cargarModelos(a: string, forzar = false) {
    if (disposed) return Promise.resolve();
    if (!forzar && untrack(() => catalogos()[a])) return Promise.resolve();
    const yaVa = catalogosEnVuelo.get(a);
    if (yaVa) return yaVa;
    const revision = composerRevision;
    const machine = composerMachine(), routed = options();
    const pedido = withLastAnswer(machine, `list_models:${a}`, () => invoke<AgentModels>("list_models", { provider: a }, routed))
      .then((catalogo) => {
        if (disposed || revision !== composerRevision) return;
        setCatalogos((actuales) => ({ ...actuales, [a]: catalogo }));
        if (a !== agent()) return;
        const actual = superficies()?.find((s) => s.id === superficie());
        const disponibles = catalogo.models.filter((m) => esDe(actual, m));
        if (
          disponibles.length > 0 &&
          !disponibles.some((m) => m.id === model())
        ) {
          setModel(disponibles[0].id);
        }
      })
      .catch(() => {
        if (disposed || revision !== composerRevision) return;
        setCatalogos((actuales) => ({ ...actuales, [a]: null }));
      })
      .finally(() => {
        if (catalogosEnVuelo.get(a) === pedido) catalogosEnVuelo.delete(a);
      });
    catalogosEnVuelo.set(a, pedido);
    return pedido;
  }
  async function cargarSuperficies(inicial: boolean) {
    if (disposed) return;
    const revision = composerRevision;
    try {
      const machine = composerMachine(), routed = options();
      const s = await withLastAnswer(machine, "list_surfaces", () => invoke<Superficie[]>("list_surfaces", {}, routed));
      if (disposed || revision !== composerRevision) return;
      const primera = s.find((x) => x.usable);
      batch(() => {
        setSuperficies(s);
        if (!inicial || sessionId()) return;
        setSuperficie(primera?.id ?? "");
        if (!primera) {
          setModel("");
          setEffort("");
        } else if (primera.provider !== agent()) {
          setAgent(primera.provider);
          setModel("");
          setEffort("");
        }
      });
      const agentes = new Set(
        s.filter((x) => x.usable || x.provider === agent()).map((x) => x.provider),
      );
      await Promise.all([...agentes].map((a) => cargarModelos(a, !inicial)));
    } catch {
      if (disposed || revision !== composerRevision) return;
      setSuperficies([]);
    }
  }
  function startWithWorkspaceMode() {
    if (disposed) return;
    const mode = workspaceMode();
    if (!mode || sessionId() || borrador().configuration?.mode) return;
    const list = modos();
    setModo(list.some((m) => !m.falta) ? modoInicial(list, mode) : mode);
  }
  const menuDeSuperficies = () => {
    const todas = superficies();
    return todas && paraElMenu(todas, superficie());
  };
  function restoreDraft(configuration?: ComposerConfiguration) {
    if (!configuration || disposed) return;
    batch(() => {
      setAgent(configuration.agent); setSuperficie(configuration.surface);
      setModel(configuration.model); setEffort(configuration.effort);
      if (configuration.mode) setModo(configuration.mode);
    });
  }
  function restoreSessionDraft(draft: DraftSelection, session?: { provider?: string | null }) {
    if (disposed) return;
    batch(() => {
      if (draft.configuration) {
        setModel(draft.configuration.model); setEffort(draft.configuration.effort);
        if (draft.configuration.mode) setModo(draft.configuration.mode);
      }
      if (draft.provider && (!session || session.provider === draft.provider.from)) setAgent(draft.provider.to);
    });
  }
  function useProfile(profile: { provider?: string | null; model?: string | null; effort?: string | null }) {
    if (disposed) return;
    batch(() => { if (profile.provider) setAgent(profile.provider); if (profile.model) setModel(profile.model); if (profile.effort) setEffort(profile.effort); });
  }
  function resumeTask(selection: { provider: string; model: string; effort: string; mode?: string }) {
    if (disposed) return;
    batch(() => { setAgent(selection.provider); setModel(selection.model); setEffort(selection.effort); if (selection.mode !== undefined) setModo(selection.mode); });
  }
  function runtimeFact(fact: { kind: "model" | "effort" | "mode"; value: string }) {
    if (disposed) return;
    if (fact.kind === "model") setModel(fact.value); else if (fact.kind === "effort") setEffort(fact.value); else setModo(fact.value);
  }
  function selectModel(choice: OpcionDeModelo) {
    const level = effortAlCambiarDeModelo(effort(), choice.model);
    if (!disposed) batch(() => { setSuperficie(choice.superficie); setAgent(choice.agent); setModel(choice.model.id); setEffort(level); });
    return level;
  }
  async function refreshProviders() {
    if (disposed) return;
    try { const rows = await invoke<Agent[]>("list_providers"); if (!disposed) setAgents(rows); }
    catch { /* A transient provider probe keeps the last known installation list. */ }
  }
  async function prepareCredits(prepare: (headers: Record<string, string>) => Promise<unknown>) {
    if (disposed) return;
    const revision = composerRevision, routed = options();
    await prepare(routed.headers);
    if (disposed || revision !== composerRevision) return;
    await cargarSuperficies(false);
    if (disposed || revision !== composerRevision) return;
    await cargarModelos(OPENCODE, true);
  }
  function installEffects() {
    if (installed || disposed) return;
    installed = true;
  createEffect(on([composerMachine, workspaceActivo], () => {
    if (disposed) return;
    composerRevision++;
    catalogosEnVuelo.clear();
    batch(() => {
      setCatalogos({});
      setSuperficies(null);
    });
    if (connected() && workspaceActivo()) void cargarSuperficies(false);
  }, { defer: true }));
  createEffect(on(deps.scope.machineOn, (encendida, antes) => {
    if (encendida && antes === false && connected() && workspaceActivo()) void cargarSuperficies(false);
  }, { defer: true }));

  createEffect(on(agent, (a) => void cargarModelos(a)));
  createEffect(
    on([agent, composerMachine, workspaceActivo], ([a]) => {
      if (disposed) return;
      const revision = composerRevision;
      if (!a) {
        setModos([]);
        return;
      }
      void invoke<ModoDePermiso[]>("list_permission_modes", { provider: a }, options())
        .then((lista) => {
          if (a !== agent() || disposed || revision !== composerRevision) return;
          batch(() => {
            setModos(lista);
            const puede = lista.filter((m) => !m.falta);
            if (!puede.some((m) => m.id === modo())) {
              setModo(modoInicial(lista, workspaceMode() ?? modoRecordado()));
            }
          });
        })
        .catch(() => { if (!disposed && revision === composerRevision) setModos([]); });
    }),
  );

  createEffect(on(workspaceMode, startWithWorkspaceMode, { defer: true }));

  createEffect(
    on([superficies, agent, model, models, sessionId], ([sups, a, m, cat, sesion]) => {
      if (disposed || !sups) return;
      if (!sesion) {
        const elegida = sups.find((s) => s.id === superficie());
        if (!elegida?.usable) {
          const primera = sups.find((s) => s.usable);
          batch(() => {
            setSuperficie(primera?.id ?? "");
            if (primera && primera.provider !== a) {
              setAgent(primera.provider);
              setModel("");
              setEffort("");
            }
          });
          return;
        }
      }
      const id = superficieDe(sups, a, m, cat?.models ?? [], superficie());
      if ((id ?? "") !== superficie()) setSuperficie(id ?? "");
    }),
  );
  createEffect(
    on([superficie, superficies, models], ([id, sups, cat]) => {
      if (disposed) return;
      const s = sups?.find((x) => x.id === id);
      const lista = (cat?.models ?? []).filter((m) => esDe(s, m));
      if (lista.length === 0) return;
      if (!lista.some((m) => m.id === model())) setModel(lista[0].id);
    }),
  );
  onMount(() => {
    const refrescar = () => {
      void cargarSuperficies(false);
    };
    window.addEventListener("harness:consentimiento", refrescar);
    onCleanup(() => window.removeEventListener("harness:consentimiento", refrescar));
  });
  createEffect(on([agent, composerMachine, workspaceActivo], ([a]) => cargarComandos(a)));

  }
  return {
    agents, agent, superficies, superficie, catalogos, models, modelosParaAgentes, model, effort, modo, modos, skills, cliCommands, sideCommand,
    menu: menuDeSuperficies, options, installEffects, refreshProviders, prepareCredits, startNewDraft: startWithWorkspaceMode,
    refreshSurfaces: cargarSuperficies, refreshCommands: cargarComandos, readModels: cargarModelos,
    snapshot: (): ComposerConfiguration => ({ agent: agent(), surface: superficie(), model: model(), effort: effort() }),
    effortForTurn: () => effort() || models()?.models.find(option => option.id === model())?.default_effort || null,
    restoreDraft, restoreSessionDraft, useProfile, resumeTask, runtimeFact, selectModel,
    chooseEffort: (id: string) => { if (!disposed) setEffort(id); },
    chooseMode: (id: string) => { if (!disposed) { recordarModo(id); setModo(id); } },
    unavailable: () => { if (!disposed) setSuperficies([]); },
    dispose: () => { disposed = true; composerRevision++; catalogosEnVuelo.clear(); },
  };
}
