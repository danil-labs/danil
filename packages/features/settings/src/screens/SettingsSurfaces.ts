import { createSignal, onCleanup, onMount } from "solid-js";
import { listSurfaces } from "../queries/engine-workspaces";
import { listen } from "../../../../host/src/serviceEvents.ts";
import { type Superficie } from "../../../../../apps/desktop/src/lib/surfaces";
import { asFailure } from "../../../../ui/src/Failure";
import type { SurfacesState } from "../model/ai-providers-view";
import { pestanasDe, entradasDe } from "./SettingsTabs";
import type Settings from "./SettingsScreen";

export function createSuperficiesDeAjustes(props: Parameters<typeof Settings>[0]) {
  // Lo que se puede elegir para trabajar, que es lo que decide qué proveedores
  // tienen pantalla. Con su estado: aquí no apaga nada, lo enseña.
  const [superficies, setSuperficies] = createSignal<Superficie[]>([]);
  const [estadoSuperficies, setEstadoSuperficies] = createSignal<SurfacesState>({ k: "loading" });
  /**
   * **Sólo se guarda si de verdad cambió**, y eso no es una optimización.
   *
   * `list_surfaces` devuelve objetos nuevos en cada llamada, así que escribir la
   * señal con una respuesta idéntica despierta a todo el que la lea para nada.
   *
   * **Es la tercera de tres defensas, y sola no bastaba.** Las otras dos son
   * `destinosDe`, que recibe el accesor para que el panel no se monte de nuevo,
   * y el `For` por id de proveedor de `AIProviders`, que reutiliza la fila cuando el contenido sí
   * cambia. Esta solo cubre el caso fácil —que no haya cambiado nada— y no el
   * otro: **añadir una cuenta cambia la lista de verdad**, porque la insignia del
   * proveedor sale de `surfaces::sin_cuenta`.
   *
   * Comparar por JSON basta: son datos planos que vienen de Rust en un orden
   * fijo (el de `agents::AGENTS`), así que dos respuestas iguales se serializan
   * igual.
   */
  const cargarSuperficies = () => {
    void listSurfaces<Superficie[]>()
      .then((s) => {
        setSuperficies((antes) =>
          JSON.stringify(antes) === JSON.stringify(s) ? antes : s,
        );
        setEstadoSuperficies({ k: "ready" });
      })
      // Lo que ya se veía se queda; sin nada, el panel dice por qué (una VM encendiéndose, por ejemplo).
      .catch((e) => setEstadoSuperficies({ k: "failed", f: asFailure(e) }));
  };
  onMount(cargarSuperficies);

  /**
   * **Instalar un CLI cambia lo que esta pantalla afirma, así que se vuelve a
   * preguntar.**
   *
   * Se leía una sola vez al montar. La insignia de cada proveedor sale de aquí
   * —`superficie.marca`, que dice «no instalado» mirando si hay binario— así que
   * tras instalar desde el propio panel la fila seguía diciendo que no está,
   * mientras el botón de instalar sí desaparecía: `Accounts` vuelve a pedir
   * `list_providers` con este mismo evento y esta lista no: quedan dos verdades
   * sobre lo mismo en la misma tarjeta, y la que se lee primero es la falsa —«se
   * instaló pero sale no instalado, y ya no sale instalar»—. `App.tsx` hace lo
   * mismo para el menú del chat.
   */
  onMount(() => {
    const cambios = listen("providers", cargarSuperficies);
    // **Y conectar una cuenta también cambia lo que esta pantalla afirma.** La
    // insignia de un proveedor dice «sin cuenta» mirando cuál está elegida
    // (`surfaces::sin_cuenta`), así que guardar una clave la deja mintiendo
    // igual que la dejaba instalar un CLI. `App.tsx` ya escuchaba este evento
    // para el menú del chat, con el motivo escrito ahí; faltaba aquí.
    const cuenta = listen("account", cargarSuperficies);
    window.addEventListener("harness:consentimiento", cargarSuperficies);
    // Una máquina de la cuenta se encendió o trajo otra rebanada: su lista puede haber llegado.
    window.addEventListener("harness:machine-slices", cargarSuperficies);
    onCleanup(() => {
      window.removeEventListener("harness:consentimiento", cargarSuperficies);
      window.removeEventListener("harness:machine-slices", cargarSuperficies);
      void cambios.then((f) => f());
      void cuenta.then((f) => f());
    });
  });
  const pestanas = pestanasDe(superficies, {
    get modelos() {
      return props.modelos;
    },
    get proyecto() {
      return props.proyecto ?? "";
    },
    get agentesEnUso() {
      return props.agentesEnUso ?? [];
    },
    onAgentProfile: (project, name) => props.onAgentProfile?.(project, name),
    get estadoSuperficies() {
      return estadoSuperficies();
    },
    reintentarSuperficies: () => {
      setEstadoSuperficies({ k: "loading" });
      cargarSuperficies();
    },
  }, props.proyectos, () => props.workspace ?? null, () => props.activityMachine ?? null, props.maquinas, props.piezas, props.sesiones, props.avisoReparacion, props.integraciones);
  const ENTRADAS = entradasDe(pestanas);
  return { ENTRADAS };
}
