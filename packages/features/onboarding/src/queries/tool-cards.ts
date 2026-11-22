import { invoke } from "../../../../engine-client/src/client.ts";
import type { Frase } from "../../../../../apps/desktop/src/lib/prose";

export type Wait = { code: string; url: string };
export type Campo = { id: string; label: Frase; help: Frase; required: boolean };
export type Proveedor = {
  id: string;
  name: string;
  browser_login: boolean;
  fields: Campo[];
  token_label: Frase;
  token_help: Frase;
  token_url: string;
  setup_url: string | null;
  connected: { identity: { user: string; name: string }; workspace?: string } | null;
};
export type Conocido = { id: string; grupo: string; pide_sesion: boolean; conectado: boolean; sesiones?: string[] };
export type VinculoBib = { archivo: string; coleccion?: string; ids?: string[]; sincronizado?: number; fallo?: string };
export type AgenteMcp = { id: string; label: string; recibe: boolean; instalado: boolean; login?: boolean };
export type Plugin = { id: string; installed: boolean; installing: boolean; supported: boolean };
export type FalloDelMotor = { what: Frase; detail?: string };
export type AvanceDeDrive = {
  kind: "progress" | "verifying" | "done" | "cancelled" | "error" | "connection";
  received?: number;
  total?: number | null;
  failure?: FalloDelMotor | null;
};
export type EstadoDeDrive = {
  supported: boolean;
  installed: boolean;
  install: AvanceDeDrive | null;
  connected: { email: string; name: string } | null;
  unverified: FalloDelMotor | null;
};
export type DriveDeEscritorio = {
  supported: boolean;
  installed: boolean;
  running: boolean;
  mounts: { email: string | null; path: string }[];
  installer_bytes: number | null;
  unused?: boolean;
};
export type InstalacionDeDrive = {
  operation: string;
  kind: "sizing" | "downloading" | "installing" | "done" | "cancelled" | "error";
  done: number;
  bytes: number;
  failure?: string | null;
};
export type EstadoDeZotero = {
  installed: boolean;
  running: boolean;
  version: string | null;
  local_api: "ready" | "disabled" | "unsupported" | "unavailable";
  installer_bytes: number | null;
};

type wait = Wait;
type proveedor = Proveedor;
type conocido = Conocido;
type agenteMcp = AgenteMcp;
type estadoDeDrive = EstadoDeDrive;
type driveDeEscritorio = DriveDeEscritorio;
type estadoDeZotero = EstadoDeZotero;
type vinculoBib = VinculoBib;
type plugin = Plugin;

export const getWorkspaceScope = () =>
  invoke<{ active: string | null }>("list_workspaces").then((s) => s.active ?? "pending");

export const listGitHosts = (scope: string) =>
  invoke<proveedor[]>("list_git_hosts", { scope });

export const listKnownMcp = () =>
  invoke<conocido[]>("list_known_mcp");

export const listMcpProviders = () =>
  invoke<agenteMcp[]>("list_mcp_providers");

export const getGoogleDriveStatus = () =>
  invoke<estadoDeDrive>("google_drive_status");

export const getGoogleDriveDesktopStatus = () =>
  invoke<driveDeEscritorio>("google_drive_desktop_status");

export const getZoteroStatus = () =>
  invoke<estadoDeZotero>("zotero_status");

export const getZoteroBibLinks = () =>
  invoke<vinculoBib[]>("zotero_bib_links");

export const setGoogleDriveDesktopUse = (used: boolean) =>
  invoke("set_google_drive_desktop_use", { used });

export const connectKnownMcp = (id: string) =>
  invoke("connect_known_mcp", { id });

export const checkGoogleDrive = () =>
  invoke<estadoDeDrive>("check_google_drive");

export const openGoogleDriveDesktop = () =>
  invoke("open_google_drive_desktop");

export const installGoogleDriveDesktop = () =>
  invoke("install_google_drive_desktop");

export const getInstallSize = (operation: string) =>
  invoke<number>("install_size", { operation });

export const installGoogleDrive = () =>
  invoke("install_google_drive");

export const startGoogleDriveLogin = () =>
  invoke<{ url: string }>("start_google_drive_login");

export const finishGoogleDriveLogin = () =>
  invoke<estadoDeDrive>("finish_google_drive_login");

export const installZotero = () =>
  invoke("install_zotero");

export const openZotero = () =>
  invoke("open_zotero");

export const startBrowserLogin = (id: string, scope: string) =>
  invoke<wait>("start_browser_login", { id, scope });

export const finishBrowserLogin = (id: string, scope: string) =>
  invoke<proveedor>("finish_browser_login", { id, scope });

export const installGh = () =>
  invoke("install_gh");

export const mcpLogin = (provider: string, id: string) =>
  invoke("mcp_login", { provider, id });

export const connectGitHost = (scope: string, id: string, data: Record<string, string>, token: string) =>
  invoke("connect_git_host", { scope, id, data, token });

export const cancelInstall = (operation: string) =>
  invoke("cancel_install", { operation });

export const cancelGoogleDriveLogin = () =>
  invoke("cancel_google_drive_login");

export const cancelBrowserLogin = (id: string, scope: string) =>
  invoke("cancel_browser_login", { id, scope });

export const disconnectKnownMcp = (id: string) =>
  invoke("disconnect_known_mcp", { id });

export const disconnectGoogleDrive = () =>
  invoke("disconnect_google_drive");

export const disconnectGitHost = (id: string, scope: string) =>
  invoke("disconnect_git_host", { id, scope });

export const syncZoteroBibs = () =>
  invoke<vinculoBib[]>("sync_zotero_bibs");

export const unlinkZoteroBib = (path: string) =>
  invoke("unlink_zotero_bib", { path });

export const listIntegrations = () =>
  invoke<{ workspace: string; plugins: plugin[] }>("list_integrations");

export const installIntegration = (id: string) =>
  invoke("install_integration", { id });

export const setIntegrationEnabled = (id: string, workspace: string, enabled: boolean) =>
  invoke("set_integration_enabled", { id, workspace, enabled });

export const typstLiveStop = () =>
  invoke("typst_live_stop", { key: null, session: null });

export const uninstallIntegration = (id: string) =>
  invoke("uninstall_integration", { id });
