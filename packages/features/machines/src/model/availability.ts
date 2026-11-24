import { errorCode } from "../../../../ui/src/lib/errorCode.ts";

export type MachineAvailability =
  | { kind: "loading" }
  | { kind: "unavailable"; reason: "service_error" | "not_permitted" }
  | { kind: "no_machines"; scope: "context" | "workspace" }
  | { kind: "offline"; wakeable: boolean; count: number }
  | { kind: "ready"; online: number; total: number };

export type AvailabilityMachine = {
  power: "on" | "off" | "starting" | "outdated";
  wakes?: boolean;
  child?: boolean;
};

export type AvailabilityInput = {
  permitted: boolean;
  settled: boolean;
  serviceError: boolean;
  machines: readonly AvailabilityMachine[];
  scope?: "context" | "workspace";
};

export const DESKTOP_AVAILABILITY: MachineAvailability = {
  kind: "ready",
  online: 1,
  total: 1,
};

export function deriveMachineAvailability(input: AvailabilityInput): MachineAvailability {
  if (!input.permitted) return { kind: "unavailable", reason: "not_permitted" };
  if (!input.settled) return { kind: "loading" };
  if (input.serviceError) return { kind: "unavailable", reason: "service_error" };
  const eligible = input.machines.filter((m) => !m.child && m.power !== "outdated");
  if (eligible.length === 0) return { kind: "no_machines", scope: input.scope ?? "context" };
  const online = eligible.filter((m) => m.power === "on").length;
  if (online > 0) return { kind: "ready", online, total: eligible.length };
  return {
    kind: "offline",
    wakeable: eligible.some((m) => m.wakes === true),
    count: eligible.length,
  };
}

export const isNoMachineError = (error: unknown): boolean => errorCode(error) === "no_machine";

export const hasNoMachines = (availability: MachineAvailability): boolean =>
  availability.kind === "no_machines";
