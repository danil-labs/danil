import { type Fleet, FleetError } from "@terminus/fleet";

type Sources = { fleet: Fleet; self: string | null; machine: string | null; native: (() => Promise<unknown>) | null; here: boolean };
/** Execution admission requires every member's current answer; display copies cannot prove either start or close. */
export async function readActiveTurns(args: Record<string, unknown>, workspace: string | null, source: Sources): Promise<string[]> {
  const targets = source.machine ? source.machine === source.self ? [] : [source.machine] : source.fleet.membersOf(workspace);
  const reads = targets.map(machine => source.fleet.readLive({ machine, workspace, command: "list_active_turns", args }));
  if (source.native && (source.machine ? source.machine === source.self : source.here)) reads.unshift(source.native());
  if (!reads.length) throw new FleetError("machine_off", source.machine);
  const values = await Promise.all(reads);
  if (values.some(value => !Array.isArray(value) || value.some(id => typeof id !== "string"))) throw new FleetError("io", source.machine);
  return (values as string[][]).flat();
}
