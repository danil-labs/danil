import { lazy, Show, Suspense } from "solid-js";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { TaskActionToast } from "../components/TaskActionToast";
import type { SessionsProps } from "./sessions-model";
import { createSessionsState } from "./sessions-state";
import { createConTarjeta, createFilaDelRiel } from "./sessions-card";
import { createFila } from "./sessions-row";
import { createAuthorGroups, createRama } from "./sessions-branch";

// Solo hace falta cuando algo estorba al terminar o archivar: fuera de la carga inicial.
const TaskBlockersDialog = lazy(() => import("../components/TaskBlockersDialog"));

/**
 * El historial del proyecto. `Nueva tarea` es una acción del sidebar, arriba de
 * la lista, y sobrevive al riel cuando la lista no.
 *
 * **En pantalla es «tarea» y en el código es `Session`**: quien usa la app pide
 * una tarea, y «sesión» nombra el mecanismo con que se cumple —un proceso de
 * agente que arranca, contesta y se reanuda—. Ver `workspace/sessions.rs`.
 *
 * **Las hijas van anidadas bajo su padre y no se mueven de proyecto.** Una tarea
 * hija es un encargo despachado por su padre (`workspace/orchestration.rs`) y la anidación
 * ES esa relación: moverla sola dejaría al padre apuntando a un id que ya no
 * está en su proyecto. Borrarse sí puede — un encargo fallido se limpia aquí.
 *
 * **Plegado dice qué esconde.** El chevron es el mismo control con que se pliega
 * un proyecto en el riel (`chasis/Sidebar.tsx`), y el hueco se reserva también
 * en las filas sin hijas para que los títulos no se desalineen. Una subtarea no
 * es una carpeta —puede estar parada esperando a una persona—, así que plegada
 * la fila lleva dos datos y ninguna glosa:
 *
 * - **Cuántas esconde**, en número. El plural lo declara el catálogo, nunca un
 *   ternario en el JSX, y el número se escribe con el locale del manifiesto
 *   (`lib/format.ts`): un `Intl` de nivel de módulo lo escribiría a la española
 *   bajo una interfaz en maya, sin dar error.
 * - **Si algo de dentro espera a alguien**, con el punto de `EstadoDeTarea` y su
 *   orden de urgencia: `aprobando` —la única que no avanza sin ti—, `vivas` y
 *   `esperando` (`sessions::sin_contestar`, el agente preguntó y nadie
 *   contestó).
 *
 * **El punto del padre no se toca al plegar**, y revertirlo no enseña el daño:
 * mezclarle el estado de sus hijas haría que la fila y su pestaña dijeran cosas
 * distintas de la misma tarea, y el orden de urgencia se tragaría la pregunta
 * sin contestar de una hija bajo un padre trabajando. Son dos puntos en dos
 * sitios: el de la tarea junto al título y el de lo plegado junto al número.
 *
 * **Renombrar no mueve nada** — la identidad es el id, que es la carpeta
 * (`sessions::rename_session`). Hay dos gestos porque ninguno basta solo: doble
 * clic en la fila, que no se encuentra sin probarlo y no se da con el teclado, y
 * «Cambiarle el nombre» en el menú, la única puerta para quien no usa ratón. El
 * campo sale en el sitio del título y relleno con el nombre de ahora: lo que se
 * corrige es lo que se lee en esa fila. **Salir del campo guarda; `Escape`
 * descarta** — un `onBlur` que cancela borra lo tecleado al ir a pulsar
 * cualquier otra cosa, sin decir nada.
 *
 * **Las acciones de la fila son un menú.** Dos íconos sueltos hacen que la fila
 * se lea como una barra de herramientas, y la cruz —el gesto irreversible— es la
 * más fácil de pulsar sin querer. Ningún disparador lleva `onClick` encima: la
 * prop propia pisaría el que `PopoverTrigger` pasa dentro de `p` y el panel no
 * abriría —Kobalte no compone manejadores, gana el último—, así que **quien no
 * deja pasar el clic a la fila es la fila**, que ignora lo que venga de su
 * columna de acciones. Lo comprueba `tests/unit/triggers.test.mjs`.
 */
export default function Sessions(props: SessionsProps) {
  const state = createSessionsState(props);
  const { actionFailure, setActionFailure, query, matchedSessions, aviso, setAviso, intentar, descartarYSeguir, activas } = state;
  const FilaDelRiel = createFilaDelRiel(props, state);
  const ConTarjeta = createConTarjeta(props, state);
  const Fila = createFila(props, state, FilaDelRiel, ConTarjeta);
  const Rama = createRama(props, state, Fila);
  const AuthorGroups = createAuthorGroups(props, state, Rama);

  return (
    <div class="flex min-w-0 flex-col gap-2">
      <TaskActionToast failure={actionFailure()} onDismiss={() => setActionFailure(null)} />
      <Show when={query()}>
        <p data-search-results class="m-0 px-2 text-caption text-neutral-500" aria-live="polite">
          {matchedSessions().length === 0 ? t("projects.agent_tasks.no_results") : t("projects.sessions.search_results", { count: matchedSessions().length })}
        </p>
      </Show>
      <Show when={aviso()}>{a => (
        <Suspense>
          <TaskBlockersDialog
            aviso={a()}
            onCerrar={() => setAviso(null)}
            onArchivar={(id) => { setAviso(null); void intentar(id, false); }}
            onDescartar={() => void descartarYSeguir()}
          />
        </Suspense>
      )}</Show>
      <Show when={activas().length > 0}>
        <AuthorGroups branches={activas()} />
      </Show>

    </div>
  );
}
