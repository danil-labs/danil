import { ALPHA_DEMO, demoDenied } from "./alpha-mode";
import { type AccountWorkspace, type Answer, type Computer, listComputers, listWorkspaces, startComputer } from "@terminus/computers";
import { type EngineEvent, type WorkspaceAttention, mergeAttention } from "@terminus/protocol";
import { store } from "./store";
import { sliceStorage } from "./sliceStorage";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppState, Platform } from "react-native";
import { useAccount } from "./account";
import { BRIDGE_ENABLED, BRIDGE_WITHOUT_ACCOUNT, loadPairing, savePairing } from "./bridge";
import { type Notice, attentionOf, noticer, recentTurns } from "./engine";
import { latestFailureSentence } from "./failureNotice";
import { type AccountFleet, type Host, type Pairing, accountFleet, bridgeHost } from "./hosts";
import { t } from "./i18n";
import { Notifications } from "./notifications";
import { renewPush } from "./push";
import { COMPUTERS } from "./supabase";

type Listener = (host: string, events: EngineEvent[], gap: boolean) => void;

/**
 * Lo que dijo `/v1/computers`, o que el relay detuvo las sesiones por la licencia
 * (`license`: Terminus de pago; la lista ya no la pide). La licencia y el error no se
 * confunden con «no tienes máquinas».
 */
export type Fleet = "loading" | "ok" | "license" | "no_account" | "error" | "signed_out";

type Machines = {
  ready: boolean;
  contextReady: boolean;
  fleet: Fleet;
  /** Las máquinas de la persona y, si está emparejado, el Terminus de la red. */
  hosts: Host[];
  hostOf: (id: string) => Host | undefined;
  /** Los workspaces de la cuenta (`GET /v1/workspaces`), con sus máquinas apagadas o no; `null` si el plano de control no los dice. */
  registry: AccountWorkspace[] | null;
  /** La máquina por omisión para tareas nuevas: la última usada, la VM administrada o la primera. */
  preferred: (eligible: Host[]) => Host | null;
  rememberMachine: (id: string) => void;
  pairing: Pairing | null;
  pair: (pairing: Pairing | null) => Promise<void>;
  reloadComputers: () => Promise<void>;
  /** «Reintentar» del aviso de licencia: reabre las sesiones detenidas y relee la lista. */
  retryLicense: () => void;
  /** Atención por máquina: `hostId → workspaces`. */
  attention: Record<string, WorkspaceAttention[]>;
  activity: { notice: Notice; at: number }[];
  /** Por qué se detuvo, `host/sesión` → frase. Lo lee la campana; el aviso del sistema lo lleva en el cuerpo. */
  reasonOf: (key: string) => string | undefined;
  titleOf: (key: string) => string | undefined;
  rememberTitles: (entries: [string, string][]) => void;
  setOpenTask: (key: string | null) => void;
  subscribe: (listener: Listener) => () => void;
  /** Cambia cuando una máquina cambia de estado: para repintar. */
  tick: number;
};

const Context = createContext<Machines | null>(null);

export function useMachines() {
  const value = useContext(Context);
  if (!value) throw new Error("useMachines outside MachinesProvider");
  return value;
}

const CHANNEL = "tasks";
const LAST = "terminus.machine.last";

function sayFailure(key: string, vars?: Record<string, string | number>) {
  return t(key as Parameters<typeof t>[0], vars);
}

async function announce(notice: Notice, title: string | undefined, reason = "") {
  if (!Notifications) return;
  const name = title?.trim() || t("notify.untitled");
  await Notifications.scheduleNotificationAsync({
    content: {
      title: t(`notify.${notice.state === "unseen" ? "finished" : notice.state}` as const, { title: name }),
      body: reason,
      data: { host: notice.host, workspace: notice.workspace, folder: notice.folder, task: notice.session },
    },
    trigger: Platform.OS === "android" ? { channelId: CHANNEL } : null,
  });
}

/** La frase del turno guardado. Una sola lectura: si todavía no está, queda el aviso genérico. No enciende la máquina. */
async function failureReason(host: Host, notice: Notice): Promise<string> {
  if (notice.state !== "failed" || !notice.folder) return "";
  try {
    const turns = await recentTurns(host, notice.workspace, notice.folder, notice.session);
    return latestFailureSentence(turns, sayFailure) ?? "";
  } catch {
    return "";
  }
}

