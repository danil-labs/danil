import assert from "node:assert/strict";
import test from "node:test";
import { agentsWithDifferentReaders } from "../../src/features/projects/agentReaders.ts";

const agent = (name: string, ...providers: string[]) => ({ name, providers });

test("nobody differs when every agent has the same readers, in any order", () => {
  const agents = [agent("a", "claude", "codex"), agent("b", "codex", "claude")];
  assert.deepEqual([...agentsWithDifferentReaders(agents)], []);
});

test("a single agent has nobody to differ from", () => {
  assert.deepEqual([...agentsWithDifferentReaders([agent("a", "claude")])], []);
});

test("only the agents outside the most common combination differ", () => {
  const agents = [agent("a", "claude"), agent("b", "claude"), agent("c", "codex")];
  assert.deepEqual([...agentsWithDifferentReaders(agents)], ["c"]);
});

test("a tie has no normal combination, so all of them are shown", () => {
  const agents = [agent("a", "claude"), agent("b", "codex")];
  assert.deepEqual([...agentsWithDifferentReaders(agents)], ["a", "b"]);
});
