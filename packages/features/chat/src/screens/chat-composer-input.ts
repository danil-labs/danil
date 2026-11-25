import { atenderElCampo, enfocarSiNadieEscribe } from "../../../../ui/src/lib/focus";
import { t } from "../../../../ui/src/lib/i18n";
import { applySuggestion } from "../../../../ui/src/lib/mentions";
import { groupRecipients, recipientId, recipientLabel, type RecipientCandidate } from "../../../../ui/src/lib/recipients";
import { slashPick, slashRows } from "../../../../ui/src/lib/skills";
import { placeLabel, referenceId, searchPlaces, searchTasks, taskLabel, taskTarget, type MentionTarget } from "../../../../ui/src/lib/taskMentions";
import { workLabel } from "../../../../ui/src/lib/workLabel.ts";
import type { Suggestion } from "../components/Suggestions";
import { chunkStart, type Lectura } from "../model/threadWindow";
import type { createChatComposerState } from "./chat-composer-state";
import { filterMentionSources } from "./chat-model";
import type { ChatProps } from "./chat-props";
import { createEffect, createMemo, createSignal, on, onCleanup, onMount, type Accessor } from "solid-js";

/** Lo que el bloque usa del cuerpo de Chat. */
export type ChatComposerInputDeps = { bloqueDeLectura: (lectura: Lectura) => number | null; campo: HTMLTextAreaElement | undefined; dismissed: ReturnType<typeof createChatComposerState>["dismissed"]; hilo: ReturnType<typeof createChatComposerState>["hilo"]; hiloVirtual: boolean; lecturaPorSaltar: Lectura | null; origen: Accessor<number>; pendingCaret: number | null; pick: ReturnType<typeof createChatComposerState>["pick"]; reclamaElFoco: boolean; saltarALaLectura: () => void; setCaret: ReturnType<typeof createChatComposerState>["setCaret"]; shownFrom: Accessor<number>; slashGroups: ReturnType<typeof createChatComposerState>["slashGroups"]; trigger: ReturnType<typeof createChatComposerState>["trigger"]; vacia: ReturnType<typeof createChatComposerState>["vacia"] };

