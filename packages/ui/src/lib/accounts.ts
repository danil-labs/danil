/**
 * Tipos de las cuentas de agente que cruzan la frontera con el motor y su
 * presentación. Compartidos entre Configuración, el alta y el shell.
 */
import type { Query, Read } from "./limits";
import type { Frase } from "./prose";
import type { Failure } from "../Failure";

export type Account = {
  id: string;
  label: string;
  created_at: number;
  /**
   * El correo que el CLI publicó la última vez que se le preguntó.
   *
   * **Es el nombre bueno de una cuenta** y se muestra en vez de la etiqueta:
   * dice de quién es, no en qué orden se creó. Una etiqueta «Cuenta N» que
   * cuenta las que hay recicla el número al borrar una, y deja dos cuentas
   * llamadas igual — justo lo que hay que distinguir para elegir la activa.
   *
   * `null` es legítimo: algunos agentes no publican identidad y una cuenta sin
   * consultar tampoco la tiene. Ahí la etiqueta es lo único que queda.
   */
  identity: string | null;
  /**
   * Identidad estable del workspace o la suscripción, cuando el motor la conoce.
   * OpenCode publica el id de su organización: dos cuentas con el mismo correo
   * y plan siguen separadas si pertenecen a organizaciones distintas.
   */
  credential_group?: string | null;
  /** Si alguna vez terminó bien una conexión. No se borra al perder la credencial. */
  authenticated_at: number | null;
  /** Si la persona renombró la cuenta a mano (`rename_account`): manda sobre el correo. */
  custom_label?: boolean;
  /** En la web con varias máquinas: dónde tiene sesión esta misma cuenta. */
  machines?: { machine: string; id: string; on: boolean }[];
};

/** Una tarea parada por cupo que la cuenta puesta puede retomar (`chat::relevo`). */
export type EnEspera = {
  project: string;
  session: string;
  title: string;
  account: string | null;
};

export type AccountList = {
  provider: string;
  env_var: string;
  /**
   * Por qué las cuentas de este agente **no** son sesiones independientes.
   *
   * `null` es que sí lo son. Un agente que guarde su sesión en un solo item del
   * almacén de la máquina hace que una segunda cuenta pise a la primera y la
   * primera se siga viendo conectada. Lo consume el botón de agregar, que se
   * deshabilita con este texto — un control que no se puede usar dice por qué
   * (`CLAUDE.md`).
   */
  shared_credential: string | null;
  /** Por máquina en listas combinadas: razón de bloqueo solo en las máquinas que ya tienen cuenta y comparten credencial. */
  shared_credential_by_machine?: Record<string, string>;
  /**
   * Dónde acaba el secreto de este agente, cuando no es el llavero del sistema.
   *
   * `null` es que sí lo es. **No deshabilita nada**: la cuenta funciona y es
   * independiente; lo que hay que decir es que su token está en un archivo.
   * Antigravity en macOS es el caso — corriendo con la carpeta de la cuenta no
   * alcanza el llavero, lo dice en inglés a mitad del login, y cae al archivo.
   * Sin esta frase, ese renglón se lee como que la conexión falló.
   */
  secret_note: Frase | null;
  active: string | null;
  accounts: Account[];
};

export type AccountStatus = {
  id: string;
  authenticated: boolean;
  detail: string;
  /**
   * **Que la app no pudo abrir su almacén de secretos**, en vez de haber
   * preguntado y recibido un «no» (`accounts::AccountStatus`).
   *
   * Sin este campo los dos casos llegaban aplanados en `authenticated: false`, y
   * la tarjeta pintaba «sin conectar» sobre una credencial intacta: en macOS
   * cada actualización cambia la firma del binario y el llavero deja de entregar
   * la llave, así que **todas** las cuentas del workspace salían desconectadas a
   * la vez. `authenticated` sigue trayendo lo último que se supo, que es de
   * disco y no del llavero.
   */
  unreadable?: Failure;
  /** La sesión quedó guardada pero el proveedor todavía no le dio de alta el servicio a la cuenta; `url` es la página que lo completa. */
  signup?: { url: string | null };
};

