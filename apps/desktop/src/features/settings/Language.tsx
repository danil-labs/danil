import { For, Show, createSignal, onMount } from "solid-js";
import { invoke } from "../../engine/client.ts";
import { Select } from "../../ui/Select";
import {
  aplicarLenguaDeWorkspace,
  elegirLengua,
  lenguasDisponibles,
  semillaDelAlta,
  t,
  type Manifiesto,
} from "../../lib/i18n";
import { instalarDelBundle, lenguasDelBundle } from "../../locales/packs";
import { FailureNote, asFailure, type Failure } from "../../ui/Failure";
import type { Startup } from "./workspaces-store";
import { SettingsRow } from "./layout";

/**
 * En qué lengua se pinta la app. Vale para dos sitios, y cambia qué escribe:
 *
 * | | Qué escribe |
 * |---|---|
 * | Dentro de un workspace (Configuración) | Su `meta.json` |
 * | Sin workspace todavía (paso 1 del alta) | La preferencia de la máquina |
 *
 * La lengua es del workspace: con varios clientes se trabaja en una lengua
 * distinta con cada uno. La preferencia de la máquina solo rige antes de que
 * exista alguno, y un workspace que no declara nada hereda de ella.
 *
 * Es un desplegable y no una fila de botones: las lenguas crecen con cada
 * paquete instalado y una fila deja de caber.
 *
 * **Se ofrece también lo que la app trae sin instalar, y elegirlo lo instala:**
 * un paquete del bundle no está registrado en el motor hasta copiarse al app
 * data (`locales::Disponible`). No es el canal de descarga que sigue sin
 * decidirse — el archivo ya está en el disco y no se pide por red. La
 * instalación se ve mientras tarda y se deshace si falla: si la copia no queda
 * usable, el desplegable vuelve a la lengua de antes con el error debajo.
 *
 * Cada lengua se nombra en su lengua. El endónimo sale del manifiesto y **no
 * pasa por `t`**: traducido solo lo lee quien no necesitaba el selector.
 */
