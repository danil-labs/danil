/**
 * Lo que este front puede hacer donde corre. El escritorio lo puede todo y es
 * el valor por defecto; la entrada web (`src/web/main.tsx`) lo fija antes de
 * importar la app y no cambia después.
 */
import type { AccountWorkspace, Answer, Computer } from "../../platform-client/src/api.ts";
import type { CredentialSource } from "../../platform-client/src/account-credentials.ts";
import type { MemorySource } from "../../platform-client/src/memory.ts";
import type { SpaceOrderSource } from "../../platform-client/src/space-order.ts";
import { createRoot, createSignal, type JSX } from "solid-js";
import type { AccountProfileSource } from "../../features/settings/src/model/account-profile";
import type { Account } from "../../features/settings/src/queries/accounts-store";
import type { WorkspaceAssetsSource } from "../../platform-client/src/workspace-assets";

/** Una cuenta agrupada (web y escritorio): las máquinas donde tiene sesión (`@terminus/fleet`, `merge.ts`). */
export type AccountMachinesProps = {
  account: Account;
  provider: string;
  /** Agrega y conecta una cuenta en otra máquina con el flujo de siempre. */
  add: (options: { headers: Record<string, string> }) => Promise<void>;
  refresh: () => void;
};

/** Las computadoras de la cuenta en Configuración: leerlas, renombrarlas y avisar del nombre nuevo. */
export type AccountComputersSource = {
  list: () => Promise<Answer<Computer[]>>;
  workspaces?: () => Promise<Answer<AccountWorkspace[]>>;
  subscribe?: (changed: () => void) => () => void;
  rename?: (id: string, name: string) => Promise<Answer<{ computer_id: string; name: string }>>;
  /** Quien pinta nombres de máquina (la flota) toma el nuevo sin recargar. */
  onRenamed: (id: string, name: string) => void;
  /**
   * Quita de la cuenta una máquina propia que no está en línea. Solo la da quien
   * tiene la sesión de la persona (la web); el escritorio no la ofrece todavía.
   */
  remove?: (id: string) => Promise<Answer<{ computer_id: string }>>;
  /** La flota deja de pintar la máquina quitada y sus tareas. */
  onRemoved?: (id: string) => void;
};

/** Un workspace de otra cuenta de Danil de este navegador: se ve en la columna y abrirlo recarga con su cuenta. */
export type OtherWorkspace = { id: string; name: string; logo: () => Promise<string | null> };

/** Otra cuenta de Danil de este navegador (`web/accounts.ts`). `signedIn: false`: su sesión caducó; `stale`: su lista es la guardada. */
export type OtherAccount = { user_id: string; email: string | null; name: string | null; extra: boolean; signedIn: boolean; stale: boolean; workspaces: OtherWorkspace[] };

/** Las cuentas de Danil de la web: la abierta y las demás con sus workspaces (`docs/web-multi-account.md`). */
export type WebAccountsSource = {
  current: { user_id: string; email: string | null; name: string | null; extra: boolean };
  /** Reactivo: cambia al volver a leer los registros. */
  others: () => OtherAccount[];
  /** Abre un workspace de otra cuenta: la página se recarga con esa cuenta. */
  open: (workspace: string) => void;
  /** «Agregar cuenta»; `email`, para volver a entrar con una que caducó. */
  add?: (email?: string | null) => void;
  /** Olvida una cuenta extra en este navegador. */
  remove: (userId: string) => Promise<void>;
  /** Cierra la sesión de la cuenta abierta y vuelve a la entrada. */
  signOut: () => void;
};