/** Movido tal cual de Chat.tsx (el componente `Chat`, tarea 2.6). Lo que usa del cuerpo de Chat llega por `deps`. */
export function createChatComposerInput(props: ChatProps, deps: ChatComposerInputDeps) {
  const { dismissed, hilo, pick, setCaret, slashGroups, trigger, vacia } = deps;
  const bloqueDeLectura: ChatComposerInputDeps["bloqueDeLectura"] = (...a) => deps.bloqueDeLectura(...a);
  const origen: ChatComposerInputDeps["origen"] = (...a) => deps.origen(...a);
  const saltarALaLectura: ChatComposerInputDeps["saltarALaLectura"] = (...a) => deps.saltarALaLectura(...a);
  const shownFrom: ChatComposerInputDeps["shownFrom"] = (...a) => deps.shownFrom(...a);
  const suggestions = createMemo<Suggestion[]>(() => {
    const d = trigger();
    if (!d) return [];
    if (d.kind === "/") {
      // Cada grupo dice quién resuelve sus filas: el CLI de la caja, o una skill.
      const delAgente = props.agents.find((a) => a.id === props.agent)?.label ?? props.agent;
      return slashRows(slashGroups()).map((s) => ({
        value: s.name,
        title: `/${s.name}`,
        group: s.kind === "agent" ? delAgente : t("chat.commands.skills"),
        mark: s.kind === "agent" ? { agent: props.agent } : ("skill" as const),
        detail: s.description ?? undefined,
      }));
    }
    // Primero los encargados, y no por jerarquía: los llama un nombre corto,
    // que es el que choca con el de un archivo. Quien busca material tiene
    // una barra o una extensión a mano para distinguirlo.
    // Los del repositorio primero y con candado: se cambian con un PR, no aquí.
    const grupos = groupRecipients(props.recipientCandidates ?? [], d.query);
    const fila = (c: RecipientCandidate, group: string, groupHint?: string): Suggestion => ({
      value: recipientId(c.name),
      title: c.name,
      detail: c.description || undefined,
      label: t("chat.mentions.handler"),
      group,
      groupHint,
      // Despierto mientras no se sepa: la presencia ayuda cuando está, y una
      // cara dormida por falta de dato diría que no está quien sí está.
      avatar: { name: c.name, status: c.status ?? ("awake" as const), image: props.avatarOf?.(c.name) },
    });
    const delRepositorio = props.recipientFolder
      ? t("chat.mentions.group_repository", { folder: props.recipientFolder })
      : t("chat.mentions.group_repository_unnamed");
    const handlers = [
      ...grupos.repository.map(c => fila(c, delRepositorio, t("chat.mentions.via_pr"))),
      ...grupos.own.map(c => fila(c, t("chat.mentions.group_own"))),
    ];
    // Con cabeceras arriba, el material lleva la suya: si no, se leería como
    // parte del último grupo de encargados.
    const material = handlers.length ? t("chat.mentions.group_material") : undefined;
    const tasks = searchTasks(props.taskCandidates ?? [], d.query, props.mentionProject ?? "", props.mentionSession)
      .slice(0, 40).map(task => ({
        value: referenceId(task.target),
        title: task.title || workLabel(task.branch, task.alias) || task.target.sessionId,
        detail: [workLabel(task.branch, task.alias), task.projectName, task.machine && props.mentionMachineName?.(task.machine)].filter(Boolean).join(" · "),
        label: task.available ? (task.archived ? t("chat.mentions.archived_task") : t("chat.mentions.task")) : t("chat.mentions.no_worktree"),
        group: material,
      }));
    const places = searchPlaces(props.placeCandidates ?? [], d.query).map(place => ({
      value: referenceId(place.target),
      title: place.name,
      detail: place.detail || undefined,
      label: t("chat.mentions.folder"),
      group: material,
    }));
    return [...handlers, ...tasks, ...places, ...filterMentionSources(props.mentionSources?.fuentes ?? [], d.query).map((f) => ({
      value: f.ruta,
      title: f.ruta,
      // Solo las fuentes extra traen `fuente`: la carpeta de trabajo ya está
      // implícita y una columna `tree` no dice de cuál archivo se trata.
      detail: f.fuente || undefined,
      label: f.tipo,
      group: material,
    }))];
  });

  // Con la barra empieza en el nombre escrito entero: el grupo del agente va
  // primero, y Tab cambiaría una skill exacta por el comando que la precede.
  const filaDeArranque = () => {
    const d = trigger();
    return d?.kind === "/" ? slashPick(slashGroups(), d.query) : 0;
  };
  // Una fila deshabilitada informa y no se elige: el teclado la salta.
  const habilitada = (desde: number, paso: 1 | -1) => {
    const filas = suggestions();
    for (let n = 0; n < filas.length; n++) {
      const i = (((desde + paso * n) % filas.length) + filas.length) % filas.length;
      if (!filas[i]?.disabled) return i;
    }
    return desde;
  };
  const picked = () =>
    habilitada(Math.max(0, Math.min(pick() ?? filaDeArranque(), suggestions().length - 1)), 1);

  // Un menú que solo puede decir «no hay nada» no se abre: la caja tiene que
  // dejar escribir `@` y `/` como caracteres cuando no hay a qué apuntar.
  const menuOpen = () => {
    const d = trigger();
    if (dismissed() || d === null) return false;
    // Una barra en medio del texto suele ser prosa: abre solo si alguna skill casa.
    if (d.kind === "/" && d.inline) return slashGroups().length > 0;
    return d.kind === "/"
      ? props.skills.length > 0 || props.commands.length > 0
      : (props.mentionSources?.fuentes.length ?? 0) > 0 || Boolean(props.taskCandidates?.length) ||
        Boolean(props.placeCandidates?.length) || Boolean(props.recipientCandidates?.length);
  };

  // Abrir otra conversación empieza por el final, siempre: es lo último que se
  // dijo, y es lo que se va a contestar.

  // Un corte y sostenido de 300 ms: el hilo nuevo sigue creciendo después
  // de montarse —el markdown reflowea, los bloques de diff se miden, las
  // miniaturas cargan—, un solo salto al alto de ese instante aterrizaba a
  // media conversación. La bajada se re-apunta al fondo mientras dura, y
  // `ignorarEscapes` impide que ese acomodo se lea como que alguien movió
  // la rueda.

  // `recolocar` antes del salto es la otra mitad: el salto coloca la
  // barra, lo que seguía brincando después es el observador de
  // `lib/paste.ts`, que mide el hilo nuevo contra el alto del anterior
  // —el elemento observado no cambia, la caja es la misma instancia al
  // pasar de una tarea a otra—. Con el alto olvidado, esa primera medida
  // cuenta como apertura y coloca de un corte en vez de recorrer la diferencia con el muelle a la vista.

  // Dispara también cuando la transcripción termina de llegar (`cargando`),
  // no solo al cambiar de conversación: entre las dos cosas hay una
  // lectura de disco, y lo que sustituye al esqueleto es un hilo entero
  // de una vez. Una transcripción que tardara más que los 300 ms abriría
  // por donde hubiera quedado.
  let retomarLectura = props.lectura ?? null;
  const colocar = () => {
    const lectura = retomarLectura;
    retomarLectura = null;
    const bloque = lectura && bloqueDeLectura(lectura);
    if (lectura && bloque !== null) {
      if (deps.hiloVirtual) {
        hilo.soltar();
        deps.lecturaPorSaltar = lectura;
        return queueMicrotask(saltarALaLectura);
      }
      return hilo.retomar(bloque - chunkStart(shownFrom(), origen()), lectura.desfase);
    }
    hilo.recolocar();
    hilo.bajar({ animacion: "instantanea", duracion: 300, ignorarEscapes: true });
  };
  /**
   * Cuántas respuestas del agente entraron desde que el hilo dejó de
   * seguir. Se cuentan respuestas, no mensajes de la lista.
   */

  /**
   * `msgs` lleva también los pasos (`meta === "usó"`) y los avisos del
   * sistema, y un turno normal mete una docena: «14 mensajes nuevos» por
   * una sola respuesta es un número que quien lo lee no reconoce, y le
   * hace pensar que se perdió algo.
   */

  /**
   * La respuesta viva es un mensaje que crece —los deltas se concatenan
   * sobre el último `agent` (`App.tsx`)—: mientras el agente escribe esto
   * dice «1 mensaje nuevo», que es lo que ha pasado.
   */

  /**
   * La marca se re-sincroniza mientras el final se vea: estar abajo es
   * haberlo visto; el contador nace en cero cada vez que alguien se
   * suelta, sin necesidad de escuchar ese momento.
   */
  const respuestas = createMemo(
    () => props.msgs.filter((m) => m.role === "agent" && !m.meta).length,
  );
  const [vistas, setVistas] = createSignal(0);
  createEffect(() => {
    if (hilo.alFondo()) setVistas(respuestas());
  });
  /**
   * Con el visto bueno del hilo, y no solo con la cuenta: `hayNuevos` es
   * quien sabe si esto ya se vio, se apaga en el acto al pulsar el botón,
   * al llegar al final a mano y al recolocar.
   */

  /**
   * La marca de arriba vive en un efecto y se pone al día un tic más
   * tarde; sin esta condición el rótulo enseñaría la cuenta vieja durante
   * ese tic —un parpadeo justo encima del control que se acaba de pulsar.
   */
  const mensajesNuevos = () =>
    hilo.hayNuevos() ? Math.max(0, respuestas() - vistas()) : 0;

  createEffect(on(() => props.conversacion, colocar));
  createEffect(
    on(
      () => props.cargando,
      (cargando, antes) => {
        if (antes && !cargando) colocar();
      },
    ),
  );

  // Insertar mueve el cursor, y eso no se puede pedir en el mismo respiro en
  // que cambia el valor: el DOM todavía tiene el texto de antes y la posición
  // se pierde. Se apunta y se aplica cuando el valor ya bajó.
  createEffect(
    on(
      () => props.input,
      () => {
        const c = deps.pendingCaret;
        if (c === null) return;
        deps.pendingCaret = null;
        deps.campo?.focus();
        deps.campo?.setSelectionRange(c, c);
        setCaret(c);
      },
    ),
  );

  function mentionedReference(value: string): { target: MentionTarget; label: string } | undefined {
    const task = props.taskCandidates?.find(c => referenceId(c.target) === value);
    if (task) return { target: taskTarget(task, props.mentionMachineName), label: taskLabel(task) };
    const place = props.placeCandidates?.find(c => referenceId(c.target) === value);
    return place && { target: place.target, label: placeLabel(place) };
  }

  /** Mete la referencia o la skill elegida en lugar de lo que se tecleaba. */
  function insertSuggestion(value: string) {
    const d = trigger();
    if (!d) return;
    // El destinatario no pasa por `onReference`: llamar a alguien no es
    // adjuntar material, y son dos listas distintas del borrador.
    const handler = d.kind === "@"
      ? props.recipientCandidates?.find(c => recipientId(c.name) === value)
      : undefined;
    if (handler) {
      const label = recipientLabel(handler.name);
      deps.pendingCaret = d.from + label.length + 1;
      props.onRecipient?.(handler.name, label, d);
      return;
    }
    const reference = d.kind === "@" ? mentionedReference(value) : undefined;
    // El punto se anota antes de cambiar el texto: el efecto que lo aplica
    // corre en el mismo cambio, y si llega tarde lo aplica la tecla siguiente.
    if (reference) {
      deps.pendingCaret = d.from + reference.label.length + 1;
      props.onReference?.(reference.target, reference.label, d);
      return;
    }
    const puesto = applySuggestion(props.input, d, value);
    deps.pendingCaret = puesto.caret;
    props.onInput(puesto.text, undefined, { start: d.from, end: d.to });
  }

  // La caja cambia de sitio en cuanto hay un turno —del centro de la
  // pantalla al pie— y ahí se vuelve a montar: el foco se pierde justo
  // después de mandar el primer mensaje. Ese es el momento en que se
  // escribe lo siguiente, y volver a hacer clic para encolar sobra.
  createEffect(
    on(vacia, (v) => {
      if (v) return;
      enfocarSiNadieEscribe(deps.campo);
      deps.reclamaElFoco = true;
      setTimeout(() => {
        deps.reclamaElFoco = false;
      });
    }),
  );

  // Sin ceder ante otro campo: lo pidió la persona, y el que se deja atrás
  // puede seguir siendo el `activeElement` aunque ya no se vea.
  onMount(() =>
    onCleanup(
      atenderElCampo(() => {
        if (props.soloLectura || props.conversacion !== "") return false;
        queueMicrotask(() => deps.campo?.focus());
        return true;
      }),
    ),
  );
  return { habilitada, insertSuggestion, mensajesNuevos, menuOpen, picked, suggestions };
}
