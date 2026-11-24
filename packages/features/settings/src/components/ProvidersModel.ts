import { lazy } from "solid-js";
import { type Failure } from "../../../../ui/src/Failure";
import { type GitHost } from "../../../../ui/src/lib/gitHosts.ts";
import { type Frase } from "../../../../ui/src/lib/prose";

// GitHub de la cuenta de Danil: con sesión, su tarjeta reemplaza la local.
export const GithubAccount = lazy(() => import("./GithubAccount"));

export const CredentialsInUse = lazy(() => import("./AccountCredentials").then((m) => ({ default: m.CredentialsInUse })));

export const LocalKeysBanner = lazy(() => import("./AccountCredentials").then((m) => ({ default: m.LocalKeysBanner })));

/**
 * Proveedores de código: de dónde salen los proyectos de la organización.
 *
 * No es la sección de cuentas: una cuenta de agente sirve para correr Claude
 * o Codex con la suscripción de la persona, y su credencial la guarda el CLI.
 * Un proveedor sirve para leer el código de la organización, y esa
 * credencial la guarda la app, en el llavero.
 *
 * Aquí no se clona nada: esta superficie contesta qué alcanza esta conexión.
 */

/**
 * Un dato no secreto del formulario. Los tres textos son claves que declara
 * el módulo del proveedor; `falta` es lo que se dice cuando el campo va
 * vacío, escrito entero y no compuesto con los otros dos: el orden de las
 * palabras cambia con la lengua (`git_hosts::Field`).
 */
type Campo = { id: string; label: Frase; help: Frase; falta: Frase; required: boolean };

type Identidad = { user: string; name: string };

type Connection = {
  /** `repository_ids` es de conexiones anteriores: el motor ya no lo usa. */
  selected_area: { key: string; installation_id: number | null; repository_ids?: number[] | null } | null;
  selected_areas: { key: string; installation_id: number | null; repository_ids?: number[] | null }[];
  data: Record<string, string>;
  workspace: string;
  identity: Identidad;
  connected_at: number;
};

export type Provider = GitHost & {
  select_area: boolean;
  setup_url: string | null;
  fields: Campo[];
  /**
   * Los rótulos del formulario son claves, no frases: las declara el módulo
   * del proveedor (`providers/bitbucket.rs`, `providers/github.rs`) y las
   * traduce quien pinta. Ver `lib/prose.ts`.
   */
  token_label: Frase;
  token_help: Frase;
  /** La página donde se crea el token. Es un dato: una dirección no se traduce. */
  token_url: string;
  area_label: Frase;
  areas_label: Frase;
  area_help: Frase;
  /** Uno de los dos deja aprobar desde el navegador y el otro no puede: pegar
   *  un token no es el camino viejo, es el único que sirve en los dos, y no
   *  se puede quitar de la pantalla. */
  browser_login: boolean;
  login_help: Frase;
  connected: Connection | null;
  /** GitHub: `account` (cuenta de Danil), `device` (App Danil en esta máquina) o
   *  `legacy` (la de antes). Un motor anterior no lo manda: sin él, como antes. */
  source?: "account" | "device" | "legacy";
  /** Por qué no se pudo comprobar la conexión: sin red, fuera de la VPN, el
   *  proveedor caído. Con esto puesto la conexión sigue en pie y el token
   *  sigue en el llavero: lo que falló fue preguntar, no el token. */
  unverified: Failure | null;
};

/** Lo que hay que aprobar en el navegador. El código es de un solo uso y no
 *  es la credencial: este sí se muestra, y grande. */
export type Wait = { code: string; url: string; expires_at: number };

/** Lo que devuelve `listar_proyectos`: un conjunto de código en un proveedor,
 *  una organización entera en otro. Cada uno dice cómo llamarlo. */
export type Area = { key: string; name: string };

/** Lo que devuelve `repos_de`. Cada uno es un proyecto en potencia — todavía no
 *  se trae ninguno. */
export type ProyectoRemoto = {
  slug: string;
  name: string;
  clone_url: string;
  branch: string;
};

export type Estado =
  | "conectado"
  | "comprobando"
  | "conectando"
  | "esperando"
  | "instalando"
  | "listando"
  | null;

export type Borrador = { data: Record<string, string>; token: string };

export const SIN_BORRADOR: Borrador = { data: {}, token: "" };

const ORDER = ["github", "bitbucket"];

export const rankOf = (id: string) => (ORDER.includes(id) ? ORDER.indexOf(id) : ORDER.length);
