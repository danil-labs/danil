/**
 * En qué lengua se pinta la app, y de dónde sale cada frase: el código nombra
 * una clave y contesta el catálogo. Política: AGENTS.md § El texto sale del
 * catálogo; modelo de paquete: SYSTEM.md § De dónde sale cada frase.
 *
 * `es` es la fuente y `en` el puente. Los dos viajan en el binario: la ventana
 * se pinta antes de tocar el disco. Se resuelve antes de montar, como el tema:
 * leída tarde, la ventana abre en español y cambia de lengua a la vista.
 */
import { createSignal } from "solid-js";

/**
 * Una frase con varias formas, por categoría de CLDR. Un paquete puede traer
 * solo `other`: el maya yucateco no marca plural obligatoriamente.
 */
export type Plural = Partial<Record<Intl.LDMLPluralRule, string>>;

/**
 * Lo que un paquete declara de sí mismo. `aporta` y `gate` son conjuntos
 * cerrados: el backend los rechaza con un `enum` de serde (`environment/locales.rs`) y una
 * cadena libre acaba en un `match` con comodín. Modelo de paquete: SYSTEM.md
 * § De dónde sale cada frase.
 */
export type Manifiesto = {
  /**
   * Versión del formato de paquete, no del contenido. Un contrato desconocido
   * se rechaza entero: leído a medias, el fallo se vería igual que una
   * traducción incompleta, que es un estado legítimo.
   */
  contrato: number;
  /** Hoy solo hay uno; se declara para que quepa el segundo. */
  aporta: "lengua";
  /**
   * Qué atraviesa el paquete: nada. Se declara aunque sea «nada»: un
   * manifiesto sin `gate` obliga a deducirlo del contenido.
   */
  gate: "ninguno";
  /** BCP-47. `yua` para el maya yucateco: ISO 639-3 vale cuando no hay dos letras. */
  codigo: string;
  /** El nombre de la lengua en esa lengua. */
  endonimo: string;
  /**
   * Semver del contenido, distinta de `contrato`. Sin ella dos paquetes de la
   * misma lengua se pisan al instalar y nadie puede decir cuál está puesto.
   */
  version: string;
  /**
   * `Intl` no conoce `yua` y no da error: contesta con las reglas de otra
   * lengua. Qué formato esperan sus hablantes lo sabe quien publica el paquete.
   */
  formato: string;
  /**
   * Se declara desde el primer día aunque hoy las tres lenguas sean `ltr`.
   * Añadirla después obliga a revisar cada paquete ya publicado.
   */
  direccion: "ltr" | "rtl";
  /** Quién lo escribe. Un paquete de la comunidad lleva a su gente aquí. */
  autoria?: string;
  /** Capacidad opcional, independiente del catálogo que pinta la interfaz. */
  salida?: {
    gate: "contexto-del-agente";
    perfil: string;
  };
};

type Catalogo = { manifiesto: Manifiesto; frases: Record<string, string | Plural> };

/**
 * `U+02BC` es la única variante del saltillo que Unicode clasifica como letra
 * (`/\p{L}/u`); los teclados dan `U+0027` y macOS sustituye a `U+2019`. ICU no
 * intercambia `\u02BC` con `'` ni con `sensitivity: "base"`: una búsqueda tecleada
 * pasa también por aquí. Geist pinta `U+02BC` con las métricas de `U+2019`.
 */
export const saltillo = (s: string) => s.replace(/[\u0027\u2018\u2019\u02BB\u00B4\u0060]/g, "\u02BC");

function normalizar(frases: Record<string, string | Plural>): Record<string, string | Plural> {
  const salida: Record<string, string | Plural> = {};
  for (const [clave, valor] of Object.entries(frases)) {
    salida[clave] =
      typeof valor === "string"
        ? saltillo(valor)
        : Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, saltillo(v as string)]));
  }
  return salida;
}

/** El catálogo fuente: el único siempre completo, y el respaldo de toda clave. */
const BASE = "es";

/**
 * A dónde se cae cuando el sistema pide una lengua sin catálogo. No es `BASE`:
 * quien tiene el sistema en coreano lee inglés antes que español.
 */
const FRANCA = "en";

const CLAVE = "harness:lengua";
/**
 * La lengua que se pintó la última vez, solo para el primer frame: la del
 * workspace llega de un comando asíncrono, y sin esto la ventana abre en la
 * lengua de la máquina y cambia a la vista. `aplicarLenguaDeWorkspace` la
 * corrige al contestar el backend. Mismo recurso que `lib/theme.ts`.
 */
const ULTIMA = "harness:lengua:ultima";

const catalogos = new Map<string, Catalogo>();

/**
 * Bajo `node --test` nadie registra nada, y entre evaluar el motor y que
 * `lenguas/catalogs.ts` lo llene tampoco. El formato cae a `es` y no al código
 * de la lengua: `Intl` con `"yua"` contesta con las reglas de otra lengua.
 */
