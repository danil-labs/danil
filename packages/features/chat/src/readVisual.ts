import { invoke } from "../../../engine-client/src/client";
import { t } from "../../../../apps/desktop/src/lib/i18n";
import { errorCode } from "../../../../apps/desktop/src/lib/errorCode.ts";
import { machineOf } from "../../machines/src/store";
import { readVisualHtml, type VisualPart, type VisualWhole, VISUAL_FILE, VISUAL_TREE } from "@terminus/chat/visual";

type Scope = { workspace: string; project: string; session: string };

export async function readChatVisual(scope: Scope, file: string): Promise<string> {
  if (!scope.workspace || !scope.session || file.length > 128 || !VISUAL_FILE.test(file)) {
    throw { what: t("chat.visual.invalid"), detail: "invalid_visual_file" };
  }
  const options = { headers: { ...machineOf(scope.session)?.headers, "x-terminus-workspace": scope.workspace } };
  try {
    return await readVisualHtml({
      part: (offset, size, revision) => invoke<VisualPart>("chat_visual_part", {
        project: scope.project, session: scope.session, file, offset, size, revision: revision ?? null,
      }, options),
      whole: () => invoke<VisualWhole>("tree_show", {
        project: scope.project, session: scope.session, tree: VISUAL_TREE, path: file,
      }, options),
    });
  } catch (error) {
    const detail = errorCode(error);
    if (detail === "invalid_visual_file") throw { what: t("chat.visual.invalid"), detail };
    if (detail === "visual_too_large") throw { what: t("chat.visual.too_large"), detail };
    if (detail === "visual_read_failed") throw { what: t("chat.visual.failed"), detail };
    throw error;
  }
}

/** Abre el HTML del visual en el navegador, con el mismo ámbito que su lectura. */
export async function openChatVisual(scope: Scope, file: string): Promise<void> {
  if (!scope.workspace || !scope.session || file.length > 128 || !VISUAL_FILE.test(file)) {
    throw { what: t("chat.visual.invalid"), detail: "invalid_visual_file" };
  }
  await invoke("tree_open_external", {
    project: scope.project, session: scope.session, tree: VISUAL_TREE, path: file,
  }, { headers: { ...machineOf(scope.session)?.headers, "x-terminus-workspace": scope.workspace } });
}