/** La lista con un token que la API acepta: un token rechazado se refresca una vez. */
async function computersOf(getToken: () => Promise<string>, unauthorized: () => Promise<boolean>): Promise<Answer<Computer[]>> {
  const answer = await listComputers(COMPUTERS, await getToken());
  if (answer.kind !== "unauthorized" || !(await unauthorized())) return answer;
  return listComputers(COMPUTERS, await getToken());
}

const demoHost: Host = {
  id: "demo-host", label: t("alpha.machine_demo"), kind: "computer", managed: false,
  linked: new Set(["demo-workspace"]), power: () => "off", canAct: () => "asleep",
  onChange: () => () => {}, onEvents: () => () => {},
  call: async () => { throw demoDenied(); }, wake: async () => { throw demoDenied(); }, close: () => {},
};

export function MachinesProvider({ children, active = true }: { children: ReactNode; active?: boolean }) {
  if (ALPHA_DEMO) return <Context.Provider value={{ ready: true, contextReady: true, fleet: "ok", hosts: [demoHost], hostOf: id => id === demoHost.id ? demoHost : undefined, registry: null, preferred: () => demoHost, rememberMachine: () => {}, pairing: null, pair: async () => { throw demoDenied(); }, reloadComputers: async () => {}, retryLicense: () => {}, attention: {}, activity: [], reasonOf: () => undefined, titleOf: () => undefined, rememberTitles: () => {}, setOpenTask: () => {}, subscribe: () => () => {}, tick: 0 }}>{children}</Context.Provider>;
  return <LiveMachinesProvider active={active}>{children}</LiveMachinesProvider>;
}

