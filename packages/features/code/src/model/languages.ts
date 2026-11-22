import type { Extension } from "@codemirror/state";

/**
 * La gramática de cada archivo, del catálogo oficial de CodeMirror
 * (`@codemirror/language-data`): reconoce por extensión y por nombre, como
 * `Dockerfile`. El catálogo y cada lenguaje son trozos aparte que
 * se bajan al abrir un archivo que los pide. Sin coincidencia, sin resaltado.
 */
const enCamino = new Map<string, Promise<Extension | null>>();
const listas = new Map<string, Extension>();

function claveDe(ruta: string): string {
  const nombre = ruta.slice(ruta.lastIndexOf("/") + 1);
  const punto = nombre.lastIndexOf(".");
  return (punto > 0 ? nombre.slice(punto + 1) : nombre).toLowerCase();
}

async function describir(ruta: string) {
  const [{ LanguageDescription }, { languages }] = await Promise.all([
    import("@codemirror/language"),
    import("@codemirror/language-data"),
  ]);
  return LanguageDescription.matchFilename(languages, ruta.slice(ruta.lastIndexOf("/") + 1));
}

async function cargar(ruta: string): Promise<Extension | null> {
  if (claveDe(ruta) === "typ") return (await import("./typstLanguage")).typst;
  const lenguaje = await describir(ruta);
  return lenguaje ? lenguaje.load() : null;
}

/** El nombre con el que el catálogo de CodeMirror llama al lenguaje del archivo, o `null` si no lo reconoce. */
export async function nombreDeLenguaje(ruta: string): Promise<string | null> {
  if (claveDe(ruta) === "typ") return "Typst";
  return (await describir(ruta))?.name ?? null;
}

export function gramaticaDe(ruta: string): Promise<Extension | null> {
  const clave = claveDe(ruta);
  let promesa = enCamino.get(clave);
  if (!promesa) {
    promesa = cargar(ruta).then((g) => {
      if (g) listas.set(clave, g);
      return g;
    });
    enCamino.set(clave, promesa);
  }
  return promesa;
}

/** La gramática si ya llegó: el editor la monta desde el primer pintado, sin el texto en gris antes. */
export function gramaticaLista(ruta: string): Extension | null {
  return listas.get(claveDe(ruta)) ?? null;
}

/** Código de ejemplo con el que `calentar` inicializa el editor antes del primer archivo. */
export const MUESTRA = "const valor = { clave: \"texto\", numero: 42 };\nfunction f(a) {\n  return a;\n}\n";
