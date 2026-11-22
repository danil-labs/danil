import { enfocar } from "../../../../../apps/desktop/src/lib/focus";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { activeTrigger } from "../../../../../apps/desktop/src/lib/mentions";
import { opcionesDeModelos } from "../../../../../apps/desktop/src/lib/models";
import { lastSentAt, usedSince } from "../../../../../apps/desktop/src/lib/nextSteps";
import { prosa } from "../../../../../apps/desktop/src/lib/prose";
import { slashSuggestions } from "../../../../../apps/desktop/src/lib/skills";
import { highlightSpans } from "../../../../../apps/desktop/src/lib/taskMentions";
import type { Failure } from "../../../../ui/src/Failure";
import { seMandaSinSuperficie } from "../../../../ui/src/lib/queue.ts";
import { taskChatPresentation } from "../components/TaskChatPresentation";
import type { RespuestaRapida } from "../components/thread/AgentAnswer";
import type { Msg } from "../model/messageTypes";
import { seguirElFondo } from "../model/paste";
import { createVisualBudget } from "../model/visualBudget";
import type { ChatProps } from "./chat-props";
import { isRetiredAgent } from "../../../../ui/src/lib/tasks.ts";
import { createEffect, createMemo, createSignal, on, onCleanup, type Accessor } from "solid-js";

/** Lo que el bloque usa del cuerpo de Chat. */
export type ChatComposerStateDeps = { campo: HTMLTextAreaElement | undefined; preguntaPendiente: Accessor<Msg | undefined>; reclamaElFoco: boolean };