function sinManifiesto(codigo: string): Manifiesto {
  // `0.0.0` y no la versión de la app: aquí no hay paquete del que leerla, y un
  // número inventado se pintaría como si alguien lo hubiera publicado.
  return {
    contrato: 1,
    aporta: "lengua",
    gate: "ninguno",
    codigo,
    endonimo: codigo,
    version: "0.0.0",
    formato: BASE,
    direccion: "ltr",
  };
}

/**
 * Señal reactiva del conjunto de catálogos. Un paquete de disco entra después
 * del primer pintado y otro al pulsar Instalar: sin ella el selector sigue
 * enseñando las dos empotradas y nada avisa.
 */
const [revision, setRevision] = createSignal(0);

/**
 * Un paquete de disco. Entra ya parseado y sin funciones: un paquete ejecuta
 * con los permisos de la persona. Su texto se pinta como texto, nunca como
 * Markdown (SYSTEM.md § De dónde sale cada frase).
 */
export function registrarCatalogo(manifiesto: Manifiesto, frases: Record<string, string | Plural>) {
  catalogos.set(manifiesto.codigo, { manifiesto, frases: normalizar(frases) });
  setRevision((n) => n + 1);
}

/**
 * Registra un paquete de disco entero y cuenta las claves que `es` no tiene ahora.
 * Sin filtrar: las frases de un trozo perezoso llegan después y deben encontrar su traducción.
 */
export function registrarPaquete(manifiesto: Manifiesto, frases: Record<string, string | Plural>): number {
  const conocidas = clavesConocidas();
  registrarCatalogo(manifiesto, frases);
  return Object.keys(frases).filter((clave) => !conocidas.has(clave)).length;
}

/** Frases que trae solo una entrada, sumadas a una lengua ya registrada. */
export function sumarFrases(codigo: string, frases: Record<string, string | Plural>) {
  const actual = catalogos.get(codigo);
  if (!actual) return;
  catalogos.set(codigo, { ...actual, frases: { ...actual.frases, ...normalizar(frases) } });
  setRevision((n) => n + 1);
}

/**
 * Saca del motor una lengua de disco y vuelve al respaldo si era la puesta:
 * `t()` seguiría contestando desde el `Map` y el cambio se vería solo en el
 * siguiente arranque. `es` no se puede olvidar: dejaría la app sin texto.
 */
export function olvidarCatalogo(codigo: string) {
  if (codigo === BASE || !catalogos.delete(codigo)) return;
  setRevision((n) => n + 1);
  // Al respaldo del sistema, que es el default del producto: la lengua que
  // manda es la del workspace y `App.tsx` la vuelve a aplicar al leerla.
  setLengua(resolver("sistema"));
  aplicarLengua();
}

/**
 * En qué lengua quedaría la app si se quitara esta, sin quitarla. Solo
 * `resolver` conoce la cascada; calcularlo en la pantalla sería una segunda
 * definición. Quita y repone en el mismo tick: nadie observa el hueco.
 */
export function respaldoSiSeQuita(codigo: string): Manifiesto {
  const guardado = catalogos.get(codigo);
  if (!guardado) return manifiesto();
  catalogos.delete(codigo);
  const cae = catalogos.get(resolver("sistema"))?.manifiesto ?? sinManifiesto(BASE);
  catalogos.set(codigo, guardado);
  return cae;
}

/**
 * Las claves de `es` y solo las de `es`. Un paquete escrito contra una versión
 * anterior trae claves que ya no existen; metidas en el motor no las pinta ni
 * las cuenta nada.
 */
export function clavesConocidas(): Set<string> {
  return new Set(Object.keys(catalogos.get(BASE)?.frases ?? {}));
}

export function lenguasDisponibles(): Manifiesto[] {
  revision();
  return [...catalogos.values()]
    .map((c) => c.manifiesto)
    .sort((a, b) => a.endonimo.localeCompare(b.endonimo, BASE));
}

/**
 * Lo elegido en el alta, antes de que exista un workspace. No entra en la
 * cadena de resolución: si entrara, el maya probado en el alta iría a todos
 * los clientes creados después. La lengua es del workspace;
 * `crearWorkspace` la fija al crear el workspace.
 */
export function semillaDelAlta(): string {
  return almacen()?.getItem(CLAVE) ?? "sistema";
}

/**
 * `localStorage`, `navigator` y `document` no existen bajo `node --test`, que
 * carga los módulos de `lib/` que llaman a `t()`. Sin la guarda, importarlos
 * revienta la prueba antes de la primera aserción.
 */
