import { For, Show, createSignal, onMount } from "solid-js";
import { setWorkspaceLanguage } from "../queries/engine-language";
import { listWorkspaces } from "../queries/engine-workspaces";
import { Select } from "../../../../ui/src/Select";
import {
  aplicarLenguaDeWorkspace,
  elegirLengua,
  lenguasDisponibles,
  semillaDelAlta,
  t,
} from "../../../../ui/src/lib/i18n";
import type { Startup } from "../queries/workspaces-store";
import { SettingsRow } from "../../../../ui/src/SettingsLayout";

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
 * Cada lengua se nombra en su lengua. El endónimo sale del manifiesto y **no
 * pasa por `t`**: traducido solo lo lee quien no necesitaba el selector.
 */
export function Lengua(props: { row?: boolean }) {
  /** El workspace abierto, o `null` si todavía no hay ninguno (el alta). */
  const [workspace, setWorkspace] = createSignal<string | null>(null);
  /** Lo elegido: un código, o `""` para heredar. */
  const [valor, setValor] = createSignal(semillaDelAlta() === "sistema" ? "" : semillaDelAlta());

  onMount(() => {
    // Se pregunta en vez de recibirlo por props porque este componente lo monta
    // `General`, que no conoce el workspace, y el paso 1 del alta, donde no
    // existe. Preguntar aquí deja a los dos montarlo sin saber nada.
    void listWorkspaces<Startup>()
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

  function elegir(codigo: string) {
    setValor(codigo);
    const id = workspace();
    if (id === null) {
      elegirLengua(codigo === "" ? "sistema" : codigo);
      return;
    }
    // Se pinta ya y se guarda después: esperar al disco para cambiar de lengua
    // deja el desplegable diciendo una cosa y la pantalla otra.
    aplicarLenguaDeWorkspace(codigo === "" ? null : codigo);
    void setWorkspaceLanguage({ id, lengua: codigo === "" ? null : codigo }).then(
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
      onChange={(e) => elegir(e.currentTarget.value)}
    >
      {/* Una sola opción de «no elegir», y dice qué pasa: seguir al sistema.
          Solo se guarda la lengua del workspace; el que no declara ninguna
          sigue al sistema, con el inglés de respaldo si esa lengua no tiene
          catálogo (`lib/i18n.ts`, `resolver`). */}
      <option value="">{t("settings.language.system")}</option>
      <For each={lenguasDisponibles()}>
        {(m) => <option value={m.codigo}>{m.endonimo}</option>}
      </For>
    </Select>
  );

  return (
    <Show
      when={props.row}
      fallback={
        <section class="grid gap-2">
          <h3 class="m-0 text-ui font-semibold">{t("settings.language.title")}</h3>
          {selector()}
        </section>
      }
    >
      <SettingsRow label={t("settings.language.app")}>
        {selector()}
      </SettingsRow>
    </Show>
  );
}