function LiveMachinesProvider({ children, active }: { children: ReactNode; active: boolean }) {
  const account = useAccount();
  const signedIn = active && Boolean(account.session);
  const [computers, setComputers] = useState<Computer[]>([]);
  const [registry, setRegistry] = useState<AccountWorkspace[] | null>(null);
  const [fleet, setFleet] = useState<Fleet>("loading");
  const [pairing, setPairing] = useState<Pairing | null>(null);
  const [pairingLoaded, setPairingLoaded] = useState(false);
  const [hosts, setHosts] = useState<Host[]>([]);
  const [tick, setTick] = useState(0);
  const [attention, setAttention] = useState<Record<string, WorkspaceAttention[]>>({});
  const [activity, setActivity] = useState<{ notice: Notice; at: number }[]>([]);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const reasonsRef = useRef(reasons);
  const triedReason = useRef(new Set<string>());
  const rememberReason = useCallback((key: string, reason: string) => {
    if (!reason || reasonsRef.current[key] === reason) return;
    const next = { ...reasonsRef.current, [key]: reason };
    reasonsRef.current = next;
    setReasons(next);
  }, []);
  const [last, setLast] = useState<string | null>(null);
  const listeners = useRef(new Set<Listener>());
  const reloadGeneration = useRef(0);
  const openTask = useRef<string | null>(null);
  const titles = useRef(new Map<string, string>());

  const signedInAs = account.session?.user.id;
  useEffect(() => {
    if (signedIn) void renewPush(account.getToken);
  }, [signedIn, signedInAs]);

  useEffect(() => {
    if (!active) { setPairing(null); setPairingLoaded(true); return; }
    void loadPairing().then((saved) => {
      setPairing(BRIDGE_ENABLED ? saved : null);
      setPairingLoaded(true);
    });
    void store.get(LAST).then(setLast);
    if (Platform.OS === "android" && Notifications) {
      void Notifications.setNotificationChannelAsync(CHANNEL, { name: t("notify.channel"), importance: Notifications.AndroidImportance.HIGH });
    }
  }, [active]);

  const reloadComputers = useCallback(async () => {
    const request = ++reloadGeneration.current;
    if (!signedIn) {
      setComputers([]);
      setRegistry(null);
      setFleet("signed_out");
      return;
    }
    const [answer, workspaces] = await Promise.all([
      computersOf(account.getToken, account.unauthorized).catch((): Answer<Computer[]> => ({ kind: "error", status: null })),
      account.getToken().then((token) => listWorkspaces(COMPUTERS, token)).catch(() => null),
    ]);
    if (request !== reloadGeneration.current) return;
    // Un plano de control sin el registro, o un fallo de red, deja la lista de antes.
    if (workspaces?.kind === "ok") setRegistry((old) => (JSON.stringify(old) === JSON.stringify(workspaces.value) ? old : workspaces.value));
    if (answer.kind === "ok") {
      setFleet("ok");
      // Solo cambia la lista si cambian las máquinas o sus workspaces vinculados: cada cambio vuelve a abrir sus sesiones.
      setComputers((old) => {
        const linked = (c: Computer) => JSON.stringify(c.workspaces ?? null);
        const same =
          old.length === answer.value.length &&
          old.every((c, i) => c.computer_id === answer.value[i].computer_id && c.provider === answer.value[i].provider && c.name === answer.value[i].name && linked(c) === linked(answer.value[i]));
        return same ? old : answer.value;
      });
    } else if (answer.kind === "license" || answer.kind === "no_account") setFleet(answer.kind);
    else if (answer.kind !== "unauthorized") setFleet("error");
  }, [signedIn, account.getToken, account.unauthorized]);

  useEffect(() => {
    void reloadComputers();
    // Al volver al frente, la lista (y su estado) puede haber cambiado. Nunca enciende nada.
    const sub = AppState.addEventListener("change", (state) => state === "active" && void reloadComputers());
    return () => { sub.remove(); reloadGeneration.current++; };
  }, [reloadComputers]);

  // Una sola flota por sesión de Danil (`@terminus/fleet`), como el escritorio y la web: una sesión de relay por computadora.
  const [machinesFleet, setMachinesFleet] = useState<AccountFleet | null>(null);
  useEffect(() => {
    if (!signedIn) return setMachinesFleet(null);
    let made: AccountFleet | null = null;
    let gone = false;
    void sliceStorage().then((storage) => {
      if (gone) return;
      made = accountFleet({
        endpoint: COMPUTERS,
        getToken: account.getToken,
        onUnauthorized: () => void account.unauthorized(),
        // Fijar, archivar o cerrar una sesión no son intenciones del relay: la VM se enciende por aquí.
        wake: async (computer) => (await startComputer(COMPUTERS, await account.getToken(), computer)).kind === "ok",
        beforeReconnect: (computer) => async () => {
          const answer = await computersOf(account.getToken, account.unauthorized);
          if (answer.kind === "license" || answer.kind === "no_account") setFleet(answer.kind);
          if (answer.kind === "ok" && !answer.value.some((c) => c.computer_id === computer)) return false;
          return answer.kind !== "license" && answer.kind !== "no_account" && answer.kind !== "unauthorized";
        },
        storage,
      });
      setMachinesFleet(made);
    });
    // Al irse al fondo se guarda lo último de cada máquina.
    const sub = AppState.addEventListener("change", (state) => state !== "active" && made?.flush());
    return () => {
      gone = true;
      sub.remove();
      made?.close();
    };
  }, [signedIn, account.getToken, account.unauthorized]);

  // Las computadoras de la cuenta en la flota (altas y bajas en vivo) y el bridge si está emparejado.
  useEffect(() => {
    // En el orden de la web: las administradas primero; la primera encabeza un workspace compartido.
    const next: Host[] = active && machinesFleet ? machinesFleet.set(computers) : [];
    // Sin la sesión de Danil no se sincroniza: el bridge también la pide, salvo el lab sin cuenta.
    if (active && pairing && (signedIn || BRIDGE_WITHOUT_ACCOUNT)) next.push(bridgeHost(pairing, t("machines.network")));
    setHosts(next);
    const unsubscribe = next.flatMap((host) => {
      const notices = noticer(host.id);
      const refreshAttention = () =>
        void attentionOf(host).then((list) => {
          notices.reset(list);
          setAttention((old) => ({ ...old, [host.id]: list }));
        });
      refreshAttention();
      return [
        host.onChange(() => {
          setTick((n) => n + 1);
          if (host.power() === "on") refreshAttention();
        }),
        host.onEvents((events, gap) => {
          if (gap) refreshAttention();
          for (const event of events) {
            if (event.name === "attention" && Array.isArray(event.payload)) {
              // Lista entera o una entrada suelta (`mergeAttention`).
              setAttention((old) => ({ ...old, [host.id]: mergeAttention(old[host.id] ?? [], event.payload as WorkspaceAttention[]) }));
            }
            for (const notice of notices.take(event)) {
              setActivity((old) => [{ notice, at: Date.now() }, ...old].slice(0, 100));
              const key = `${notice.host}/${notice.session}`;
              const open = key === openTask.current;
              const title = titles.current.get(key);
              const pending = failureReason(host, notice);
              // La frase espera a la lectura, pero el aviso no se pierde si tarda.
              const soon = Promise.race([pending, new Promise<string>((resolve) => setTimeout(() => resolve(""), 3000))]);
              void soon.then(async (reason) => {
                if (!open) await announce(notice, title, reason);
                const sentence = reason || (await pending);
                if (sentence) rememberReason(key, sentence);
              });
            }
          }
          for (const listener of listeners.current) listener(host.id, events, gap);
        }),
      ];
    });
    return () => {
      for (const off of unsubscribe) off();
      // Las computadoras las cierra la flota cuando dejan la cuenta; el bridge, aquí.
      for (const host of next) if (host.kind === "bridge") host.close();
    };
  }, [active, machinesFleet, computers, pairing, signedIn, rememberReason]);

  // Lo que ya estaba detenido al abrir: la campana también dice por qué. Una lectura por tarea.
  useEffect(() => {
    for (const host of hosts) {
      for (const workspace of attention[host.id] ?? []) {
        for (const task of workspace.tasks) {
          if (task.state !== "failed" || !task.project) continue;
          const key = `${host.id}/${task.session}`;
          if (reasonsRef.current[key] || triedReason.current.has(key)) continue;
          triedReason.current.add(key);
          void recentTurns(host, workspace.workspace, task.project, task.session)
            .then((turns) => {
              const reason = latestFailureSentence(turns, sayFailure);
              if (reason) rememberReason(key, reason);
            })
            .catch(() => {});
        }
      }
    }
  }, [attention, hosts, rememberReason]);

  const pair = useCallback(async (next: Pairing | null) => {
    await savePairing(next);
    setPairing(next);
  }, []);

  const rememberMachine = useCallback((id: string) => {
    setLast(id);
    void store.set(LAST, id);
  }, []);

  const preferred = useCallback(
    (eligible: Host[]) => {
      const remembered = eligible.find((h) => h.id === last);
      if (remembered) return remembered;
      // La regla de `defaultComputer`: la VM administrada, si no la primera.
      return eligible.find((h) => h.managed) ?? eligible[0] ?? null;
    },
    [last],
  );

  const subscribe = useCallback((listener: Listener) => {
    listeners.current.add(listener);
    return () => void listeners.current.delete(listener);
  }, []);
  const setOpenTask = useCallback((key: string | null) => {
    openTask.current = key;
  }, []);
  const rememberTitles = useCallback((entries: [string, string][]) => {
    for (const [key, title] of entries) titles.current.set(key, title);
  }, []);
  const titleOf = useCallback((key: string) => titles.current.get(key), []);
  const reasonOf = useCallback((key: string) => reasons[key], [reasons]);
  const hostOf = useCallback((id: string) => hosts.find((h) => h.id === id), [hosts]);

  const retryLicense = useCallback(() => {
    machinesFleet?.retry();
    void reloadComputers();
  }, [machinesFleet, reloadComputers]);
  // El relay detiene la sesión (`license_required`) aunque `/v1/computers` conteste: el
  // aviso sale de la flota. `tick` cambia cuando una sesión se detiene o vuelve.
  const fleetState: Fleet = fleet === "ok" && machinesFleet?.license() ? "license" : fleet;

  const value = useMemo<Machines>(
    () => ({
      ready: account.ready && pairingLoaded,
      contextReady: !signedIn || (fleet !== "loading" && fleet !== "signed_out" && computers.every(computer => hosts.some(host => host.id === computer.computer_id))),
      fleet: fleetState,
      hosts,
      hostOf,
      registry,
      preferred,
      rememberMachine,
      pairing,
      pair,
      reloadComputers,
      retryLicense,
      attention,
      activity,
      reasonOf,
      titleOf,
      rememberTitles,
      setOpenTask,
      subscribe,
      tick,
    }),
    [account.ready, pairingLoaded, signedIn, fleet, computers, fleetState, retryLicense, hosts, hostOf, registry, preferred, rememberMachine, pairing, pair, reloadComputers, attention, activity, reasonOf, titleOf, rememberTitles, setOpenTask, subscribe, tick],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
