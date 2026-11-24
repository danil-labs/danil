import { For, Show, createSignal, onCleanup, onMount } from "solid-js";
import { callShellViewEngine } from "../../../session/src/shell-view-queries.ts";
import { Button } from "../../../ui/src/Button";
import { Toast } from "../../../ui/src/Toast";
import type { Source } from "../../../ui/src/lib/model";
import { t } from "../../../ui/src/lib/i18n";
import { prosaDe } from "../../../ui/src/Failure";

/**
 * El aviso de que el material de contexto tiene algo nuevo, abajo a la derecha.
 *
 * **Existe porque nadie entra a Configuración a preguntar.** La lista de fuentes
 * tiene su botón de comprobar y sirve para quien va a mirar; esto es para quien
 * no va a ir. Sin ello, el material se queda en el commit del día que se
 * adjuntó y el agente contesta sobre un repositorio que el equipo movió hace
 * semanas.
 *
 * Es hermano de `AvisoDeVersion` y comparte su forma: una tarjeta que no
 * interrumpe. Material nuevo **no es urgente** —lo que estás haciendo funciona
 * igual— así que un modal cobraría una atención que no le corresponde.
 *
 * **Sin internet no pasa nada, y eso es un requisito.** La app trabaja sin red:
 * el material está en disco y las tareas corren igual. Cuando no se puede
 * preguntar, `source_freshness` contesta `sin-saber` por fuente y aquí no se
 * pinta nada — **ni reintento visible, ni aviso de que no se pudo comprobar**,
 * que sería convertir una condición normal en un error recurrente.
 *
 * **Pregunta al minuto de abrir, cada quince, al volver la ventana al foco y al
 * empezar una tarea.** Lo último es lo más útil: es cuando la persona se hace
 * esa pregunta igual, y cuando contestarla sale más barato —la tarea no tiene
 * todavía ningún turno con una versión vieja en la memoria—. **Al arranque no:**
 * preguntar por las refs no baja objetos pero cuesta una conexión por fuente
 * (`source_freshness`, 99 fuentes en 193 s), y competir con el primer arranque
 * retrasa la primera pregunta de quien abre la app. **Y solo con la ventana
 * visible**, porque una app de escritorio se queda semanas abierta detrás de
 * otras cosas.
 *
 * **No trae nada solo.** Traer mueve el árbol que los agentes leen, y los turnos
 * que ya corrieron citaron `archivo:línea` sobre el estado anterior: después de
 * traer, esas citas apuntan a otra cosa sin que nada avise, y el agente sigue
 * recordando lo que leyó (`context::update_source`). Decide la persona, con el
 * botón de esta tarjeta.
 *
 * **Se trae aunque una tarea lo esté leyendo.** El agente lee archivo por
 * archivo y nota lo que cambió en los diffs, igual que cuando el equipo empuja
 * a un repositorio que alguien tiene abierto; hacer esperar a la persona a que
 * acabe el turno no protegía nada y la dejaba sin poder traer lo nuevo.
 *
 * **Descartar es descartar de verdad** hasta que ese material vuelva a moverse:
 * se recuerda por fuente y por el commit que tenía en disco, así que el aviso
 * vuelve solo si el remoto avanza otra vez o si traes lo nuevo. Un aviso que
 * reaparece a los diez minutos con lo mismo es el que se aprende a ignorar.
 */

/** `workspace/context.rs` · `Frescura`. */
type Frescura = {
  id: string;
  estado: "al-dia" | "atrasada" | "sin-saber";
  local?: string;
  porque?: string;
};

/** Al minuto de abrir, y luego cada cuarto de hora. */
const PRIMERA = 60 * 1000;
const CADA = 15 * 60 * 1000;

