import type { Project } from "./model";
import { abreviarHome } from "./sourceOrigin.ts";

type Nube = NonNullable<Project["cloud"]>;

const NOMBRE_DE_NUBE: Record<Nube, string | null> = {
  google_drive: "Google Drive",
  one_drive: "OneDrive",
  icloud: "iCloud Drive",
  dropbox: "Dropbox",
  box: "Box",
  other: null,
};

// La raíz de cada servicio dentro de la ruta, y las carpetas suyas que no dicen nada.
const RAIZ = /^(?:GoogleDrive|OneDrive|Dropbox|Box)(?:[- ].*)?$|^com~apple~CloudDocs$|^iCloud Drive$/i;
const INTERNAS = /^(?:My Drive|Mi unidad|Meine Ablage|Mon Drive)$/i;

/**
 * Dónde vive un proyecto, como lo reconoce la persona: `~/code/app` en disco y
 * `Google Drive › Clientes › Contratos` en la nube, sin `Library/CloudStorage`.
 */
export function ubicacionDeProyecto(
  ruta: string | null | undefined,
  cloud?: Project["cloud"],
): string | null {
  if (!ruta?.trim()) return null;
  const nombre = cloud ? NOMBRE_DE_NUBE[cloud] : null;
  if (!nombre) return abreviarHome(ruta);
  const partes = ruta.trim().split(/[\\/]+/).filter(Boolean);
  let raiz = partes.findIndex((p) => RAIZ.test(p));
  if (raiz >= 0 && INTERNAS.test(partes[raiz + 1] ?? "")) raiz += 1;
  // En Windows la unidad de Google Drive empieza directamente en «My Drive».
  if (raiz < 0) raiz = partes.findIndex((p) => INTERNAS.test(p));
  if (raiz < 0) return abreviarHome(ruta);
  const resto = partes.slice(raiz + 1);
  return [nombre, ...resto].join(" › ");
}