/**
 * Lo que `account_status` pone en `detail` cuando el CLI dice que hay sesión y
 * no da un correo (`secrets/accounts.rs`).
 *
 * **Es un valor del backend, no una frase de interfaz: no se traduce.** La
 * tarjeta lo compara para no enseñarlo como si fuera la identidad de la cuenta,
 * y traducirlo dejaría la comparación sin encontrar nada — la fila pasaría a
 * llamarse «sesión iniciada» en vez de por su etiqueta, sin error y sin aviso.
 * Vive aquí, con los tipos que cruzan la frontera, y no en el componente.
 */
const SESION_INICIADA = "sesión iniciada";

/**
 * Eventos de la conexión en curso, normalizados por Rust.
 *
 * `confirm` y `code` van en direcciones opuestas: `confirm` trae un código que
 * la app **enseña** para cotejarlo con el que el navegador pide (Grok), y `code`
 * es el CLI **pidiendo** que le peguen uno (Claude).
 */
export type LoginEvent = {
  account: string;
  kind: "url" | "confirm" | "code" | "notice" | "done";
  text: string;
};

export type AgentOpt = {
  id: string;
  label: string;
  available: boolean;
  external_install_url?: string | null;
  /** Si se puede leer cuánto le queda a su plan (`runtime/agents/`). */
  limits: boolean;
  /**
   * **Este agente no usa cuentas.** Lo decide la tabla de agentes, no esta
   * pantalla: un modelo que corre en la máquina no tiene suscripción detrás, así
   * que no hay nada que dar de alta.
   *
   * **Es un booleano y no el texto del motivo.** Aquel estaba escrito para
   * leerse dentro de otra frase y explicaba una ausencia; lo que la sección
   * enseña ya lo dice sin
   * decirlo. El motivo vive en la tabla, en Rust.
   */
  sin_cuenta: boolean;
  /**
   * **Se conecta pegando una API key**, y aquí viene dónde se consigue. `null`
   * es que se conecta lanzando su CLI.
   *
   * La URL sale de la tabla y no se escribe aquí: es genérica —sin el
   * identificador de workspace de nadie— porque el enlace se pulsa **antes** de
   * estar autenticado, que es el único momento en que hace falta.
   */
  api_key: string | null;
  /**
   * **Dónde ocurre la inferencia, y con eso qué superficie le toca.**
   *
   * La pantalla se organiza por lo que la persona obtiene y no por qué CLI se lo
   * sirve — mañana puede ser otro y a ella no le cambia nada. Lo que sí tiene
   * que saber siempre es cuándo su material sale de la máquina, y eso es lo que
   * este dato dice.
   *
   * **Sustituye a los `if` por id** que montaban a mano el bloque de
   * gratuitos. Escritos así, el tercer caso entra por la rama de otro sin que
   * nada falle: es el mismo comodín que `agents::AGENTS` existe para no volver a
   * escribir, cruzado al otro lado del puente donde ningún guarda de Rust lo
   * alcanza.
   */
  inferencia: "con_cuenta" | "sin_pedir_nada";
  /** Fila del Free Router (`free-router-<motor>`): sin cuenta, fuera de las conexiones. Falta en motores anteriores. */
  free_router?: boolean;
};

/**
 * `account_status` persiste la identidad que acaba de leer, pero el objeto que
 * ya devolvió `list_accounts` no cambia retroactivamente. Mientras llega la
 * siguiente lista, `detail` es la lectura fresca y tiene prioridad sobre la
 * etiqueta de relleno, salvo cuando la persona eligió un nombre a mano
 * (`custom_label`).
 */
export function accountPresentation(
  account: Account,
  status?: AccountStatus,
  limits?: Query,
  lastGood?: Read,
) {
  const detail = status?.detail.trim() ?? "";
  const [detailName = "", detailPlan = ""] = detail.split(" · ", 2);
  const statusIdentity =
    status?.authenticated && detailName && detailName !== SESION_INICIADA
      ? detailName
      : "";
  const identity = statusIdentity || account.identity?.trim() || "";
  const custom = account.custom_label ? account.label.trim() : "";
  const name = custom || identity || account.label;
  const read = limits?.mode === "read" ? limits : lastGood;
  const plan = read?.plan?.trim() || (statusIdentity ? detailPlan.trim() : "") || null;
  const visibleDetail =
    custom && identity && identity !== name
      ? identity
      : detail && detail !== name && detail !== `${name} · ${plan}`
        ? detail
        : null;
  return { name, plan, detail: visibleDetail };
}