export default function AvisoDeMaterial() {
  const [atrasadas, setAtrasadas] = createSignal<Frescura[]>([]);
  /** Cómo se llama cada fuente en pantalla, por id: su nombre con su rama. */
  const [nombres, setNombres] = createSignal<Record<string, string>>({});
  const [trayendo, setTrayendo] = createSignal(false);
  const [fallo, setFallo] = createSignal<string | null>(null);
  /** Lo que esta persona ya descartó, como `<fuente>:<commit que tenía>`. */
  const [descartadas, setDescartadas] = createSignal<string[]>([]);
  const clave = (f: Frescura) => `${f.id}:${f.local ?? ""}`;
  const visibles = () => atrasadas().filter((f) => !descartadas().includes(clave(f)));
  // Las fuentes son del workspace activo: al cambiar de cliente, lo comprobado
  // en el anterior deja de valer y una respuesta en vuelo llega tarde.
  let vuelta = 0;

  async function mirar() {
    if (document.visibilityState !== "visible") return;
    const mia = vuelta;
    void callShellViewEngine("sync_workspace_context", { force: false }).catch(() => {});
    try {
      const rs = await callShellViewEngine<Frescura[]>("source_freshness");
      const nuevas = rs.filter((f) => f.estado === "atrasada");
      if (mia !== vuelta) return;
      if (nuevas.length === 0) {
        setAtrasadas([]);
        return;
      }
      // Los nombres se piden solo cuando hay algo que nombrar: la lista de
      // fuentes es de disco y barata, pero pedirla en cada vuelta sería
      // trabajo para no decir nada.
      const ss = await callShellViewEngine<Source[]>("list_sources");
      if (mia !== vuelta) return;
      const raices = new Set(ss.filter((s) => s.root === true).map((s) => s.id));
      const secundarias = nuevas.filter((f) => !raices.has(f.id));
      setNombres(Object.fromEntries(ss.map((s) => [s.id, s.etiqueta])));
      setAtrasadas(secundarias);
    } catch {
      // Sin red, o sin workspace abierto todavía, no se sabe si hay novedad — y
      // eso no es un fallo de la app. No se pinta nada y se sigue trabajando.
    }
  }

  onMount(() => {
    const primera = setTimeout(() => void mirar(), PRIMERA);
    const cada = setInterval(() => void mirar(), CADA);
    // Volver a la ventana es cuando más barato sale enterarse: la persona acaba
    // de mirar aquí, así que la latencia no le quita nada.
    const alVolver = () => {
      if (document.visibilityState === "visible") void mirar();
    };
    document.addEventListener("visibilitychange", alVolver);
    // Y al empezar una tarea, que es cuando la pregunta «¿está al día lo que voy
    // a leer?» se hace sola. Lo emite `nuevaSesion`.
    const alEmpezar = () => void mirar();
    window.addEventListener("harness:tarea-nueva", alEmpezar);
    const alMudar = () => {
      vuelta++;
      setAtrasadas([]);
      setFallo(null);
    };
    window.addEventListener("harness:workspace", alMudar);
    onCleanup(() => {
      clearTimeout(primera);
      clearInterval(cada);
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener("harness:tarea-nueva", alEmpezar);
      window.removeEventListener("harness:workspace", alMudar);
    });
  });

  /**
   * Trae lo nuevo de las fuentes que lo tienen.
   *
   * Una por una y no en paralelo: cada una mueve un árbol de git, y si una
   * falla su motivo tiene que poder enseñarse sin ambigüedad sobre cuál fue.
   */
  async function traer() {
    const mia = vuelta;
    setTrayendo(true);
    setFallo(null);
    const quedan: Frescura[] = [];
    for (const f of visibles()) {
      try {
        await callShellViewEngine("update_source", { id: f.id });
      } catch (e) {
        quedan.push(f);
        setFallo(typeof e === "string" ? e : prosaDe(e));
      }
    }
    setTrayendo(false);
    if (mia !== vuelta) return;
    setAtrasadas(quedan);
    // El material del workspace cambió: lo que lo lee tiene que releerlo. NO es
    // `harness:workspace`, que significa «cambiaste de cliente» y cierra la
    // conversación abierta.
    window.dispatchEvent(new CustomEvent("harness:sources"));
  }

  return (
    <Show when={visibles().length > 0}>
      <Toast>
        <p class="m-0 text-ui font-semibold">
          {t("shell.material.title", { count: visibles().length })}
        </p>
        {/* Cuáles, por su nombre: «una fuente» no dice si es la que la tarea de
            ahora está leyendo. */}
        <ul class="m-0 grid list-none gap-0.5 p-0 text-xs text-neutral-500">
          <For each={visibles().slice(0, 4)}>
            {(f) => <li class="truncate">{nombres()[f.id] ?? f.id}</li>}
          </For>
          <Show when={visibles().length > 4}>
            <li>{t("shell.material.more", { count: visibles().length - 4 })}</li>
          </Show>
        </ul>

        <Show when={fallo()}>
          {(f) => <p class="m-0 text-xs text-error-strong">{f()}</p>}
        </Show>

        <div class="flex gap-1.5">
          <Button
            size="sm"
            disabled={trayendo()}
            onClick={() => void traer()}
            title={t("shell.material.fetch_title")}
          >
            {trayendo() ? t("shell.material.fetching") : t("shell.material.fetch")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={trayendo()}
            onClick={() => setDescartadas([...descartadas(), ...visibles().map(clave)])}
          >
            {t("shell.material.dismiss")}
          </Button>
        </div>
      </Toast>
    </Show>
  );
}
