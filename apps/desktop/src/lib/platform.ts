/**
 * Lo que este front puede hacer donde corre. El escritorio lo puede todo y es
 * el valor por defecto; la entrada web (`src/web/main.tsx`) lo fija antes de
 * importar la app y no cambia después.
 */
import type { Answer, AccountWorkspace, Computer, CredentialSource, MemorySource, SpaceOrderSource } from "@terminus/computers";
import { createRoot, createSignal, type JSX } from "solid-js";
import type { AccountEmailsSource } from "../features/settings/account-emails";
import type { AccountProfileSource } from "../features/settings/account-profile";
import type { Account } from "../features/settings/accounts-store";
import type { AuditLogSource } from "../web/audit-log";
import type { WorkspaceAssetsSource } from "../web/workspace-assets";

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
  add: (email?: string | null) => void;
  /** Olvida una cuenta extra en este navegador. */
  remove: (userId: string) => Promise<void>;
  /** Cierra la sesión de la cuenta abierta y vuelve a la entrada. */
  signOut: () => void;
};

export type OrganizationSource = { rows: () => { id: string; name: string }[]; active: () => string | null; busy: () => boolean; uncertain: () => boolean; choose: (id: string) => void };

export type Capabilities = {
  webOrganizations?: OrganizationSource;
  webWorkspaces?: { rows: () => { id: string; name: string }[]; active: () => string | null; busy: () => boolean; uncertain: () => boolean; choose: (id: string) => void };

  /** Saldo de la cuenta Danil desde un BFF autenticado; ausente hasta verificar el adaptador. */
  danilCredits?: import("../features/chat/danil-credits").DanilCreditsSource;
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
  /** Los correos de la cuenta con la sesión (la web de alfa, por su proxy al BFF). */
  accountEmails?: AccountEmailsSource;
  /** El panel de Configuración que la página pidió abrir al cargar (`?settings=`). */
  initialSettings?: string;
  /** La bitácora de cambios de la cuenta de Danil activa, con la sesión (la web en alfa); la muestra `/admin`. */
  accountAuditLog?: AuditLogSource;
  /** `/admin` dentro de esta web (alfa); `allowed` dice si la persona es owner o admin de algún workspace de Danil. Sin esto, el escritorio la abre en el navegador. */
  /** Los workspaces que la persona puede entrar (la web y la ventana). Sin esto, el menú y la barra siguen como en el motor. */
  workspaceDirectory?: {
    /** `account`: con qué sesión se lee el directorio; sin él, la del workspace abierto. */
    list: (account?: string | null) => Promise<import("@terminus/computers").Directory>;
    pin: (keys: string[], account?: string | null) => Promise<void>;
    /** Enlaza un workspace propio con un workspace de Danil; rechaza con el código del plano de control. */
    link: (workspaceId: string, danilWorkspaceId: number, account?: string | null) => Promise<void>;
    /** Quita el enlace en el plano de control; sin esto, desvincular solo cambia la cuenta en el motor. */
    unlink?: (workspaceId: string, account?: string | null) => Promise<void>;
    /** Avisa cuando se abre o se cierra la sesión de persona de esta ventana (el escritorio); devuelve cómo dejar de escuchar. */
    onSession?: (listener: (state: "signed_in" | "signed_out") => void) => () => void;
    /** Sube un workspace propio: crea el workspace personal de Danil de quien llama y lo enlaza; rechaza con el código (`personal_workspace_exists`, …). */
    create?: (workspaceId: string, account?: string | null) => Promise<void>;
  };
  adminPage?: { href: string; allowed: () => Promise<boolean> };
  /** Lo de una cuenta personal en Configuración › Cuenta. `isPersonal` decide si se ofrece; sin `plan`, esa pestaña no sale. */
  personalAccount?: { isPersonal: () => Promise<boolean>; plan?: () => JSX.Element };
  /** El consumo propio en Configuración › Cuenta. Sin fuente, la pestaña no sale. */
  accountUsage?: () => JSX.Element;
  /** Plan y cobro de Danil Business del workspace activo (solo la web). Sin esto, la entrada no sale. */
  businessBilling?: (part: "plan" | "fiscal") => JSX.Element;
  /** El logo y el fondo de los workspaces leídos y cambiados en la cuenta con la sesión (la web). */
  accountAssets?: WorkspaceAssetsSource;
  /** Botón extra al lado de la búsqueda de la barra lateral (en la web, volver a Danil Agents). */
  sidebarExtra?: () => JSX.Element;
  /**
   * El riel desde el índice del motor (`state_machines`, `light_state_machines_v1`):
   * los workspaces de aquí y los que sirven las otras máquinas de la persona.
   * `null` sin ese índice: el riel sale de `list_workspaces`.
   */
  railWorkspaces?: () => readonly import("../features/machines/engine-workspaces").RailWorkspace[] | null;
  /** El nombre de una máquina por su id. */
  machineName?: (id: string) => string;
  /** La máquina de la cuenta que guarda una tarea o un space por su id de panel (`<máquina>~<id>`); `null` si es de la ventana. */
  taskMachine?: (id: string) => string | null;
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
  /**
   * «Conectar otra máquina» con la sesión de la página (la web): la lista de la
   * cuenta y qué hacer cuando la nueva está en línea. El escritorio usa su token
   * de cliente (`features/machines/ConnectMachine.tsx`).
   */
  /** Las computadoras de la cuenta con la sesión de la página (la web); el escritorio usa su token de cliente. */
  accountComputers?: AccountComputersSource;
  /** Varias cuentas de Danil en una ventana (la web); el escritorio no la da. */
  webAccounts?: WebAccountsSource;
  connectMachine?: {
    list: () => Promise<Answer<Computer[]>>;
    onReady: (computer: Computer) => void;
  };
  /**
   * Máquinas de la organización (`/v1/shared-computers`). La web las lee con la
   * sesión de la página. El escritorio, si no la da, usa el token de cliente.
   * No son destino de tareas.
   */
  sharedComputers?: {
    list: () => Promise<Answer<import("@terminus/computers").SharedComputer[]>>;
    start: (id: string) => Promise<Answer<import("@terminus/computers").SharedComputer>>;
  };
};

const DESKTOP: Capabilities = { nativeWindow: true, updater: true, localSetup: true, computerStatus: false, danilAccount: true, radiant: true };

let current = DESKTOP;
const [screenAccess, setScreenAccess] = createRoot(() => createSignal<Capabilities["machineScreen"]>(DESKTOP.machineScreen));

export const capabilities = (): Capabilities => current;

export function setCapabilities(next: Capabilities) {
  current = next;
  setScreenAccess(() => next.machineScreen);
}

export const machineScreen = (machine: string) => screenAccess()?.(machine) ?? null;

/** Cada reintento usa la sesión vigente, aunque la pestaña sobreviviera a una reconexión de la cuenta. */
export function openMachineScreen(machine: string): Promise<WebSocket> {
  const open = machineScreen(machine);
  return open ? open() : Promise.reject(new Error("screen_unavailable"));
}
