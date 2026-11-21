import { For, Show, createSignal, onCleanup, onMount } from "solid-js";
import { invoke } from "../../engine/client.ts";
import { Select } from "../../ui/Select";
import { t, type Manifiesto } from "../../lib/i18n";
import { instalarDelBundle, lenguasDelBundle, type Paquete } from "../../locales/packs";
import type { Startup } from "./workspaces-store";
import { SettingsRow } from "./layout";

/**
 * El perfil que pide en qué lengua contesta el agente. Solo se ofrece la
 * lengua en la que está la interfaz de este workspace.
 *
 * No comparte estado con `Lengua`: elegir la interfaz no enciende esto. Apagar
 * la interfaz sí lo apaga (`workspaces::set_workspace_language`): un ajuste
 * guardado que la pantalla ya no enseña se seguiría proyectando al turno.
 */
export function SalidaDelAgente() {
  const [workspace, setWorkspace] = createSignal<string | null>(null);
  const [valor, setValor] = createSignal("");
  /** La lengua de la interfaz de este workspace: la única que se puede ofrecer. */
  const [lenguaDelEspacio, setLenguaDelEspacio] = createSignal<string | null>(null);
  const [instalados, setInstalados] = createSignal<Manifiesto[]>([]);
  /** Paquetes incluidos que ya están en disco, pero todavía no traen perfil. */
  const [porActualizar, setPorActualizar] = createSignal<Set<string>>(new Set());

  function cargarInstalados() {
    void Promise.all([
      invoke<Paquete[]>("list_language_packs"),
      lenguasDelBundle(),
    ]).then(([paquetes, disponibles]) => {
      const perfilesIncluidos = new Map(
        disponibles.filter((m) => m.salida).map((m) => [m.codigo, m]),
      );
      const actualizar = new Set<string>();
      const opciones = paquetes.flatMap((p) => {
        const manifiesto = p.manifiesto;
        if (!manifiesto) return [];
        // La regla, en el único sitio donde se decide qué se ofrece.
        if (manifiesto.codigo !== lenguaDelEspacio()) return [];
        if (manifiesto.salida) return [manifiesto];
        const nuevo = perfilesIncluidos.get(manifiesto.codigo);
        if (!nuevo) return [];
        // Es el mismo paquete que ya se instaló, pero una versión anterior: no
        // se finge que el perfil existe. El checkbox lo actualiza con el
        // paquete incluido que ya está dentro de Terminus, sin red.
        actualizar.add(manifiesto.codigo);
        return [nuevo];
      });
      setInstalados(opciones);
      setPorActualizar(actualizar);
    });
  }

  /**
   * Primero el workspace y después los paquetes, siempre en ese orden: qué se
   * ofrece depende de la lengua de la interfaz. Pedir los paquetes antes los
   * filtra a cero y la sección desaparece — o queda vacía si nadie vuelve a
   * preguntar.
   */
  function cargarTodo() {
    void invoke<Startup>("list_workspaces").then((s) => {
      const activo = s.workspaces.find((w) => w.id === s.active);
      if (!activo) {
        setInstalados([]);
        return;
      }
      setWorkspace(activo.id);
      setValor(activo.lengua_de_salida ?? "");
      setLenguaDelEspacio(activo.lengua ?? null);
      cargarInstalados();
    }).catch(() => {});
  }

  onMount(() => {
    cargarTodo();
    // El mismo evento cubre lo que cambia lo ofrecible: instalar un paquete y
    // cambiar la lengua de la interfaz. La segunda además apaga la salida en el
    // backend: sin releer, se enseñaría una casilla marcada sobre un ajuste que
    // ya no existe.
    window.addEventListener("harness:language-pack", cargarTodo);
    onCleanup(() => window.removeEventListener("harness:language-pack", cargarTodo));
  });

  async function elegir(codigo: string, control?: HTMLInputElement | HTMLSelectElement) {
    const id = workspace();
    if (!id) return;
    try {
      if (codigo && porActualizar().has(codigo)) {
        await instalarDelBundle(codigo);
        setPorActualizar((pendientes) => {
          const siguiente = new Set(pendientes);
          siguiente.delete(codigo);
          return siguiente;
        });
      }
      await invoke("set_workspace_output_language", { id, lengua: codigo || null });
      setValor(codigo);
    } catch {
      if (control instanceof HTMLInputElement && control.type === "checkbox") {
        control.checked = valor() === codigo;
      } else if (control) {
        control.value = valor();
      }
      alert(t("settings.output.error_save"));
    }
  }

  return (
    <Show when={instalados().length > 0}>
      <SettingsRow label={t("settings.output.title")}>
        <Show
          when={instalados()[0]}
          fallback={
            <Select
              variant="ghost"
              class="min-h-8 w-auto px-1.5 text-sm focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-primary"
              aria-label={t("settings.output.title")}
              value={valor()}
              onChange={(e) => void elegir(e.currentTarget.value, e.currentTarget)}
            >
              <option value="">{t("settings.output.default")}</option>
              <For each={instalados()}>{(m) => <option value={m.codigo}>{m.endonimo}</option>}</For>
            </Select>
          }
        >
          {(unico) => (
            <label class="flex w-fit items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={valor() === unico().codigo}
                onChange={(e) => void elegir(e.currentTarget.checked ? unico().codigo : "", e.currentTarget)}
              />
              {t("settings.output.enable", { language: unico().endonimo })}
            </label>
          )}
        </Show>
      </SettingsRow>
    </Show>
  );
}
