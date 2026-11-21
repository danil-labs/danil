import type { InvokeOptions } from "@tauri-apps/api/core";
import { errorCode } from "../../../../../apps/desktop/src/lib/errorCode";
import { invoke } from "../../../../engine-client/src/client";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { detalleDe, prosaDe } from "../../../../ui/src/Failure";

export type DeleteMember = {
  workspace: string;
  project: string;
  id: string;
  title: string;
  working: boolean;
  files: { path: string; hash: string }[];
  inspection: { status: "complete" | "failed"; error?: unknown };
  /** Engines with per-member integration in the preview; older ones omit it. */
  integration?: "none" | "merged" | "unmerged" | "unchecked";
};
export type DeletePreview = { members: DeleteMember[]; consent?: string | null; expires_at?: number };
export type Integration = "merged" | "unmerged" | "unconfirmed";
export type DeleteResult = {
  status: "complete" | "partial";
  applied: { project: string; id: string }[];
  failures: { project: string; id: string; error: unknown }[];
};
/** `members` is the task plus the subtasks the confirmation announced. */
export type DeleteTarget = { project: string; id: string; workspace: string | null; members?: number; supported: boolean; machineName: string; folderName: (project: string) => string; options: InvokeOptions; panelId: (id: string) => string };

export const memberKey = (member: DeleteMember) => JSON.stringify([member.project, member.id]);

export function failureText(failure: unknown): string {
  if (errorCode(failure) === "task_family_busy") return t("projects.sessions.delete_busy");
  const message = prosaDe(failure);
  const detail = detalleDe(failure);
  return detail && detail !== message ? `${message}\n${detail}` : message;
}

// The preview's `integration` decides. Older engines fall back to the finish check, whose `not_finished` also
// flags a worktree without commits of its own and does not tell unmerged from unchecked: those stay unconfirmed.
export async function integrationChecks(list: DeleteMember[], options: InvokeOptions): Promise<ReadonlyMap<string, Integration>> {
  const result = new Map<string, Integration>();
  for (const member of list) {
    if (member.integration === "none" || member.integration === "merged") result.set(memberKey(member), "merged");
    else if (member.integration === "unmerged") result.set(memberKey(member), "unmerged");
  }
  const deadline = Date.now() + 20_000;
  const queue = list.filter(member => member.inspection.status === "complete" && member.integration === undefined);
  const worker = async () => {
    for (let member = queue.shift(); member && Date.now() < deadline; member = queue.shift()) {
      const blockers = await invoke<{ not_finished: boolean }>("task_blockers", { project: member.project, id: member.id, finish: true }, options).catch(() => null);
      if (blockers && !blockers.not_finished) result.set(memberKey(member), "merged");
    }
  };
  await Promise.race([Promise.all(Array.from({ length: 4 }, worker)), new Promise(resolve => setTimeout(resolve, Math.max(0, deadline - Date.now())))]);
  return new Map(result);
}

