import { For, Show, createEffect, createSignal, on, onCleanup, onMount } from "solid-js";
import { isNoMachines, machineAvailability } from "../../../../host/src/platform";
import { listLanguagePacks, setWorkspaceOutputLanguage } from "../queries/engine-language";
import { listWorkspaces } from "../queries/engine-workspaces";
import { Select } from "../../../../ui/src/Select";
import { t, type Manifiesto } from "../../../../ui/src/lib/i18n";
import type { Paquete } from "../../../../session/src/packs";
import type { Startup } from "../queries/workspaces-store";
import { SettingsRow } from "../../../../ui/src/SettingsLayout";
import { Input } from "../../../../ui/src/Input";

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

  function cargarInstalados() {
    void listLanguagePacks<Paquete[]>().then((paquetes) => {
      const opciones = paquetes.flatMap((p) => {
        const manifiesto = p.manifiesto;
        if (!manifiesto?.salida) return [];
        if (manifiesto.codigo !== lenguaDelEspacio()) return [];
        return [manifiesto];
      });
      setInstalados(opciones);
    }).catch(() => {});
  }

  /**
   * Primero el workspace y después los paquetes, siempre en ese orden: qué se
   * ofrece depende de la lengua de la interfaz. Pedir los paquetes antes los
   * filtra a cero y la sección desaparece — o queda vacía si nadie vuelve a
   * preguntar.
   */
  function cargarTodo() {
    if (isNoMachines()) {
      setInstalados([]);
      return;
    }
    void listWorkspaces<Startup>().then((s) => {
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
    // El mismo evento cubre lo que cambia lo ofrecible al cambiar la lengua de
    // la interfaz, que además apaga la salida en el backend.
    window.addEventListener("harness:language-pack", cargarTodo);
    onCleanup(() => window.removeEventListener("harness:language-pack", cargarTodo));
  });

  let lastAvailability = machineAvailability().kind;
  createEffect(on(() => machineAvailability().kind, (kind) => {
    const prev = lastAvailability;
    lastAvailability = kind;
    if (kind === prev) return;
    if (kind === "no_machines") {
      setInstalados([]);
      return;
    }
    if (prev === "no_machines" && (kind === "ready" || kind === "offline")) cargarTodo();
  }, { defer: true }));

  async function elegir(codigo: string, control?: HTMLInputElement | HTMLSelectElement) {
    const id = workspace();
    if (!id) return;
    try {
      await setWorkspaceOutputLanguage({ id, lengua: codigo || null });
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
              <Input
                variant="plain"
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