export type Capabilities = import("../../session/src/group-account").GroupAccountCapabilities & {
  revokeWorkspaceAccess?: (context: string, workspace: string) => Promise<"revoked" | "unavailable">;
  webPromo?: (code: string, idempotencyKey: string) => Promise<{ machine?: { state?: string }; unavailable?: boolean }>;
  webWorkspacePicker?: import("../../session/src/workspace-picker").WorkspacePicker;
  webReauth?: { needed: () => boolean; signIn: () => void; failed?: () => boolean };
  /** Saldo de la cuenta Danil desde un BFF autenticado; ausente hasta verificar el adaptador. */
  danilCredits?: import("../../features/chat/src/model/danil-credits").DanilCreditsSource;
  spaceOrder?: SpaceOrderSource;
  /** Controles de ventana propios, semáforo de macOS y bandeja. */
  nativeWindow: boolean;
  /** El actualizador firmado de la app. */
  updater: boolean;
  /** La preparación del entorno con su instalador a la vista, y el paso del alta que instala asistentes. */
  localSetup: boolean;
  /** Una computadora apagada o encendiéndose se ve en su indicador, no como error. */
  computerStatus: boolean;
  /** La ventana ofrece WSL como canal de máquinas locales (`guest_channels`). */
  wsl?: boolean;
  /** Radiant en Configuración y su gobierno en las pantallas; la web no lo ofrece. */
  radiant?: boolean;
  /** «Descarga la app» en Configuración: solo la web; la ventana ya es la app. */
  appDownloads?: boolean;
  /** Iniciar sesión en Danil desde Configuración: la web ya entra con esa cuenta. */
  danilAccount?: boolean;
  /** La persona de la cuenta de Danil leída sin el motor (la web, con su sesión): pie y Configuración. */
  accountProfile?: AccountProfileSource;
  /** El panel de Configuración que la página pidió abrir al cargar (`?settings=`). */
  initialSettings?: string;
  /** El selector de organización (`identity.organizations`); sin esto, o sin la ruta en el servidor, no sale. */
  organizations?: () => Promise<import("../../platform-client/src/organizations.ts").OrganizationSelection>;
  /** Lo de una cuenta personal. */
  personalAccount?: { isPersonal: () => Promise<boolean>; plan?: () => JSX.Element };
  /** El logo y el fondo de los workspaces leídos y cambiados en la cuenta con la sesión (la web). */
  accountAssets?: WorkspaceAssetsSource;
  /** Botón extra al lado de la búsqueda de la barra lateral (en la web, volver a Danil Agents). */
  sidebarExtra?: () => JSX.Element;
  machineName?: (id: string) => string;
  /** La máquina de la cuenta que guarda una tarea o un space por su id de panel (`<máquina>~<id>`); `null` si es de la ventana. */
  taskMachine?: (id: string) => string | null;
  taskWritable?: (id: string) => boolean;
  /** La que corre las tareas que llegan sin `machine`; sin esto, la de la ventana. */
  windowMachine?: () => { id: string; name: string; local: boolean } | undefined;
  /** Dónde se crea un proyecto nuevo, en el diálogo de añadirlo. */
  machineOnCreate?: (workspace: string | null) => JSX.Element;
  /** La máquina donde se crea ahora un proyecto nuevo, si no es la de la ventana; `lead`, si sus spaces son los del panel. */
  remoteCreate?: (workspace: string | null) => { machine: string; lead: boolean } | null;
  /** Los adjuntos salen del navegador como bytes: los guarda el motor (`guardar_adjunto`). */
  browserFiles?: boolean;
  /** Transporte para intentar ver la pantalla; `null` si la máquina no pertenece a esta cuenta. La captura la decide el motor. */
  machineScreen?: (machine: string) => (() => Promise<WebSocket>) | null;
  /** `license_required` si el relay detuvo las otras máquinas por falta de licencia (aviso `TerminusLicense`); `null` si no. */
  machinesLicense?: () => "license_required" | null;
  /** «Reintentar» del aviso de licencia: vuelve a abrir las sesiones de las otras máquinas. */
  retryMachines?: () => void;
  /**
   * La memoria versionada de los workspaces en la cuenta (`/v1/workspaces/:id/memory/*`)
   * con la sesión de la persona: en la web, la pestaña Memoria la lee y la escribe
   * ahí, aunque todas las máquinas estén apagadas. La ventana usa el token de
   * cliente de la cuenta de cada workspace (`memory-account.ts`).
   */
  accountMemory?: MemorySource;
  /**
   * Las credenciales de la cuenta (`/v1/workspaces/:id/credentials`) con la sesión
   * de la persona: la web las lee, las quita por máquina y las sella en el
   * navegador. La ventana pasa por los comandos del motor (`account_credentials_*`).
   */
  accountCredentials?: CredentialSource;
  /** Bajo la tarjeta de una cuenta: sus máquinas. */
  accountMachines?: (props: AccountMachinesProps) => JSX.Element;
  /** Las computadoras de la cuenta con la sesión de la página (la web); el escritorio usa su token de cliente. */
  accountComputers?: AccountComputersSource;
  /** Varias cuentas de Danil en una ventana (la web); el escritorio no la da. */
  webAccounts?: WebAccountsSource;
  /** Disponibilidad reactiva de máquinas en el contexto activo (web); en Desk siempre hay motor local. */
  machineAvailability?: () => import("../../features/machines/src/model/availability").MachineAvailability;
  /** Plan activo de la organización o cuenta en el contexto actual (ej. "free", "pro", "team"). */
  activePlan?: () => string | null;
};

const DESKTOP: Capabilities = { nativeWindow: true, updater: true, localSetup: true, computerStatus: false, danilAccount: true, radiant: true };
const DESKTOP_READY: import("../../features/machines/src/model/availability").MachineAvailability = { kind: "ready", online: 1, total: 1 };

let current = DESKTOP;
const [caps, setCaps] = createRoot(() => createSignal<Capabilities>(DESKTOP));
const [screenAccess, setScreenAccess] = createRoot(() => createSignal<Capabilities["machineScreen"]>(DESKTOP.machineScreen));

export const capabilities = (): Capabilities => current;

export function setCapabilities(next: Capabilities) {
  current = next;
  setCaps(() => next);
  setScreenAccess(() => next.machineScreen);
}

export const machineAvailability = () => caps().machineAvailability?.() ?? DESKTOP_READY;
export const isNoMachines = () => machineAvailability().kind === "no_machines";
export const activePlan = (): string | null => caps().activePlan?.() ?? null;
export const isPaidPlan = (): boolean => {
  const plan = activePlan();
  return !!plan && plan !== "free";
};

export const machineScreen = (machine: string) => screenAccess()?.(machine) ?? null;

/** Cada reintento usa la sesión vigente, aunque la pestaña sobreviviera a una reconexión de la cuenta. */
export function openMachineScreen(machine: string): Promise<WebSocket> {
  const open = machineScreen(machine);
  return open ? open() : Promise.reject(new Error("screen_unavailable"));
}
