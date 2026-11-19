import type { Blocked, DeferredFrame, EngineInfo, EventsPage, MachineState } from "@terminus/computers";
import type { Link } from "@terminus/fleet";

type Clock = { now(): number; set(callback: () => void, ms: number): unknown; clear(timer: unknown): void };
const clock: Clock = { now: Date.now, set: setTimeout, clear: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>) };
type Entry = { machine: string; relay: Link | null; busy: number; used: number; open(): Link; suspend(): void };

/** El límite es por máquina física; los enlaces y sus listeners siguen perteneciendo a cada contexto. */
export function createContextRelayPool(time: Clock = clock, limit = 4) {
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
    link(machine: string, create: () => Link, hooks: { onSuspend?(): void; onResume?(attention: unknown): void | Promise<void> } = {}): Link {
      let closed = false;
      let after: number | null | undefined;
      let state: MachineState = "unknown";
      const states = new Set<(value: MachineState) => void>();
      const events = new Set<(value: EventsPage) => void>();
      const engines = new Set<(value: EngineInfo) => void>();
      const blocked = new Set<(value: Blocked | null) => void>();
      const deferred = new Set<(value: DeferredFrame) => void>();
      let stops: (() => void)[] = [];
      let opened = false;
      let recovering = false;
      let ready: Promise<void> = Promise.resolve();
      let buffered: EventsPage[] = [];
      const deliver = (value: EventsPage) => {
        if (recovering) { buffered.push(value); return; }
        if (value.events?.length) entry.used = time.now();
        if (value.cursor !== null) after = value.cursor;
        for (const listener of events) listener(value);
      };
      const entry: Entry = {
        machine, relay: null, busy: 0, used: time.now(),
        suspend() {
          for (const stop of stops) stop();
          stops = [];
          if (entry.relay) state = entry.relay.state();
          const hadRelay = !!entry.relay;
          entry.relay?.close();
          entry.relay = null;
          buffered = [];
          if (hadRelay && !closed) hooks.onSuspend?.();
        },
        open() {
          if (closed) throw { code: "unknown_machine", detail: machine };
          if (entry.relay) return entry.relay;
          const relay = create();
          entry.relay = relay;
          try {
            stops.push(relay.onState((value) => { state = value; for (const listener of states) listener(value); }));
            stops.push(relay.onEvents(deliver));
            if (relay.onEngine) stops.push(relay.onEngine((value) => { for (const listener of engines) listener(value); }));
            if (relay.onBlocked) stops.push(relay.onBlocked((value) => { for (const listener of blocked) listener(value); }));
            if (relay.onDeferred) stops.push(relay.onDeferred((value) => { for (const listener of deferred) listener(value); }));
            recovering = opened;
            opened = true;
            relay.start();
            if (recovering) {
              entry.busy++;
              ready = Promise.resolve().then(async () => {
                const answer = await relay.call(crypto.randomUUID(), "list_workspace_attention", null, null, {}, 30_000);
                if (closed || entry.relay !== relay) throw { code: "unknown_machine", detail: machine };
                if (answer.cached) throw { code: "machine_off", detail: machine };
                if (hooks.onResume) await hooks.onResume(answer.value);
                else for (const listener of events) listener({ cursor: after ?? null, events: [{ name: "attention", payload: answer.value }] });
                recovering = false;
                const pending = buffered; buffered = [];
                for (const page of pending) deliver(page);
                if (after !== undefined) relay.subscribe(after);
              }).catch(error => { entry.suspend(); throw error; }).finally(() => { entry.busy--; signal(); });
              void ready.catch(() => {});
            } else { ready = Promise.resolve(); if (after !== undefined) relay.subscribe(after); }
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
          try {
            if (recovering) await ready;
            if (closed || entry.relay !== relay) throw { code: "unknown_machine", detail: machine };
            return await relay.call(id, command, workspace, folder, args, timeout);
          }
          finally { entry.busy--; signal(); }
        },
        onState: (listener) => subscribeHook(states, listener), onEvents: (listener) => subscribeHook(events, listener),
        onEngine: (listener) => subscribeHook(engines, listener), onBlocked: (listener) => subscribeHook(blocked, listener), onDeferred: (listener) => subscribeHook(deferred, listener),
        blocked: () => entry.relay?.blocked?.() ?? null,
        deferred: () => entry.relay?.deferred?.() ?? { actions: [], done: [] },
        subscribe(value) { after = value; if (!recovering) entry.relay?.subscribe(value); },
        start() { if (!closed && !entry.relay && [...entries].filter((other) => other.machine === machine && other.relay).length < limit) entry.open(); },
        retry() { if (entry.relay) entry.relay.retry?.(); else if (!closed && capacity(entry)) entry.open(); },
        close() { closed = true; entry.suspend(); entries.delete(entry); signal(); },
      };
    },
  };
}
