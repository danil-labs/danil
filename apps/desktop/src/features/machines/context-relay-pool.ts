import type { Blocked, DeferredFrame, EngineInfo, EventsPage, MachineState } from "@terminus/computers";
import type { Link } from "@terminus/fleet";

type Clock = { now(): number; set(callback: () => void, ms: number): unknown; clear(timer: unknown): void };
const clock: Clock = { now: Date.now, set: setTimeout, clear: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>) };
type Entry = { machine: string; relay: Link | null; busy: number; used: number; timer?: unknown; open(): Link; suspend(): void };

/** El límite es por máquina física; los enlaces y sus listeners siguen perteneciendo a cada contexto. */
export function createContextRelayPool(time: Clock = clock, limit = 4, idleMs = 5 * 60_000) {
  const entries = new Set<Entry>();
  const waiting = new Set<() => void>();
  const signal = () => { for (const wake of [...waiting]) wake(); };
  const capacity = (entry: Entry) => {
    const active = [...entries].filter((other) => other.machine === entry.machine && other.relay);
    if (active.length < limit) return true;
    const victim = active.filter((other) => other !== entry && !other.busy).sort((a, b) => a.used - b.used)[0];
    if (!victim) return false;
    victim.suspend();
    return true;
  };
  return {
    link(machine: string, create: () => Link): Link {
      let closed = false;
      let after: number | null | undefined;
      let state: MachineState = "unknown";
      const states = new Set<(value: MachineState) => void>();
      const events = new Set<(value: EventsPage) => void>();
      const engines = new Set<(value: EngineInfo) => void>();
      const blocked = new Set<(value: Blocked | null) => void>();
      const deferred = new Set<(value: DeferredFrame) => void>();
      let stops: (() => void)[] = [];
      const arm = () => {
        if (closed) return;
        if (entry.timer !== undefined) time.clear(entry.timer);
        entry.timer = time.set(() => { if (!entry.busy) { entry.suspend(); signal(); } }, idleMs);
        (entry.timer as { unref?: () => void })?.unref?.();
      };
      const entry: Entry = {
        machine, relay: null, busy: 0, used: time.now(),
        suspend() {
          if (entry.timer !== undefined) time.clear(entry.timer);
          entry.timer = undefined;
          for (const stop of stops) stop();
          stops = [];
          if (entry.relay) state = entry.relay.state();
          entry.relay?.close();
          entry.relay = null;
        },
        open() {
          if (closed) throw { code: "unknown_machine", detail: machine };
          if (entry.relay) return entry.relay;
          const relay = create();
          entry.relay = relay;
          try {
            stops.push(relay.onState((value) => { state = value; for (const listener of states) listener(value); }));
            stops.push(relay.onEvents((value) => {
              if (value.events?.length) { entry.used = time.now(); arm(); }
              for (const listener of events) listener(value);
            }));
            if (relay.onEngine) stops.push(relay.onEngine((value) => { for (const listener of engines) listener(value); }));
            if (relay.onBlocked) stops.push(relay.onBlocked((value) => { for (const listener of blocked) listener(value); }));
            if (relay.onDeferred) stops.push(relay.onDeferred((value) => { for (const listener of deferred) listener(value); }));
            if (after !== undefined) relay.subscribe(after);
            relay.start();
            arm();
            return relay;
          } catch (error) { entry.suspend(); throw error; }
        },
      };
      entries.add(entry);
      const openBusy = () => {
        entry.busy++;
        try { return entry.open(); }
        catch (error) { entry.busy--; throw error; }
      };
      const acquire = (timeout: number) => {
        if (closed) return Promise.reject({ code: "unknown_machine", detail: machine });
        if (entry.relay || capacity(entry)) {
          try { return Promise.resolve(openBusy()); }
          catch (error) { signal(); return Promise.reject(error); }
        }
        return new Promise<Link>((resolve, reject) => {
          const finish = () => {
            if (!closed && !entry.relay && !capacity(entry)) return;
            waiting.delete(finish); time.clear(timer);
            if (closed) reject({ code: "unknown_machine", detail: machine });
            else { try { resolve(openBusy()); } catch (error) { reject(error); } }
          };
          const timer = time.set(() => { waiting.delete(finish); reject({ code: "machine_timeout", detail: machine }); }, timeout);
          waiting.add(finish);
        });
      };
      const subscribeHook = <T>(listeners: Set<(value: T) => void>, listener: (value: T) => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
      return {
        state: () => entry.relay?.state() ?? state,
        async call(id, command, workspace, folder, args, timeout = 30_000) {
          const relay = await acquire(timeout);
          entry.used = time.now();
          try { return await relay.call(id, command, workspace, folder, args, timeout); }
          finally { entry.busy--; arm(); signal(); }
        },
        onState: (listener) => subscribeHook(states, listener), onEvents: (listener) => subscribeHook(events, listener),
        onEngine: (listener) => subscribeHook(engines, listener), onBlocked: (listener) => subscribeHook(blocked, listener), onDeferred: (listener) => subscribeHook(deferred, listener),
        blocked: () => entry.relay?.blocked?.() ?? null,
        deferred: () => entry.relay?.deferred?.() ?? { actions: [], done: [] },
        subscribe(value) { after = value; entry.relay?.subscribe(value); },
        start() { if (!closed && !entry.relay && [...entries].filter((other) => other.machine === machine && other.relay).length < limit) entry.open(); },
        retry() { if (entry.relay) entry.relay.retry?.(); else if (!closed && capacity(entry)) entry.open(); },
        close() { closed = true; entry.suspend(); entries.delete(entry); signal(); },
      };
    },
  };
}
