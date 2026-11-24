import type { Project } from "./model";

export const claveDeBorrador = (session: string | null, project: string, handler?: string | null) =>
  session ?? (handler ? `borrador:${project}:agent:${handler}` : `borrador:${project}`);

export const proyectoDeNuevaTarea = (
  pedido: string | undefined,
  activo: string,
) => pedido ?? activo;

export function fuentesHeredadas(
  projects: Project[],
  project: string,
  excluded: string[],
): string[] {
  const fuera = new Set(excluded);
  return (
    projects
      .find((p) => p.id === project)
      ?.sources.filter((id) => !fuera.has(id)) ?? []
  );
}

export function unirFuentes(...grupos: string[][]): string[] {
  return [...new Set(grupos.flat())];
}

export function sameSources(previous: string[], next: string[]): boolean {
  return (
    previous.length === next.length &&
    previous.every((source, index) => source === next[index])
  );
}

/**
 * La identidad de una tarea que todavía no existe en Rust.
 *
 * El id de verdad lo da `util::short_id` al crearla, ocho caracteres sin
 * prefijo, y la pantalla necesita nombrarla antes de tenerlo. Lo provisional
 * no se guarda en ninguna preferencia ni viaja a ningún `invoke`.
 */
const PREFIJO_PROVISIONAL = "naciendo:";

let nacidas = 0;

export const idProvisional = () => `${PREFIJO_PROVISIONAL}${++nacidas}`;

export const esProvisional = (id: string | null | undefined) =>
  !!id?.startsWith(PREFIJO_PROVISIONAL);

/**
 * El nombre que se lee mientras Rust no ha escrito el suyo: la primera línea
 * con algo. El recorte a sesenta caracteres y el respeto a las menciones son
 * de `mentions::titulo_desde`; copiarlos aquí sería una segunda definición de
 * la misma regla, y la fila ya recorta con `text-ellipsis`.
 */
export const tituloProvisional = (prompt: string) =>
  prompt.split("\n").find((linea) => linea.trim())?.trim() ?? "";

export const adjuntosSinMandar = (caja: string[], enviados: string[]) =>
  caja.filter((ruta) => !enviados.includes(ruta));

export const adjuntosDevueltos = (caja: string[], enviados: string[]) =>
  [...new Set([...enviados, ...caja])];