export function Lengua(props: { row?: boolean }) {
  /** El workspace abierto, o `null` si todavía no hay ninguno (el alta). */
  const [workspace, setWorkspace] = createSignal<string | null>(null);
  /** Lo elegido: un código, o `""` para heredar. */
  const [valor, setValor] = createSignal(semillaDelAlta() === "sistema" ? "" : semillaDelAlta());
  /** Lo que la app trae dentro, se haya instalado o no. Se lee una vez. */
  const [delBundle, setDelBundle] = createSignal<Manifiesto[]>([]);
  /** La que se está copiando al app data ahora mismo, o `null`. */
  const [instalando, setInstalando] = createSignal<Manifiesto | null>(null);
  const [fallo, setFallo] = createSignal<Failure | null>(null);

  /**
   * Las que trae la app y todavía no están puestas. Se calcula contra
   * `lenguasDisponibles()` —los catálogos registrados— en vez de guardarse en
   * una señal aparte: aquella lee la revisión del motor, así que instalar una
   * lengua la cambia de grupo sola, sin volver a preguntar al backend.
   */
  const sinInstalar = (): Manifiesto[] => {
    const puestas = new Set(lenguasDisponibles().map((m) => m.codigo));
    return delBundle().filter((m) => !puestas.has(m.codigo));
  };

  onMount(() => {
    void lenguasDelBundle().then(setDelBundle);
    // Se pregunta en vez de recibirlo por props porque este componente lo monta
    // `General`, que no conoce el workspace, y el paso 1 del alta, donde no
    // existe. Preguntar aquí deja a los dos montarlo sin saber nada.
    void invoke<Startup>("list_workspaces")
      .then((s) => {
        const activo = s.workspaces.find((w) => w.id === s.active);
        if (!activo) return;
        setWorkspace(activo.id);
        setValor(activo.lengua ?? "");
      })
      .catch(() => {
        // Sin workspaces el selector sigue sirviendo: escribe la preferencia de
        // la máquina, que es lo que corresponde antes de que haya ninguno.
      });
  });

  /**
   * Instala primero si hace falta, y pone la lengua después. El orden no es
   * negociable: `aplicarLenguaDeWorkspace` con un código sin catálogo cae al
   * respaldo y guarda igual — el workspace declararía una lengua que la app no
   * puede pintar, sin decir por qué.
   */
  async function elegir(codigo: string) {
    const previo = valor();
    setValor(codigo);
    setFallo(null);
    const porInstalar = sinInstalar().find((m) => m.codigo === codigo);
    if (porInstalar) {
      setInstalando(porInstalar);
      try {
        await instalarDelBundle(codigo);
      } catch (e) {
        // A la de antes, y con el error debajo. Sin esto el desplegable se queda
        // nombrando una lengua que no se instaló.
        setValor(previo);
        setFallo({
          ...asFailure(e),
          what: t("settings.language.error_install", { language: porInstalar.endonimo }),
        });
        return;
      } finally {
        setInstalando(null);
      }
      // `SalidaDelAgente` es un hermano, no un hijo: avisa que el conjunto de
      // capacidades instaladas cambió para que aparezca sin recargar Ajustes.
      window.dispatchEvent(new Event("harness:language-pack"));
    }
    poner(codigo);
  }

  /** Dónde se guarda la elección, que es lo que cambia entre el alta y Configuración. */
  function poner(codigo: string) {
    const id = workspace();
    if (id === null) {
      elegirLengua(codigo === "" ? "sistema" : codigo);
      return;
    }
    // Se pinta ya y se guarda después: esperar al disco para cambiar de lengua
    // deja el desplegable diciendo una cosa y la pantalla otra.
    aplicarLenguaDeWorkspace(codigo === "" ? null : codigo);
    void invoke("set_workspace_language", { id, lengua: codigo === "" ? null : codigo }).then(
      // Cambiar la interfaz cambia lo que `SalidaDelAgente` puede ofrecer, y el
      // backend además apaga la salida que deja de corresponder. Sin este aviso
      // su casilla queda marcada sobre un ajuste que ya no existe.
      () => window.dispatchEvent(new Event("harness:language-pack")),
    );
  }

  const selector = () => (
    <Select
      variant={props.row ? "ghost" : "default"}
      class={
        props.row
          ? "min-h-8 w-auto px-1.5 text-sm focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-primary"
          : "w-fit min-w-56"
      }
      aria-label={t("settings.language.title")}
      value={valor()}
      disabled={instalando() !== null}
      onChange={(e) => void elegir(e.currentTarget.value)}
    >
      {/* Una sola opción de «no elegir», y dice qué pasa: seguir al sistema.
          Solo se guarda la lengua del workspace; el que no declara ninguna
          sigue al sistema, con el inglés de respaldo si esa lengua no tiene
          paquete (`lib/i18n.ts`, `resolver`). */}
      <option value="">{t("settings.language.system")}</option>
      <For each={lenguasDisponibles()}>
        {(m) => <option value={m.codigo}>{m.endonimo}</option>}
      </For>
      {/* Un grupo con nombre, y el nombre es el estado. Elegir una de estas
          la instala, con lo que tarda a la vista y sin renglón que lo
          explique. El grupo desaparece cuando no queda ninguna. */}
      <Show when={sinInstalar().length > 0}>
        <optgroup label={t("settings.language.not_installed")}>
          <For each={sinInstalar()}>
            {(m) => <option value={m.codigo}>{m.endonimo}</option>}
          </For>
        </optgroup>
      </Show>
    </Select>
  );

  const estado = () => (
    <>
      <Show when={instalando()}>
        {(m) => (
          <p class="m-0 text-xs text-neutral-500">
            {t("settings.language.installing", { language: m().endonimo })}
          </p>
        )}
      </Show>
      <Show when={fallo()}>{(f) => <FailureNote f={f()} />}</Show>
    </>
  );

  return (
    <Show
      when={props.row}
      fallback={
        <section class="grid gap-2">
          <h3 class="m-0 text-ui font-semibold">{t("settings.language.title")}</h3>
          {selector()}
          {estado()}
        </section>
      }
    >
      <SettingsRow
        label={t("settings.language.app")}
        description={instalando() || fallo() ? estado() : undefined}
      >
        {selector()}
      </SettingsRow>
    </Show>
  );
}
