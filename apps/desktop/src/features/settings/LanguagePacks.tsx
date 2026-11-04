import { For, Show, createSignal, onMount } from "solid-js";
import { invoke } from "../../lib/invoke.ts";
import { open } from "@tauri-apps/plugin-dialog";
import {
  lengua,
  lenguasDisponibles,
  olvidarCatalogo,
  respaldoSiSeQuita,
  t,
  type Manifiesto,
} from "../../lib/i18n";
import { EMPOTRADAS } from "../../locales/catalogs";
import { cargarPaquetes, type LenguaInstalada } from "../../locales/packs";
import "../../locales/settingsPhrases";
import FileArchive from "lucide-solid/icons/file-archive";
import FolderOpen from "lucide-solid/icons/folder-open";
import { FailureNote, asFailure, type Failure } from "../../ui/Failure";
import { Button } from "../../ui/Button";
import { Badge } from "../../ui/Badge";
import { SettingsRow, SettingsSection } from "./layout";

/**
 * Qué lenguas tiene puestas la app, dentro de Estado del entorno.
 *
 * Va aquí y no en el selector de idioma: el selector contesta «en qué lengua
 * quiero la app» y esta pantalla «qué hay instalado, de quién es y qué me llevo
 * si lo quito» — la misma pregunta que ahí contestan git, pnpm o el CLI de un
 * agente. Es lista aparte y no filas de la de arriba: una lengua nunca aparece
 * entre los requisitos y nada se mueve de una lista a otra.
 *
 * `es` y `en` salen también, sin botón de quitar: viajan dentro del binario y
 * no hay carpeta que borrar, y `es` es el respaldo de toda clave que falte. El
 * motor lo rechaza igual (`olvidarCatalogo`): esto es lo que se ve, no lo que
 * lo sostiene.
 */