function almacen(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/**
 * El código ya resuelto, nunca «sistema». `navigator.language` es el idioma del
 * sistema operativo y se lee síncrono.
 */
function resolver(pref: string): string {
  const delSistema = typeof navigator === "undefined" ? BASE : navigator.language;
  const pedido = pref === "sistema" ? delSistema : pref;
  // `es-MX` → `es` antes de la franca: quien tiene el Mac en `en-GB` espera inglés.
  if (catalogos.has(pedido)) return pedido;
  const corto = pedido.split("-")[0];
  if (catalogos.has(corto)) return corto;
  if (catalogos.has(FRANCA)) return FRANCA;
  return BASE;
}

let requestedLanguage = semillaDelAlta();
const [lengua, setLengua] = createSignal(
  // Lo último pintado, que es de un workspace o del alta: la ventana tiene que
  // poder pintarse antes de leer el disco. Sin nada, el sistema. Si ese código
  // ya no tiene catálogo —el paquete se quitó—, `resolver` lo devuelve al
  // respaldo.
  resolver(almacen()?.getItem(ULTIMA) ?? semillaDelAlta()),
);
export { lengua };

/**
 * El manifiesto de lo que se está pintando. De aquí sale el locale de formato,
 * que es lo único que un paquete no puede aportar escribiendo frases.
 */
export function manifiesto(): Manifiesto {
  return catalogos.get(lengua())?.manifiesto ?? sinManifiesto(lengua());
}

/**
 * No recarga la ventana: todo lo que formatea lee el locale al pintar. Un
 * `Intl.NumberFormat` a nivel de módulo se congela al importarse y sigue
 * escribiendo en español bajo una interfaz en maya. Ver `lib/format.ts`.
 */
export function elegirLengua(pref: string) {
  requestedLanguage = pref;
  // Se recuerda para dársela al workspace que se está creando, no como
  // preferencia que gobierne después. Ver `semillaDelAlta`.
  if (pref === "sistema") almacen()?.removeItem(CLAVE);
  else almacen()?.setItem(CLAVE, pref);
  const resuelto = resolver(pref);
  setLengua(resuelto);
  almacen()?.setItem(ULTIMA, resuelto);
  aplicarLengua();
}

/**
 * `null` es seguir al sistema, el estado de un workspace recién creado. Que la
 * lengua cambie al cambiar de workspace es la función
 * (`workspaces::Workspace::lengua`).
 */
export function aplicarLenguaDeWorkspace(codigo: string | null | undefined) {
  requestedLanguage = codigo ?? "sistema";
  // Sin lengua declarada se sigue al sistema, no a la semilla del alta.
  const resuelto = resolver(codigo ?? "sistema");
  setLengua(resuelto);
  almacen()?.setItem(ULTIMA, resuelto);
  aplicarLengua();
}

/** Un catálogo tardío vuelve a resolver la preferencia vigente, sin imponer la semilla del alta. */
export function refreshLanguage() {
  const resolved = resolver(requestedLanguage);
  setLengua(resolved);
  almacen()?.setItem(ULTIMA, resolved);
  aplicarLengua();
}

/** Deja el documento en la lengua resuelta antes del primer pintado. */
export function aplicarLengua() {
  if (typeof document === "undefined") return;
  document.documentElement.lang = lengua();
  document.documentElement.dir = manifiesto().direccion;
}

/**
 * Lee `lengua()`: en JSX `{t("x")}` se repinta sola al cambiar de idioma.
 * Respaldo en cascada —activo, base, la clave misma—: un paquete de la
 * comunidad siempre va por detrás de la app, y un hueco sería peor que una
 * frase en español.
 */
export function t(clave: string, datos?: Record<string, string | number>): string {
  const activo = catalogos.get(lengua());
  const cruda = activo?.frases[clave] ?? catalogos.get(BASE)?.frases[clave];
  if (cruda === undefined) {
    if (import.meta.env.DEV) console.warn(`[lenguas] sin frase para «${clave}»`);
    return clave;
  }
  const texto =
    typeof cruda === "string" ? cruda : elegirForma(cruda, datos, manifiesto());
  return interpolar(texto, datos);
}

/**
 * Con el locale de formato, no con el código: `Intl.PluralRules("yua")` no
 * falla, contesta con las reglas de otra lengua. `other` es la única categoría
 * que CLDR exige a todas.
 */
function elegirForma(plural: Plural, datos: Record<string, string | number> | undefined, m: Manifiesto): string {
  const n = Number(datos?.count ?? 0);
  const categoria = new Intl.PluralRules(m.formato).select(n);
  return plural[categoria] ?? plural.other ?? Object.values(plural)[0] ?? "";
}

/**
 * Por nombre y no por posición: quien traduce reordena la frase. Un placeholder
 * mal escrito pinta la llave a pelo sin romper; lo caza `scripts/guards/locales.mjs`
 * comparando contra `es`.
 */
function interpolar(texto: string, datos?: Record<string, string | number>): string {
  if (!datos) return texto;
  return texto.replace(/\{(\w+)\}/g, (todo, nombre) =>
    nombre in datos ? String(datos[nombre]) : todo,
  );
}