/** Movido tal cual de Chat.tsx (el componente `Chat`, tarea 2.6). Lo que usa del cuerpo de Chat llega por `deps`. */
export function createChatComposerState(props: ChatProps, deps: ChatComposerStateDeps) {
  const preguntaPendiente: ChatComposerStateDeps["preguntaPendiente"] = (...a) => deps.preguntaPendiente(...a);
  // `null` mientras nadie movió el resaltado: ahí empieza en `filaDeArranque`.
  const [pick, setPick] = createSignal<number | null>(null);
  const [preparingAttachments, setPreparingAttachments] = createSignal(0);
  const [attachmentFailure, setAttachmentFailure] = createSignal<Failure | null>(null);
  const presentation = () => taskChatPresentation;
  const margenDelHilo = "px-4 py-3";

  const [copiando, setCopiando] = createSignal<string | null>(null);
  const [copiado, setCopiado] = createSignal<string | null>(null);
  const [forkeando, setForkeando] = createSignal<string | null>(null);
  /** Hay archivos encima de la ventana, sin soltar todavía. */
  /** La caja de esta conversación mientras un archivo pasa por encima de ella. */
  const [soltando, setSoltando] = createSignal<DOMRect | null>(null);
  /**
   * Qué bloque de «Trabajó durante…» está desplegado, por turno. No se
   * persiste: qué bloque tenías abierto en una conversación no es una
   * preferencia de la app, y guardarlo haría crecer el `localStorage`.
   */
  const visualBudget = createVisualBudget();
  const [trabajos, setTrabajos] = props.vista.trabajos;
  /** Qué razonamiento está desplegado, por mensaje. Efímero como `trabajos`. */
  const [razonamientos, setRazonamientos] = props.vista.razonamientos;
  /**
   * Qué registro de preguntas está plegado, por turno. Guarda el pliegue y
   * no el despliegue, al revés que `trabajos`: el bloque nace abierto, un
   * `Record` vacío tiene que significar «todas visibles» — «qué está
   * abierto» escondería las decisiones ya tomadas en la conversación.
   */

  /**
   * Tampoco se persiste, por lo mismo que `trabajos`: es el estado de una
   * lectura, no una preferencia de la app.
   */
  const [preguntasPlegadas, setPreguntasPlegadas] = props.vista.preguntasPlegadas;
  /**
   * El último mensaje del agente del hilo: es a quien pertenece el turno
   * que corre, mientras la tarea contesta ese bloque es el vivo. Se busca
   * desde el final y no se guarda: el hilo cambia en cada delta, un índice
   * recordado apuntaría a otro mensaje en cuanto entre uno nuevo.
   */
  const ultimoDelAgente = () => {
    const ms = props.msgs;
    for (let i = ms.length - 1; i >= 0; i--) if (ms[i].role === "agent") return ms[i];
    return null;
  };
  // Función y no `&&` en la prop: el compilador vuelve la condición un memo por lectura, y el observador de alto la lee sin dueño.
  // Un turno guardado trae su duración: sin esto, antes de que el nuevo diga nada, el anterior se pinta vivo.
  const esElVivo = (msg: Msg) =>
    Boolean(props.busy) && msg === ultimoDelAgente() && msg.duration_ms === undefined;
  // Dónde está el cursor. El menú de sugerencias depende de la posición, no
  // solo del texto: un `@` escrito en medio de un párrafo ya redactado abre el
  // menú ahí, y el de un párrafo anterior ya no.
  const [caret, setCaret] = createSignal(0);
  const [dismissed, setDismissed] = createSignal(false);

  /**
   * Quién sigue al fondo mientras el agente escribe. Todo lo delicado está
   * en `lib/paste.ts`: decidir por la distancia al fondo en vez de por la
   * intención de soltarse falla contra la rueda mientras entraban deltas,
   * y no basta con enterarse de lo que crece el hilo sin tocar `msgs`.
   */

  /**
   * Sin ningún efecto sobre `props.msgs`: uno solo cubriría el único
   * crecimiento nombrable, y dejaría pasar el registro que se despliega,
   * el diff que aparece, `EstadoDelTurno` entrando o una miniatura que
   * carga. El `ResizeObserver` los cubre todos sin enumerarlos.
   */
  // Memo: el observador lo lee sin dueño, y `busy` llega como prop con condición.
  const enTurno = createMemo(() => Boolean(props.busy));
  const hilo = seguirElFondo(enTurno);
  // La caja que se remonta llega después del efecto, y el `focus()` de aquel
  // cae sobre el campo viejo. La reclamación la recoge el campo nuevo.
  const tomarCampo = (el: HTMLTextAreaElement) => {
    deps.campo = el;
    if (!deps.reclamaElFoco) return;
    deps.reclamaElFoco = false;
    enfocar(el);
  };

  const commandNames = createMemo(
    () => new Set([...props.skills.map((s) => s.name), ...props.commands.map((c) => c.name)]),
  );
  const skillNames = createMemo(() => new Set(props.skills.map((s) => s.name)));
  const fieldSpans = createMemo(() =>
    highlightSpans(props.input, props.taskMentions ?? [], commandNames(), props.recipients ?? [], skillNames()),
  );
  const hasHighlight = () => fieldSpans().some((tramo) => tramo.kind);
  /** Dónde dejar el cursor cuando el texto nuevo ya haya bajado. */

  /** La caja crece con el texto hasta su tope y ahí empieza a scrollear. */
  function ajustarAlto() {
    if (!deps.campo) return;
    deps.campo.style.height = "auto";
    deps.campo.style.height = `${deps.campo.scrollHeight}px`;
  }

  /**
   * El alto pertenece al valor que se está mostrando, no al gesto que lo
   * escribió. Al enviar, `App` vacía el borrador con `setInput("")` sin
   * ningún `input` nativo que dispare `ajustarAlto`; sin este efecto queda
   * la altura del mensaje largo en una caja ya vacía (cubre también insertar una sugerencia, reintentar y otra escritura programática).
   */
  createEffect(on(() => props.input, ajustarAlto));

  // Memo y no accesor: `props.msgs` se rehace con cada evento del turno, y un
  // accesor hace correr a `on(vacia, …)` en cada uno con el mismo booleano.
  const vacia = createMemo(() => props.msgs.length === 0);

  /**
   * Si la caja va centrada: hilo vacío de una tarea que todavía no existe o
   * que nació sin mensajes. Centrar solo con agente dejaba «Nueva tarea» a secas al pie.
   */
  const centrada = createMemo(() => vacia() && (props.conversacion === "" || !!props.sinEmpezar));

  /** El saludo de una tarea nueva se elige al abrirla: una de las frases o la de la hora. */
  const SALUDOS = 10;
  const saludo = createMemo(() => {
    if (!centrada()) return "";
    const n = Math.floor(Math.random() * (SALUDOS + 1));
    if (n < SALUDOS) return t(`chat.greeting.${n + 1}`);
    const hora = new Date().getHours();
    if (hora >= 5 && hora < 12) return t("chat.greeting.morning");
    return hora >= 12 && hora < 19 ? t("chat.greeting.afternoon") : t("chat.greeting.evening");
  });

  /**
   * Cuánto tiene que tardar la lectura para que el esqueleto ayude. El
   * estado de carga tapa el hueco entero —sin él vuelve la caja centrada,
   * fijado por `thread-load.test.ts`—, pero dibujar el esqueleto durante
   * ese hueco solo ayuda si el hueco se ve.
   */

  /**
   * Medido sobre una grabación de la app: cambiar a un chat que aún no
   * estaba cargado pinta el esqueleto en 2,087 s y lo sustituye por el
   * hilo en 2,138 s — 51 ms, tres cuadros a 60 Hz. A esa velocidad unas
   * barras grises que entran y salen no se leen como «está cargando»
   * sino como un fallo de pintado.
   */

  /**
   * El esqueleto se queda —cuando la espera es de verdad sigue siendo lo
   * correcto, su porqué está en `ui/Skeleton.tsx`—; lo que se retrasa es
   * su entrada. Por debajo del umbral la rama de carga mantiene el mismo
   * armazón y el mismo sitio: no se mueve nada, no aparece una forma que iba a durar menos de lo que se tarda en verla.
   */

  /**
   * 160 ms es de la horquilla de siempre para esto (100-200): deja fuera
   * la lectura de disco local —decenas de milisegundos— sin hacer esperar
   * a quien sí va a ver un hueco. No es un número medido: es una elección,
   * escrita aquí en un solo sitio.
   */
  const UMBRAL_DEL_ESQUELETO_MS = 160;
  const [esperaVisible, setEsperaVisible] = createSignal(false);
  createEffect(
    on(
      () => props.cargando,
      (cargando) => {
        // Se reinicia en cada apertura: si no, la tarea anterior que sí tardó
        // dejaría el esqueleto encendido para la siguiente, que es lo mismo que
        // no tener umbral.
        setEsperaVisible(false);
        if (!cargando) return;
        const t = setTimeout(() => setEsperaVisible(true), UMBRAL_DEL_ESQUELETO_MS);
        onCleanup(() => clearTimeout(t));
      },
    ),
  );
  const [plegadaEn, setPlegadaEn] = props.vista.preguntaPlegadaEn;
  // Por turno: la pregunta siguiente nace desplegada.
  const preguntaPlegada = () => plegadaEn() !== null && plegadaEn() === preguntaPendiente()?.turno;
  const actual = () => props.superficies?.find((s) => s.id === props.superficie);

  /**
   * Qué le falta a todo lo que no se puede usar, si a todo le falta lo
   * mismo. Con dos motivos distintos —una sin conectar y otra sin
   * consentimiento— no hay una frase cierta para las dos: el botón vuelve
   * a la salida genérica en vez de elegir una y equivocarse con la otra.
   */
  const faltaUnanime = () => {
    const rotas = (props.superficies ?? []).filter((s) => !s.usable);
    if (rotas.length === 0) return undefined;
    return rotas.every((s) => s.marca === rotas[0].marca) ? rotas[0] : undefined;
  };
  /**
   * Por qué esta tarea no puede mandar, fuera del campo de escritura. Un
   * placeholder invita a escribir: desaparece con la primera letra y se
   * corta antes que la prosa de recuperación. El problema pertenece a la
   * superficie elegida: se queda visible junto a sus selectores.
   */
  const bloqueoDeSuperficie = () => {
    if (props.superficies === null || props.superficies.length === 0) return null;
    if (!actual()) {
      // Una tarea de los modelos locales retirados conserva su historia, pero no tiene con qué seguir.
      return isRetiredAgent(props.agent) ? t("chat.surface.local_retired") : t("chat.surface.gone");
    }
    const falta = actual()!.porque;
    return falta ? prosa(falta) : null;
  };
  /**
   * Dos bloqueos, y ninguno es el proyecto. Sin una superficie que se
   * pueda usar no hay quién responda, y con una pregunta abierta el
   * trabajo está detenido esperándola. Faltar proyecto no bloquea: nombrar
   * el trabajo es una decisión que se toma cuando hay algo que nombrar.
   */

  /**
   * Lo que bloquea no es «no está instalado»: con el menú ofreciendo solo
   * lo utilizable, lo único que puede quedar seleccionado y no servir es
   * la superficie de una tarea sin cuenta, sin clave o sin activar. Qué
   * le falta lo dice `porque` —clave traducida con `prosa()`—; «sin elegir» no lleva frase, su botón ya está al lado (`surfaces::sin_cuenta`).
   */
  /** Lo escrito va dirigido a alguien: esta sesión no lanza turno con él
   *  (`docs/specs/handler-mentions.md`). */
  const dirigido = () => (props.recipients?.length ?? 0) > 0;
  /**
   * La pregunta abierta no bloquea un mensaje dirigido: nadie está
   * contestando aquí. Cerrar la caja convertiría «llamar a otro» en no poder
   * hacer nada hasta responderle a este.
   */
  const escribible = () => !props.esperando || dirigido();
  // El campo no pide superficie: sin cuenta conectada hay que poder escribir un `!`.
  const mandable = () => escribible() && (Boolean(actual()?.usable) || seMandaSinSuperficie(props.input));
  const listo = () => mandable() && preparingAttachments() === 0;
  const enviadas = createMemo(() => lastSentAt(props.msgs, props.cola.items.map((q) => q.text)));
  const respuestaRapida = (desde: number): RespuestaRapida | null => {
    const mandarRapida = props.onRespuestaRapida;
    if (!mandarRapida || props.soloLectura) return null;
    return {
      puede: Boolean(actual()?.usable) && !props.esperando,
      usada: (texto) => usedSince(enviadas(), texto, desde),
      onElegir: (texto) => {
        hilo.bajar();
        return mandarRapida(texto);
      },
    };
  };
  const elegido = () => props.models?.models.find((m) => m.id === props.model);
  const efforts = () => elegido()?.efforts ?? [];

  /**
   * Cuántas veces se cambió el modo desde aquí. Lo lee `SelectorDeModo`
   * para acusar el cambio: cambiarlo con el atajo mueve un rótulo lejos
   * del cursor, y sin un pulso que lo señale eso no se ve. Vive aquí y no
   * en el selector: las dos formas de cambiar —menú y `shift+tab`— tienen que acusar igual.
   */
  const [pulsoDeModo, setPulsoDeModo] = createSignal(0);
  const cambiarModo = (id: string) => {
    props.onModo(id);
    setPulsoDeModo((n) => n + 1);
  };

  const opciones = createMemo(() =>
    // Los otros agentes siguen visibles aunque cambiar de CLI esté cerrado:
    // el candado dice el motivo y no esconde la lista. Las superficies del
    // mismo agente (por ejemplo, OpenCode) siguen juntas.
    opcionesDeModelos(props.superficies ?? [], props.catalogos),
  );

  // Qué se está escribiendo ahora mismo: una mención, una skill, o nada.
  // Sale del texto y de dónde está el cursor, no solo del texto.
  const trigger = () => activeTrigger(props.input, caret());
  const taskMenuRequested = createMemo(() => trigger()?.kind === "@");
  createEffect(on(taskMenuRequested, active => {
    if (active) props.onTaskMenuOpen?.();
  }));

  // Esc cierra el menú sin borrar lo escrito. Se suelta en cuanto el texto
  // cambia: seguir tecleando es volver a pedirlo. Y el resaltado vuelve al
  // principio de la lista.
  createEffect(
    on(
      () => props.input,
      () => {
        setDismissed(false);
        setPick(null);
      },
    ),
  );

  const slashGroups = createMemo(() => {
    const d = trigger();
    if (d?.kind !== "/") return [];
    // A mitad de frase el CLI no corre comandos: solo las skills que carga.
    return slashSuggestions(props.skills, d.inline ? [] : props.commands, d.query);
  });
  return { actual, attachmentFailure, bloqueoDeSuperficie, cambiarModo, centrada, commandNames, copiado, copiando, dirigido, dismissed, efforts, elegido, esElVivo, escribible, esperaVisible, faltaUnanime, fieldSpans, forkeando, hasHighlight, hilo, listo, margenDelHilo, opciones, pick, preguntaPlegada, preguntasPlegadas, presentation, pulsoDeModo, razonamientos, respuestaRapida, saludo, setAttachmentFailure, setCaret, setCopiado, setCopiando, setDismissed, setForkeando, setPick, setPlegadaEn, setPreguntasPlegadas, setPreparingAttachments, setRazonamientos, setSoltando, setTrabajos, skillNames, slashGroups, soltando, tomarCampo, trabajos, trigger, vacia, visualBudget };
}
