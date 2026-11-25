import assert from "node:assert/strict";
import test from "node:test";
import { computeComposerLayout, type ComposerLayoutInput } from "../../../../packages/features/chat/src/model/composerLayout.ts";

const idleBlank: ComposerLayoutInput = {
  messageCount: 0,
  conversation: "",
  unstarted: false,
  busy: false,
  stopping: false,
  loading: false,
  hasActivity: false,
  hasTerminal: false,
  hasMachineWait: false,
  hasHandoff: false,
};

test("an idle blank new task centers the composer and shows the folder picker", () => {
  assert.deepEqual(computeComposerLayout(idleBlank), {
    empty: true,
    centered: true,
    showProjectPicker: true,
  });
});

test("any in-flight send, activity, terminal, machine wait, or handoff immediately hides the folder picker and anchors the composer", () => {
  const activeFlags: Partial<ComposerLayoutInput>[] = [
    { busy: true },
    { stopping: true },
    { hasActivity: true },
    { hasTerminal: true },
    { hasMachineWait: true },
    { hasHandoff: true },
    { messageCount: 1 },
  ];
  for (const flag of activeFlags) {
    assert.deepEqual(
      computeComposerLayout({ ...idleBlank, ...flag }),
      { empty: false, centered: false, showProjectPicker: false },
      `expected hidden picker and bottom anchor for ${JSON.stringify(flag)}`,
    );
  }
});

test("a provisional or existing started conversation never shows the folder picker even with zero messages", () => {
  assert.deepEqual(computeComposerLayout({ ...idleBlank, conversation: "naciendo:1" }), {
    empty: true,
    centered: false,
    showProjectPicker: false,
  });
  assert.deepEqual(computeComposerLayout({ ...idleBlank, conversation: "t1", loading: true }), {
    empty: false,
    centered: false,
    showProjectPicker: false,
  });
});

test("an idle pre-created empty task stays centered with the picker until a turn starts", () => {
  assert.deepEqual(computeComposerLayout({ ...idleBlank, conversation: "t-empty", unstarted: true }), {
    empty: true,
    centered: true,
    showProjectPicker: true,
  });
  assert.deepEqual(computeComposerLayout({ ...idleBlank, conversation: "t-empty", unstarted: true, busy: true }), {
    empty: false,
    centered: false,
    showProjectPicker: false,
  });
});

test("returning to an idle blank after a cancelled pre-creation send cleanly restores the centered picker", () => {
  assert.deepEqual(computeComposerLayout({ ...idleBlank, busy: true, hasActivity: true }), {
    empty: false,
    centered: false,
    showProjectPicker: false,
  });
  assert.deepEqual(computeComposerLayout(idleBlank), {
    empty: true,
    centered: true,
    showProjectPicker: true,
  });
});
