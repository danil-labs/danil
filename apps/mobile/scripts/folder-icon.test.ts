import assert from "node:assert/strict";
import { test } from "node:test";
import { folderByKey, folderIconName } from "../src/lib/folderIcon.ts";
import { ICONS } from "../src/ui/lucide.ts";

test("folder identity stays scoped to its host even when ids coincide", () => {
  const folders = [
    { id: "same", key: "mac/same", host: "mac", name: "Files", kind: "folder" as const, cloud: "onedrive" },
    { id: "same", key: "vm/same", host: "vm", name: "Code", kind: "git" as const },
  ];
  assert.equal(folderIconName(folderByKey(folders, "mac/same")), "folder-cloud");
  assert.equal(folderIconName(folderByKey(folders, "vm/same")), "folder-git-2");
  assert.equal(folderByKey(folders, "same"), undefined);
  assert.equal(folderByKey(folders, "other/same"), undefined);
});

test("observed kind wins, and missing cloud metadata never implies a cloud folder", () => {
  assert.equal(folderIconName({ kind: "git", cloud: "drive" }), "folder-git-2");
  assert.equal(folderIconName({ kind: "folder", cloud: "drive" }), "folder-cloud");
  assert.equal(folderIconName({ kind: "folder", cloud: "" }), "folder");
  assert.equal(folderIconName({ kind: "folder" }), "folder");
  assert.equal(folderIconName(undefined), "folder");
  for (const name of ["folder", "folder-git-2", "folder-cloud"] as const) assert.ok(ICONS[name].length);
});
