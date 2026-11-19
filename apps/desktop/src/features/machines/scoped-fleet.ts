import { type Envelope, type Fleet, FleetError } from "@terminus/fleet";

type Scope = { context?: string; org?: string; localOnly?: boolean };
const ENVELOPE = new Set(["read", "readLive", "call", "raw", "peek"]);
const SCOPE_AT: Record<string, number> = {
  has: 1, info: 1, name: 1, state: 1, power: 1, wake: 1, untilOnline: 1, deferred: 1, blocked: 1,
  setListing: 2, organizationMachines: 1, available: 1, observe: 2, membersOf: 1, leadOf: 1,
  organizationWorkspaces: 0, remotes: 0, argsFor: 2, context: 0, encode: 3, merge: 3,
  sliceStatuses: 0, setRegistry: 1, getRegistry: 0, inRegistry: 1, markShared: 1, isShared: 1,
  sharedCount: 0, license: 0, rename: 2, closeMember: 1,
};

/** Cada router ve una identidad; nunca elige el primer contexto de una máquina. */
export function scopedFleet(fleet: Fleet, scope: Scope): Fleet {
  const machines = () => fleet.machines().filter(row => row.context === scope.context && !scope.localOnly &&
    (!scope.context || row.kind === "organization" && row.organizationId === scope.org));
  const allowed = (machine: string) => machines().some(row => row.id === machine);
  return new Proxy(fleet, {
    get(target, property) {
      if (property === "machines") return machines;
      if (property === "close") return () => {};
      const method = Reflect.get(target, property);
      if (typeof method !== "function" || typeof property !== "string") return method;
      if (ENVELOPE.has(property)) return (envelope: Envelope) => {
        if (!allowed(envelope.machine)) throw new FleetError("unknown_machine", envelope.machine);
        return Reflect.apply(method, target, [{ ...envelope, context: scope.context }]);
      };
      const index = SCOPE_AT[property];
      if (index === undefined) return method.bind(target);
      return (...input: unknown[]) => {
        const args = input.slice(0, index);
        while (args.length < index) args.push(undefined);
        args.push(scope.context);
        return Reflect.apply(method, target, args);
      };
    },
  });
}
