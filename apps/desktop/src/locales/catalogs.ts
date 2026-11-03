/**
 * Mete en el motor los catálogos que viajan dentro del binario.
 *
 * **Está separado de `lib/i18n.ts` para que el motor se pueda cargar desde
 * Node**, y eso no es una preferencia de estilo: media verificación de este repo
 * son pruebas que corren con `node --test` sobre los archivos de `lib/`, sin
 * bundler. `import.meta.glob` es de Vite y en Node no existe, así que con el
 * glob dentro del motor cualquier módulo que llamara a `t()` —`steps.ts`,
 * `usage.ts`, `history.ts`, `limits.ts`, `format.ts`— arrastraba el motor y
 * **reventaba la prueba con `ERR_MODULE_NOT_FOUND`**. Pasó con
 * `tests/unit/models.test.ts` y con `tests/unit/turn-status.test.ts`.
 *
 * El glob se queda —no imports uno a uno— por lo de siempre: con imports
 * explícitos, un archivo de catálogo que nadie importara quedaría fuera del
 * bundle mientras `scripts/guards/locales.mjs`, que lee el disco, lo daría por bueno.
 *
 * **Se importa antes que nada en `app/main.tsx`.** Un `t()` llamado antes de
 * esto devuelve la clave, y lo que lo caza es `scripts/guards/mount-frontend.mjs`, que monta el
 * árbol de verdad y busca los rótulos en español.
 */
import { registrarCatalogo, type Manifiesto } from "../lib/i18n.ts";

// `web.json`, `attention.json`, `customize.json`, `audit.json` y `broadcasts.json` los lleva la entrada web (`src/web/phrases.ts`);
// `danil.json`, `work.json`, `settings.handler.json`, `cli.json` y `chat.notice.json`, los trozos
// perezosos que los enseñan (`danilPhrases.ts`, `workPhrases.ts`, `handlerPhrases.ts`, `failurePhrases.ts`).
const EMPOTRADOS = import.meta.glob(["./*/*.json", "!./*/web.json", "!./*/danil.json", "!./*/work.json", "!./*/settings.handler.json", "!./*/cli.json", "!./*/chat.notice.json", "!./*/attention.json", "!./*/customize.json", "!./*/audit.json", "!./*/broadcasts.json"], {
  eager: true,
  import: "default",
}) as Record<string, Record<string, unknown>>;

const porLengua = new Map<string, { manifiesto?: Manifiesto; frases: Record<string, never> }>();

for (const [ruta, contenido] of Object.entries(EMPOTRADOS)) {
  const [, codigo, archivo] = ruta.match(/^\.\/([^/]+)\/([^/]+)\.json$/)!;
  const previo = porLengua.get(codigo) ?? { frases: {} };
  if (archivo === "manifiesto") previo.manifiesto = contenido as unknown as Manifiesto;
  else Object.assign(previo.frases, contenido);
  porLengua.set(codigo, previo);
}

for (const [codigo, { manifiesto, frases }] of porLengua) {
  if (!manifiesto) throw new Error(`src/locales/${codigo}/ no tiene manifiesto.json`);
  registrarCatalogo(manifiesto, frases);
}

/**
 * Cuáles viajan dentro del binario.
 *
 * La necesita `lenguas/packs.ts` para no dejar que un paquete de disco pise
 * una de estas: `es` es el respaldo de todo, y reemplazarlo desde una carpeta
 * dejaría la app sin la cascada que impide los huecos.
 *
 * **Sale del glob y no de una lista escrita**, por lo mismo que el glob existe:
 * una lista a mano se queda corta el día que se añada una lengua empotrada, y
 * quedarse corta aquí es dejar entrar un paquete que la pisa. Y sale de aquí y
 * no de preguntarle al motor qué tiene registrado, que es lo natural y lo
 * equivocado: en cuanto entra el primer paquete, el motor contesta que también
 * está registrado, y a la segunda lectura de la lista su propia lengua se
 * rechazaría por «empotrada».
 */
export const EMPOTRADAS: ReadonlySet<string> = new Set(porLengua.keys());
