// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
import type { EngineTransport } from "../transport.ts";
import type { CliNoticeFetchParams, CliNoticeFetchOutput, CliNoticeTakeParams, CliNoticeTakeOutput, NotifyParams, NotifyOutput, ObservabilityConnectParams, ObservabilityConnectOutput, ObservabilityDisconnectParams, ObservabilityDisconnectOutput, OfficePreviewParams, OfficePreviewOutput, OpenExternalParams, OpenExternalOutput, OpenFileExternalParams, OpenFileExternalOutput, OpenGoogleDriveDesktopParams, OpenGoogleDriveDesktopOutput, OpenZoteroParams, OpenZoteroOutput, CliOperationShowParams, CliOperationShowOutput, CliOperationWaitParams, CliOperationWaitOutput, PendingRequestsParams, PendingRequestsOutput, CliPortfolioCreateParams, CliPortfolioCreateOutput, CliPortfolioListParams, CliPortfolioListOutput, CliPortfolioRenameParams, CliPortfolioRenameOutput, PrepareAttachmentsParams, PrepareAttachmentsOutput, PreparePrintParams, PreparePrintOutput, PrepareRuntimeParams, PrepareRuntimeOutput, PrepareSessionContinuationParams, PrepareSessionContinuationOutput, PreviewFileParams, PreviewFileOutput } from "../commands/misc-7.ts";

export function bind_misc_7(t: EngineTransport) {
  return {
    "notice fetch": () => t.call("notice fetch", {}) as Promise<CliNoticeFetchOutput>,
    "notice take": () => t.call("notice take", {}) as Promise<CliNoticeTakeOutput>,
    notify: () => t.call("notify", {}) as Promise<NotifyOutput>,
    observability_connect: () => t.call("observability_connect", {}) as Promise<ObservabilityConnectOutput>,
    observability_disconnect: () => t.call("observability_disconnect", {}) as Promise<ObservabilityDisconnectOutput>,
    office_preview: (params: OfficePreviewParams) => t.call("office_preview", params) as Promise<OfficePreviewOutput>,
    open_external: (params: OpenExternalParams) => t.call("open_external", params) as Promise<OpenExternalOutput>,
    open_file_external: (params: OpenFileExternalParams) => t.call("open_file_external", params) as Promise<OpenFileExternalOutput>,
    open_google_drive_desktop: () => t.call("open_google_drive_desktop", {}) as Promise<OpenGoogleDriveDesktopOutput>,
    open_zotero: () => t.call("open_zotero", {}) as Promise<OpenZoteroOutput>,
    "operation show": () => t.call("operation show", {}) as Promise<CliOperationShowOutput>,
    "operation wait": () => t.call("operation wait", {}) as Promise<CliOperationWaitOutput>,
    pending_requests: (params: PendingRequestsParams) => t.call("pending_requests", params) as Promise<PendingRequestsOutput>,
    "portfolio create": () => t.call("portfolio create", {}) as Promise<CliPortfolioCreateOutput>,
    "portfolio list": () => t.call("portfolio list", {}) as Promise<CliPortfolioListOutput>,
    "portfolio rename": () => t.call("portfolio rename", {}) as Promise<CliPortfolioRenameOutput>,
    prepare_attachments: (params: PrepareAttachmentsParams) => t.call("prepare_attachments", params) as Promise<PrepareAttachmentsOutput>,
    prepare_print: (params: PreparePrintParams) => t.call("prepare_print", params) as Promise<PreparePrintOutput>,
    prepare_runtime: (params?: PrepareRuntimeParams) => t.call("prepare_runtime", params) as Promise<PrepareRuntimeOutput>,
    prepare_session_continuation: (params: PrepareSessionContinuationParams) => t.call("prepare_session_continuation", params) as Promise<PrepareSessionContinuationOutput>,
    preview_file: (params: PreviewFileParams) => t.call("preview_file", params) as Promise<PreviewFileOutput>,
  };
}
