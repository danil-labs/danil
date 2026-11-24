import type { Component } from "solid-js";
import type { GroupReply } from "../../../../platform-client/src/treasury-config.ts";

/** Una fila del riel de sesiones: lo que Configuración lee de cada contexto. */
export type GrupoDelRiel = {
  context_id: string;
  org: string;
  org_name: string | null;
  plan: string | null;
  role?: string | null;
  email: string | null;
  family: string;
  added: ReadonlySet<string> | null;
  available: readonly { id: string; name?: string; logo?: string | null }[] | null;
};

/** Lo mínimo del riel de sesiones del shell que usa Configuración (y el diálogo de mover que pinta). */
type RielDeAjustes = {
  groups: () => readonly GrupoDelRiel[] | null | undefined;
  refresh: () => void;
  sessions: {
    send: (context: string, method: string, path: string, body?: unknown, key?: string) => Promise<{ status: number; body?: unknown; empty_reason?: unknown }>;
    sendOptional: (context: string, method: "GET" | "POST", path: string, body?: unknown, key?: string) => Promise<GroupReply>;
    close: (target: { context: string }) => Promise<void>;
    closeEmail: (email: string | null, family: string) => Promise<void>;
    addAccount: () => Promise<unknown>;
  };
};

/**
 * Lo que Configuración lee del riel de sesiones y de cuentas del shell. El shell
 * lo enchufa (R3): las pantallas lo leen con los mismos nombres que exporta el shell.
 */
export type SesionesDeAjustes = {
  sessionRailState: () => RielDeAjustes | undefined;
  accountReturn: { begin: (before: readonly string[]) => unknown };
  noteWebAccountMode: () => void;
  usesGroupAccounts: () => boolean;
  MoveWorkspaceDialog: Component<{ sessions: RielDeAjustes; workspace: { id: string; name: string }; onClose: () => void }>;
  MarcaDeWorkspace: Component<{ id?: string; context?: string | null; name: string; logo?: string | null; load?: () => Promise<string | null> }>;
  organizationLogo?: (context: string, workspace: string, path: string | null) => Promise<string | null>;
};
