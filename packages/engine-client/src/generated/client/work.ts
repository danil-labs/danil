// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
import type { EngineTransport } from "../transport.ts";
import type { WorkCancelParams, WorkCancelOutput, WorkExportParams, WorkExportOutput, WorkImportParams, WorkImportOutput, WorkKeyParams, WorkKeyOutput, WorkReadPartParams, WorkReadPartOutput, WorkStatusParams, WorkStatusOutput, WorkWritePartParams, WorkWritePartOutput } from "../commands/work.ts";

export function bind_work(t: EngineTransport) {
  return {
    work_cancel: (params: WorkCancelParams) => t.call("work_cancel", params) as Promise<WorkCancelOutput>,
    work_export: (params: WorkExportParams) => t.call("work_export", params) as Promise<WorkExportOutput>,
    work_import: (params: WorkImportParams) => t.call("work_import", params) as Promise<WorkImportOutput>,
    work_key: () => t.call("work_key", {}) as Promise<WorkKeyOutput>,
    work_read_part: (params: WorkReadPartParams) => t.call("work_read_part", params) as Promise<WorkReadPartOutput>,
    work_status: (params: WorkStatusParams) => t.call("work_status", params) as Promise<WorkStatusOutput>,
    work_write_part: (params: WorkWritePartParams) => t.call("work_write_part", params) as Promise<WorkWritePartOutput>,
  };
}