export function PaquetesDeLengua() {
  const [instaladas, setInstaladas] = createSignal<LenguaInstalada[]>([]);
  const [trabajando, setTrabajando] = createSignal(false);
  const [porQuitar, setPorQuitar] = createSignal<string | null>(null);
  const [fallo, setFallo] = createSignal<Failure | null>(null);

  /**
   * Vuelve a leer el disco y a registrar lo que sirva. También tras instalar,
   * en vez de meter en el motor lo que devuelve el comando: dos caminos que
   * decidan si un paquete sirve acabarían decidiendo distinto, y esa diferencia
   * se ve como «lo instalé y no aparece».
   */
  async function recargar() {
    setInstaladas(await cargarPaquetes());
  }

  onMount(() => void recargar());

  /** Lo empotrado, que no está en disco y por eso no lo trae `cargarPaquetes`. */
  const empotradas = (): Manifiesto[] =>
    lenguasDisponibles().filter((m) => EMPOTRADAS.has(m.codigo));

  async function instalar(desde: "carpeta" | "zip") {
    setFallo(null);
    // El selector nativo, y nada de red: la app promete que todo es
    // local, y un canal de descarga es una decisión de arquitectura con su gate
    // que está sin tomar.
    const elegido = await open(
      desde === "carpeta"
        ? { directory: true, multiple: false }
        : {
            multiple: false,
            filters: [
              { name: t("settings.languages.zip_filter"), extensions: ["zip"] },
            ],
          },
    );
    if (typeof elegido !== "string") return;
    setTrabajando(true);
    try {
      await invoke("install_language_pack", { source: elegido });
      await recargar();
    } catch (e) {
      setFallo({ ...asFailure(e), what: t("settings.languages.error_install") });
    } finally {
      setTrabajando(false);
    }
  }

  async function quitar(codigo: string) {
    setTrabajando(true);
    setFallo(null);
    try {
      await invoke("remove_language_pack", { code: codigo });
      // Y del motor, que es lo que hace que la app vuelva al respaldo ahora y no
      // en el siguiente arranque. Sin esto `t()` seguiría contestando desde el
      // catálogo en memoria de una carpeta que ya no existe.
      olvidarCatalogo(codigo);
      setPorQuitar(null);
      await recargar();
    } catch (e) {
      setFallo({ ...asFailure(e), what: t("settings.languages.error_remove") });
    } finally {
      setTrabajando(false);
    }
  }

  /** Qué dice el renglón de detalle de una lengua que sí se puede usar. */
  const detalle = (m: Manifiesto) =>
    `${m.codigo} · ${m.version} · ${
      m.autoria
        ? t("settings.languages.author", { author: m.autoria })
        : t("settings.languages.no_author")
    }`;

  /**
   * Por qué una lengua instalada no se puede usar, en la lengua de quien mira.
   *
   * `switch` sin comodín sobre el tipo de `Rechazo`: una causa nueva rompe la
   * compilación aquí, que es donde hay que escribir qué se le dice a la persona.
   * Solo `backend` trae prosa hecha —la escribe Rust, que sabe qué archivo y qué
   * línea— y por eso es la única que sale sin traducir.
   */
  function porQue(r: NonNullable<LenguaInstalada["rechazo"]>, codigo: string): string {
    switch (r.por) {
      case "backend":
        return r.detalle;
      case "formato":
        return t("settings.languages.rejected_format", { format: r.formato });
      case "empotrada":
        return t("settings.languages.rejected_builtin", { code: codigo });
    }
  }

  return (
    <SettingsSection
      title={t("settings.languages.title")}
      aside={
        <div class="flex min-w-0 flex-wrap items-center gap-2">
          <Button
            variant="ghost"
            size="compact"
            disabled={trabajando()}
            onClick={() => void instalar("carpeta")}
          >
            <FolderOpen size={14} />
            {t("settings.languages.add_folder")}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={trabajando()}
            onClick={() => void instalar("zip")}
          >
            <FileArchive size={14} />
            {t("settings.languages.add_zip")}
          </Button>
        </div>
      }
    >
      <Show when={fallo()}>{(f) => <FailureNote f={f()} />}</Show>

      <For each={empotradas()}>
        {(m) => (
          <SettingsRow
            lead={<CodeTile code={m.codigo} />}
            label={m.endonimo}
            description={detalle(m)}
          >
            <Badge>{t("settings.languages.builtin")}</Badge>
          </SettingsRow>
        )}
      </For>

      <For each={instaladas()}>
        {(l) => (
          <SettingsRow
            lead={<CodeTile code={l.codigo} />}
            label={l.manifiesto?.endonimo ?? l.codigo}
            description={
              <>
                <span class="block break-words">
                  {l.rechazo
                    ? porQue(l.rechazo, l.codigo)
                    : detalle(l.manifiesto!)}
                </span>
                {/* Lo que trae y esta versión de la app no conoce. No es un
                    error —un paquete siempre va por detrás— pero callarlo deja a
                    quien tradujo creyendo que ese trabajo se está viendo. */}
                <Show when={l.ignoradas > 0}>
                  <span class="block break-words">
                    {t("settings.languages.ignored", { count: l.ignoradas })}
                  </span>
                </Show>
                <Show when={porQuitar() === l.codigo}>
                  <span class="block break-words">
                    {t("settings.languages.remove_active", {
                      fallback: respaldoSiSeQuita(l.codigo).endonimo,
                    })}
                  </span>
                </Show>
              </>
            }
          >
            <Show
              when={porQuitar() === l.codigo}
              fallback={
                <Button
                  variant="ghost"
                  size="compact"
                  disabled={trabajando()}
                  onClick={() =>
                    // Si es la que se está usando, la consecuencia se dice
                    // antes del gesto. Si no lo es, no hay nada que avisar y
                    // un paso de confirmación sería un muro sin motivo.
                    lengua() === l.codigo
                      ? setPorQuitar(l.codigo)
                      : void quitar(l.codigo)
                  }
                >
                  {t("settings.languages.remove")}
                </Button>
              }
            >
              <Button
                variant="outline"
                size="compact"
                disabled={trabajando()}
                onClick={() => void quitar(l.codigo)}
              >
                {t("settings.languages.remove_anyway")}
              </Button>
              <Button
                variant="ghost"
                size="compact"
                disabled={trabajando()}
                onClick={() => setPorQuitar(null)}
              >
                {t("settings.languages.cancel")}
              </Button>
            </Show>
          </SettingsRow>
        )}
      </For>
    </SettingsSection>
  );
}

function CodeTile(props: { code: string }) {
  return (
    <span
      class="grid size-10 shrink-0 place-items-center rounded-lg border border-border bg-surface-muted font-mono text-xs font-semibold text-neutral-950 uppercase"
      aria-hidden="true"
    >
      {props.code}
    </span>
  );
}
