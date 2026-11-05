import { For, Match, Show, Switch, createSignal, onMount } from "solid-js";
import { invoke } from "../../lib/invoke.ts";
import { FailureNote, asFailure, type Failure } from "../../ui/Failure";
import { t } from "../../lib/i18n";
import { Button } from "../../ui/Button";
import RefreshCw from "lucide-solid/icons/refresh-cw";
import { Input } from "../../ui/Input";
import { Toggle } from "../../ui/Toggle";
import { Badge } from "../../ui/Badge";
import { SettingsBlock, SettingsRow, SettingsSection } from "./layout";
import { Governed } from "./Governed";
import "../../locales/settingsPhrases";

/**
 * Lo que contestó la comprobación de frescura. Espeja `context::Frescura`, que
 * es la misma que usa el material: **tres estados y no un booleano**, porque «no
 * se pudo saber» no es «está al día».
 */
type Frescura = {
  id: string;
  estado: "al-dia" | "atrasada" | "sin-saber";
  local?: string;
  porque?: string;
};

/** `environment/skill_sources.rs` · `FuenteInfo`. */
type FuenteDeSkills = {
  id: string;
  rotulo: "casa" | "organizacion";
  nombre: string;
  location: string;
  branch: string;
  path: string;
  missing: boolean;
  /** La dio de alta Terminus: no se quita, se apaga. */
  managed: boolean;
  /** Apagada sigue en disco y no se proyecta a ningún agente. */
  enabled: boolean;
  /**
   * Por qué el contenido que hay en el árbol no sirve, si no sirve.
   *
   * **No es lo mismo que la frescura.** Una fuente puede estar al día con su
   * rama **y** con sus skills fuera de todos los agentes: pasa cuando la
   * revisión que se trajo no valida.
   */
  invalida?: string;
};

/** Una fuente cuyo registro está y no se entiende. `environment/skill_sources.rs` · `Rota`. */
type Rota = { id: string; porque: string };

/** `environment/skill_sources.rs` · `Listado`. */
type Listado = { fuentes: FuenteDeSkills[]; rotas: Rota[] };

/**
 * Los repositorios de skills de una organización, dentro de Estado del entorno.
 *
 * **Aquí y no en la lista de material, y eso es el diseño entero.** Una fuente
 * de skills no es material de contexto: el agente no la lee con `grep`, la carga
 * su CLI, y por eso no vive en `context/` ni sale en la lista de material
 * (`environment/skill_sources.rs` · la cabecera). La pregunta que contesta esta pantalla
 * —qué hay puesto en esta computadora y de quién es— es exactamente la suya.
 *
 * **Las de casa no salen.** Su rótulo es justamente que nadie sepa que detrás
 * hay un repositorio; una fila aquí lo diría. Se refrescan solas al abrir el
 * workspace y su resultado va al log.
 */
