import type { MachineState } from "../../../../platform-client/src/machine.ts";
import type { Blocked, DeferredFrame, EngineInfo, EventsPage, RelayAdmission } from "../model/relay-frames.ts";
import type { Link } from "../model/fleet/index.ts";

type Clock = { now(): number; set(callback: () => void, ms: number): unknown; clear(timer: unknown): void };
const clock: Clock = { now: Date.now, set: setTimeout, clear: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>) };
type Entry = { machine: string; relay: Link | null; busy: number; used: number; open(admission?: RelayAdmission): Link; suspend(target?: Link): void };

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
      const closes = new Set<() => void>();
      let stops: (() => void)[] = [];
      let opened = false;
      let recoveringRelay: Link | null = null;
      let ready: Promise<void> = Promise.resolve();
      const deliver = (value: EventsPage) => {
        if (value.events?.length) entry.used = time.now();
        if (value.cursor !== null) after = value.cursor;
        for (const listener of events) listener(value);
      };
      const entry: Entry = {
        machine, relay: null, busy: 0, used: time.now(),
        suspend(target?: Link) {
          if (target && entry.relay !== target) return;
          for (const stop of stops) stop();
          stops = [];
          const gone = entry.relay;
          if (gone) state = gone.state();
          if (recoveringRelay === gone) recoveringRelay = null;
          entry.relay = null;
          gone?.close();
          if (gone && !closed) hooks.onSuspend?.();
        },
        open(admission?: RelayAdmission) {
          if (closed) throw { code: "unknown_machine", detail: machine };
          if (entry.relay) {
            if (admission) entry.relay.retry?.(admission);
            return entry.relay;
          }
          const relay = create();
          entry.relay = relay;
          const localBuffered: EventsPage[] = [];
          try {
            stops.push(relay.onState((value) => { if (entry.relay !== relay) return; state = value; for (const listener of states) listener(value); }));
            stops.push(relay.onEvents((value) => {
              if (entry.relay !== relay) return;
              if (recoveringRelay === relay) { localBuffered.push(value); return; }
              deliver(value);
            }));
            if (relay.onEngine) stops.push(relay.onEngine((value) => { if (entry.relay === relay) for (const listener of engines) listener(value); }));
            if (relay.onBlocked) stops.push(relay.onBlocked((value) => { if (entry.relay === relay) for (const listener of blocked) listener(value); }));
            if (relay.onDeferred) stops.push(relay.onDeferred((value) => { if (entry.relay === relay) for (const listener of deferred) listener(value); }));
            // Si la sesión interna cerró definitivamente (revocada/reemplazada), se suelta y avisa a quien espere su encendido.
            if (relay.onClose) {
              stops.push(relay.onClose(() => {
                if (entry.relay !== relay) return;
                for (const stop of stops) stop();
                stops = [];
                state = relay.state();
                if (recoveringRelay === relay) recoveringRelay = null;
                entry.relay = null;
                if (!closed) hooks.onSuspend?.();
                for (const listener of [...closes]) listener();
                signal();
              }));
            }
            const shouldRecover = opened;
            opened = true;
            if (shouldRecover) recoveringRelay = relay;
            if (admission && relay.retry) relay.retry(admission);
            else relay.start();
            if (shouldRecover) {
              entry.busy++;
              let released = false;
              const releaseBusy = () => {
                if (released) return;
                released = true;
                entry.busy--;
                signal();
              };
              ready = Promise.resolve().then(async () => {
                const answer = await relay.call(crypto.randomUUID(), "list_workspace_attention", null, null, {}, 30_000);
                if (closed || entry.relay !== relay) throw { code: "unknown_machine", detail: machine };
                if (answer.cached) throw { code: "machine_off", detail: machine };
                if (hooks.onResume) await hooks.onResume(answer.value);
                else for (const listener of events) listener({ cursor: after ?? null, events: [{ name: "attention", payload: answer.value }] });
                // Re-verificar titularidad tras `await hooks.onResume` antes de vaciar búfer o suscribir.
                if (closed || entry.relay !== relay) throw { code: "unknown_machine", detail: machine };
                if (recoveringRelay === relay) recoveringRelay = null;
                const pending = localBuffered.splice(0, localBuffered.length);
                for (const page of pending) deliver(page);
                if (after !== undefined && entry.relay === relay) relay.subscribe(after);
              }).catch(error => {
                // Solo suspender si este relay sigue siendo dueño de la entrada (nunca cerrar un reemplazo sano).
                if (entry.relay === relay) entry.suspend(relay);
                throw error;
              }).finally(() => {
                if (recoveringRelay === relay) recoveringRelay = null;
                releaseBusy();
              });
              void ready.catch(() => {});
            } else { ready = Promise.resolve(); if (after !== undefined && entry.relay === relay) relay.subscribe(after); }
            return relay;
          } catch (error) { entry.suspend(relay); throw error; }
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
        if (timeout <= 0) return Promise.reject({ code: "machine_timeout", detail: machine });
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
      // La reapertura lee la atención con su propio plazo; quien llama no espera más que su plazo absoluto restante.
      const within = (wait: Promise<void>, timeout: number) => {
        if (timeout <= 0) return Promise.reject({ code: "machine_timeout", detail: machine });
        return new Promise<void>((resolve, reject) => {
          const timer = time.set(() => reject({ code: "machine_timeout", detail: machine }), timeout);
          wait.then(resolve, reject).finally(() => time.clear(timer));
        });
      };
      const subscribeHook = <T>(listeners: Set<(value: T) => void>, listener: (value: T) => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
      return {
        state: () => entry.relay?.state() ?? state,
        async call(id, command, workspace, folder, args, timeout = 30_000) {
          // Plazo absoluto único: adquirir cupo, esperar recuperación y llamar al relay comparten el mismo presupuesto.
          const deadline = time.now() + timeout;
          const remaining = () => deadline - time.now();
          const relay = await acquire(remaining());
          entry.used = time.now();
          try {
            if (recoveringRelay === relay) await within(ready, remaining());
            if (closed || entry.relay !== relay) throw { code: "unknown_machine", detail: machine };
            const left = remaining();
            if (left <= 0) throw { code: "machine_timeout", detail: machine };
            return await relay.call(id, command, workspace, folder, args, left);
          }
          finally { entry.busy--; signal(); }
        },
        onState: (listener) => subscribeHook(states, listener), onEvents: (listener) => subscribeHook(events, listener),
        onEngine: (listener) => subscribeHook(engines, listener), onBlocked: (listener) => subscribeHook(blocked, listener), onDeferred: (listener) => subscribeHook(deferred, listener),
        onClose: (listener) => { closes.add(listener); return () => { closes.delete(listener); }; },
        blocked: () => entry.relay?.blocked?.() ?? null,
        deferred: () => entry.relay?.deferred?.() ?? { actions: [], done: [] },
        subscribe(value) { after = value; if (recoveringRelay !== entry.relay) entry.relay?.subscribe(value); },
        start() { if (!closed && !entry.relay && [...entries].filter((other) => other.machine === machine && other.relay).length < limit) entry.open(); },
        retry(admission) {
          if (closed) return false;
          if (entry.relay) return entry.relay.retry?.(admission) ?? true;
          if (!capacity(entry)) return false;
          entry.open(admission);
          return true;
        },
        close() {
          closed = true;
          entry.suspend();
          entries.delete(entry);
          for (const listener of [...closes]) listener();
          signal();
        },
      };
    },
  };
}
