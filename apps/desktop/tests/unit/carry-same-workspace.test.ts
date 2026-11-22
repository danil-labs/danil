/**
 * C1 (plan de sesiones por organización, § 16): carry lleva un proyecto entre dos
 * motores que tienen el MISMO id de workspace, con `@terminus/carry`, el router de la ventana
 * y la flota de verdad. Aquí ya se leyó `list_workspaces` (`hasHere` es cierto) y aun así cada
 * `work_*` va a la máquina que nombra su cabecera, con el workspace y el proyecto tal cual.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { type CarryEngine } from "../../../../packages/features/machines/src/model/carryTypes.ts";
import { carryWork, newState } from "../../../../packages/features/machines/src/queries/carryRun.ts";
import { Fleet, type Link, type MachineInfo } from "@terminus/fleet";
import "../helpers/catalog.ts";
import { createRouter } from "../../src/features/machines/router.ts";

type Args = Record<string, unknown>;
type Call = { command: string; args: Args; workspace: string | null };

const PAYLOAD = Buffer.from("bundle del proyecto").toString("base64");
const BYTES = Buffer.from(PAYLOAD, "base64").length;
const WORKSPACE = "w";

function fakeLink(answers: Record<string, (args: Args) => unknown>) {
  const calls: Call[] = [];
  const link: Link & { calls: Call[] } = {
    calls,
    state: () => "online",
    call(_id, command, workspace, _folder, args) {
      calls.push({ command, args: args as Args, workspace });
      const answer = answers[command];
      return answer ? Promise.resolve({ value: answer(args as Args), cached: null }) : Promise.reject({ code: "command" });
    },
    onState: () => () => {},
    onEvents: () => () => {},
    subscribe() {},
    start() {},
    close() {},
  };
  return link;
}

function setup(vmInfo: MachineInfo) {
  const native: Call[] = [];
  const answers: Record<string, (args: Args) => unknown> = {
    list_workspaces: () => ({ workspaces: [{ id: WORKSPACE, name: "W" }], active: WORKSPACE }),
    work_status: () => ({ branch: "main", ahead: 1, changed: 0, untracked: 0, ignored: [], largeUntracked: [], ignoredSkipped: [] }),
    work_export: ({ operation }) => ({ transfer: `t-${operation}`, bytes: BYTES, sha256: "abc", head: "a1", wip: "w1", base: "9f" }),
    work_read_part: () => ({ data: PAYLOAD, eof: true }),
  };
  const vm = fakeLink({
    list_workspaces: () => ({ workspaces: [{ id: WORKSPACE, name: "W" }], active: WORKSPACE }),
    work_write_part: () => ({ received: 1 }),
    work_import: ({ probe }) => (probe ? { head: "", base: "", branch: null, files: [], snapshot: false } : { head: "a1", base: "w1", branch: null, files: [], snapshot: true }),
  });
  const fleet = new Fleet({ self: "cmp_home", connect: () => vm, deadlines: { read: 200, action: 400, intent: 800 } });
  const router = createRouter({
    self: "cmp_home",
    fleet,
    native: async (command, args = {}, options) => {
      native.push({ command, args, workspace: new Headers((options as { headers?: HeadersInit } | undefined)?.headers).get("x-terminus-workspace") });
      const answer = answers[command];
      if (!answer) throw { what: { clave: "shell.service.command" }, detail: "command" };
      return answer(args);
    },
    onSlices: () => {},
    pickedFor: () => null,
  });
  fleet.setMachines([vmInfo]);
  const engine: CarryEngine = Object.fromEntries(
    ([["status", "work_status"], ["exportWork", "work_export"], ["readPart", "work_read_part"], ["writePart", "work_write_part"], ["importWork", "work_import"], ["cancel", "work_cancel"], ["key", "work_key"]] as const).map(([method, command]) => [
      method,
      (machine: string, args: Args = {}) => router.handle(command, args, { headers: { "x-terminus-machine": machine, "x-terminus-workspace": WORKSPACE } }),
    ]),
  ) as unknown as CarryEngine;
  return { router, engine, native, vm };
}

for (const [label, vm] of [
  ["a personal VM that links the workspace", { id: "cmp_vm", name: "Danil VM", wakes: false, linked: new Set([WORKSPACE]) }],
  ["the organization machine that serves it", { id: "cmp_vm", name: "Servidor", wakes: false, kind: "organization", organizationId: "org_A", organization: { id: "org_A", workspaces: [{ id: WORKSPACE, name: "W" }] } }],
] as const) {
  test(`carry takes a project from here to ${label}, both with the same workspace id`, async () => {
    const { router, engine, native, vm: link } = setup(vm as MachineInfo);
    await router.handle("list_workspaces", {});
    const job = { source: "cmp_home", target: "cmp_vm", project: "p1", task: null, selection: { includeWork: true, files: [], exclude: [], full: false }, partSize: 1024 };
    const result = await carryWork(engine, job, newState("op1"));

    assert.deepEqual(native.filter((c) => c.command.startsWith("work_")).map((c) => c.command), ["work_export", "work_read_part"], "export and parts are read here");
    assert.deepEqual(link.calls.map((c) => `${c.command}${c.args.probe ? ":probe" : ""}`), ["work_import:probe", "work_write_part", "work_import"], "the destination gets every write, though the workspace is also here");
    assert.ok(link.calls.every((c) => c.workspace === WORKSPACE), "with the same workspace id on the other engine");
    const imported = link.calls.at(-1)?.args;
    assert.equal(imported?.project, "p1", "the project id travels as is: projects share their id across machines");
    assert.equal(imported?.transfer, "t-op1", "the destination imports the same transfer it received");
    assert.equal(link.calls.find((c) => c.command === "work_write_part")?.args.transfer, "t-op1");
    assert.deepEqual([result.baseRef, result.unwrapSnapshot], ["w1", true]);
  });
}

test("bringing back from the other engine to here with the same workspace id reads there and writes here", async () => {
  const { router, native, vm: link } = setup({ id: "cmp_vm", name: "Danil VM", wakes: false, linked: new Set([WORKSPACE]) });
  await router.handle("list_workspaces", {});
  await router.handle("work_status", { project: "p1", task: "cmp_vm~t1" }, { headers: { "x-terminus-machine": "cmp_vm", "x-terminus-workspace": WORKSPACE } }).catch(() => null);
  const sent = link.calls.find((c) => c.command === "work_status");
  assert.ok(sent, "work_status went to the machine named by the header, not here");
  assert.deepEqual([sent?.args.task, sent?.workspace], ["t1", WORKSPACE], "its own task id, unprefixed, in the same workspace");
  assert.ok(!native.some((c) => c.command === "work_status"));
});