export function FuentesDeSkills() {
  const [fuentes, setFuentes] = createSignal<FuenteDeSkills[]>([]);
  const [rotas, setRotas] = createSignal<Rota[]>([]);
  const [frescura, setFrescura] = createSignal<Record<string, Frescura>>({});
  const [trabajando, setTrabajando] = createSignal<string | null>(null);
  const [fallo, setFallo] = createSignal<Failure | null>(null);
  /** Lo que la última baja retiró de los proyectos. No es un error. */
  const [aviso, setAviso] = createSignal<string | null>(null);
  const [url, setUrl] = createSignal("");

  async function recargar() {
    const l = await invoke<Listado>("list_skill_sources");
    setFuentes(l.fuentes);
    setRotas(l.rotas);
  }

  /**
   * La comprobación barata: pregunta por las refs y no baja un objeto.
   *
   * **Va detrás de la lista y no delante.** Sin red cada fuente vuelve como
   * `sin-saber`, y eso no puede dejar la lista sin pintar: lo que hay en el
   * disco se sabe sin preguntarle a nadie.
   */
  async function comprobar() {
    try {
      const rs = await invoke<Frescura[]>("skill_source_freshness");
      setFrescura(Object.fromEntries(rs.map((r) => [r.id, r])));
    } catch {
      // Un fallo aquí no es un fallo de la pantalla: sin conexión es lo normal,
      // y las filas siguen diciendo lo que hay en disco.
      setFrescura({});
    }
  }

  onMount(() => void recargar().then(() => comprobar()));

  async function agregar() {
    const donde = url().trim();
    if (!donde) return;
    setTrabajando("alta");
    setFallo(null);
    setAviso(null);
    try {
      await invoke("add_skill_source", { url: donde, rotulo: "organizacion" });
      setUrl("");
      await recargar();
      await comprobar();
      window.dispatchEvent(new CustomEvent("harness:sources"));
    } catch (e) {
      setFallo({ ...asFailure(e), what: t("settings.skills.error_add") });
    } finally {
      setTrabajando(null);
    }
  }

  /**
   * Trae la fuente y **vuelve a leer la lista pase lo que pase**.
   *
   * El fallo que más importa de este botón —«lo trajo y lo que trajo ya no
   * sirve»— deja escrito en el registro *por qué* (`invalida`), y esa nota es lo
   * que la fila pinta debajo. Recargar solo en el camino bueno la dejaba
   * invisible hasta que alguien remontara el panel: el error de arriba decía que
   * algo falló, y la fila de la fuente seguía tan tranquila.
   */
  async function traer(id: string) {
    setTrabajando(id);
    setFallo(null);
    try {
      await invoke("update_skill_source", { id });
    } catch (e) {
      setFallo({ ...asFailure(e), what: t("settings.skills.error_update") });
    } finally {
      // `recargar` puede tirar, y dentro de un `finally` eso se llevaría por
      // delante el error de arriba y dejaría el botón girando para siempre.
      try {
        await recargar();
      } catch {
        // La lista se queda como estaba; el error del botón sigue en pantalla.
      }
      await comprobar();
      window.dispatchEvent(new CustomEvent("harness:sources"));
      setTrabajando(null);
    }
  }

  /**
   * La baja procede siempre. Lo que contesta es de cuántos proyectos se retiró
   * el mismo repositorio como material, y se dice como aviso, no como error:
   * es lo que el sistema hizo, no lo que no pudo hacer.
   */
  async function quitar(id: string) {
    setTrabajando(id);
    setFallo(null);
    setAviso(null);
    try {
      const r = await invoke<{ projects: number; sessions: number }>(
        "remove_skill_source",
        { id },
      );
      if (r.projects > 0) {
        setAviso(t("settings.skills.retired_from_projects", { count: r.projects }));
      }
      await recargar();
      window.dispatchEvent(new CustomEvent("harness:sources"));
    } catch (e) {
      setFallo({ ...asFailure(e), what: t("settings.skills.error_remove") });
    } finally {
      setTrabajando(null);
    }
  }

  async function alternar(id: string, enabled: boolean) {
    setTrabajando(id);
    setFallo(null);
    try {
      await invoke("set_skill_source_enabled", { id, enabled });
      await recargar();
      window.dispatchEvent(new CustomEvent("harness:sources"));
    } catch (e) {
      setFallo({ ...asFailure(e), what: t("settings.skills.error_toggle") });
    } finally {
      setTrabajando(null);
    }
  }

  return (
    <SettingsSection title={t("settings.skills.title")}>
      <Show when={fallo()}>{(f) => <FailureNote f={f()} />}</Show>
      <Show when={aviso()}>
        {(a) => (
          <p role="status" class="m-0 mb-1.5 text-xs text-neutral-500">
            {a()}
          </p>
        )}
      </Show>

      <Governed section="skills">
      <For each={fuentes()}>
        {(f) => (
          <SettingsRow
            label={
              <span class="flex min-w-0 items-center gap-2">
                <span class="truncate" title={f.location}>
                  {f.nombre}
                </span>
                <Badge forma="dato">{f.branch}</Badge>
              </span>
            }
            description={
              <>
                <Switch fallback={<span>{t("settings.skills.not_checked")}</span>}>
                  <Match when={f.missing}>
                    <span>{t("settings.skills.missing")}</span>
                  </Match>
                  {/* Una gestionada se trae sola en el siguiente arranque: el
                      aviso de atrasada pediría un gesto que no hay. */}
                  <Match when={f.managed}>
                    <span>{t("settings.skills.managed_self_updating")}</span>
                  </Match>
                  <Match when={frescura()[f.id]?.estado === "al-dia"}>
                    <span>{t("settings.skills.uptodate")}</span>
                  </Match>
                  <Match when={frescura()[f.id]?.estado === "atrasada"}>
                    <span class="text-warning-strong">{t("settings.skills.behind")}</span>
                  </Match>
                  {/* Leer «no se pudo preguntar» como «al día» daría por fresco
                      un criterio que nadie pudo comprobar. */}
                  <Match when={frescura()[f.id]?.estado === "sin-saber"}>
                    <span>
                      {t("settings.skills.unknown")}: {frescura()[f.id]?.porque}
                    </span>
                  </Match>
                </Switch>
                {/* Al día con su rama y con sus skills fuera de todos los
                    agentes a la vez: sin esta línea la fila diría «al día». */}
                <Show when={f.invalida}>
                  {(porque) => (
                    <div class="break-words text-warning-strong">
                      {t("settings.skills.invalid")}: {porque()}
                    </div>
                  )}
                </Show>
              </>
            }
          >
            {/* La gestionada no se trae ni se quita: se actualiza sola en cada
                arranque. */}
            <Show when={!f.managed}>
              <Button
                variant="ghost"
                size="compact"
                disabled={trabajando() !== null}
                onClick={() => void traer(f.id)}
              >
                <RefreshCw size={14} class="shrink-0" />
                {trabajando() === f.id
                  ? t("settings.skills.fetching")
                  : t("settings.skills.fetch")}
              </Button>
              <Button
                variant="ghost"
                size="compact"
                disabled={trabajando() !== null}
                onClick={() => void quitar(f.id)}
              >
                {t("settings.skills.remove")}
              </Button>
            </Show>
            {/* Una propia también se apaga y se vuelve a encender aquí. */}
            <Toggle
              checked={f.enabled}
              disabled={trabajando() !== null}
              label={f.nombre}
              onChange={() => void alternar(f.id, !f.enabled)}
            />
          </SettingsRow>
        )}
      </For>

      {/* Callar una ilegible dejaría una carpeta que nadie puede ver ni quitar
          reteniendo su clon. Lo que sale es su id, nunca una dirección. */}
      <For each={rotas()}>
        {(r) => (
          <SettingsRow
            label={
              <span class="flex min-w-0 items-center gap-2">
                <span class="truncate">{t("settings.skills.broken")}</span>
                <Badge forma="dato">{r.id}</Badge>
              </span>
            }
            description={<span class="break-words">{r.porque}</span>}
          >
            <Button
              variant="ghost"
              size="compact"
              disabled={trabajando() !== null}
              onClick={() => void quitar(r.id)}
            >
              {t("settings.skills.remove")}
            </Button>
          </SettingsRow>
        )}
      </For>

      {/* La rama no se pide: sin ella se usa la principal que declara el remoto,
          que es el dato que solo tiene el repositorio. */}
      <SettingsBlock class="flex items-center gap-2">
        <Input
          type="text"
          value={url()}
          placeholder={t("settings.skills.url_placeholder")}
          onInput={(e) => setUrl(e.currentTarget.value)}
        />
        <Button
          variant="secondary"
          size="md"
          disabled={trabajando() !== null || !url().trim()}
          onClick={() => void agregar()}
        >
          {trabajando() === "alta"
            ? t("settings.skills.adding")
            : t("settings.skills.add")}
        </Button>
      </SettingsBlock>
      </Governed>
    </SettingsSection>
  );
}
