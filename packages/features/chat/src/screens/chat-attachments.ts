import { t } from "../../../../ui/src/lib/i18n";
import { base64De, copyText, imagenPegada } from "../../../../host/src/clipboard";
import { dragDropInPoints, getCurrentWebview, getCurrentWindow } from "../../../../host/src/native";
import { capabilities } from "../../../../host/src/platform";
import { asFailure, prosaDe } from "../../../../ui/src/Failure";
import type { createChatComposerState } from "./chat-composer-state";
import { archivosDelNavegador } from "./chat-model";
import type { ChatProps } from "./chat-props";
import { open } from "@tauri-apps/plugin-dialog";
import { createMemo, createSignal, onCleanup, onMount, type Accessor } from "solid-js";

/** Lo que el bloque usa del cuerpo de Chat. */
export type ChatAttachmentsDeps = { ancla: HTMLSpanElement | undefined; copiando: ReturnType<typeof createChatComposerState>["copiando"]; entrada: Accessor<string>; entradaActiva: () => boolean; forkeando: ReturnType<typeof createChatComposerState>["forkeando"]; hilo: ReturnType<typeof createChatComposerState>["hilo"]; listo: ReturnType<typeof createChatComposerState>["listo"]; puedeAdjuntar: () => boolean; setAttachmentFailure: ReturnType<typeof createChatComposerState>["setAttachmentFailure"]; setCopiado: ReturnType<typeof createChatComposerState>["setCopiado"]; setCopiando: ReturnType<typeof createChatComposerState>["setCopiando"]; setForkeando: ReturnType<typeof createChatComposerState>["setForkeando"]; setPreparingAttachments: ReturnType<typeof createChatComposerState>["setPreparingAttachments"]; setSoltando: ReturnType<typeof createChatComposerState>["setSoltando"]; teclearAlComando: (texto: string) => Promise<void> };

/** Movido tal cual de Chat.tsx (el componente `Chat`, tarea 2.6). Lo que usa del cuerpo de Chat llega por `deps`. */
export function createChatAttachments(props: ChatProps, deps: ChatAttachmentsDeps) {
  const { copiando, forkeando, hilo, listo, setAttachmentFailure, setCopiado, setCopiando, setForkeando, setPreparingAttachments, setSoltando } = deps;
  const entrada: ChatAttachmentsDeps["entrada"] = (...a) => deps.entrada(...a);
  const entradaActiva: ChatAttachmentsDeps["entradaActiva"] = (...a) => deps.entradaActiva(...a);
  const puedeAdjuntar: ChatAttachmentsDeps["puedeAdjuntar"] = (...a) => deps.puedeAdjuntar(...a);
  const teclearAlComando: ChatAttachmentsDeps["teclearAlComando"] = (...a) => deps.teclearAlComando(...a);
  /**
   * Soltar archivos en la ventana los adjunta al mensaje. Tiene que ser el
   * evento nativo de Tauri: el `drop` de HTML5 entrega un `File` sin ruta
   * en disco, y sin ruta no hay nada que copiar a la carpeta de trabajo.
   * El de Tauri trae rutas absolutas.
   */

  /**
   * La zona de soltar es la ventana entera, y no es comodidad: es lo
   * único que se puede hacer bien. El evento trae una posición que no
   * significa lo mismo en cada plataforma: macOS manda puntos lógicos
   * (`wry/src/wkwebview/drag_drop.rs`), Windows manda píxeles físicos
   * (`wry/src/webview2/drag_drop.rs`).
   */

  /**
   * Tauri las emite tal cual (`manager/webview.rs`), tipadas como
   * `PhysicalPosition` en las dos. Dividir por `devicePixelRatio` para
   * acotar el drop a la caja parte las coordenadas por dos en un Mac
   * Retina: el punto cae lejos de la caja y soltar no adjunta nada.
   */

  /**
   * Si vuelve a hacer falta saber dónde se soltó, se resuelve preguntando
   * al backend por el `scale_factor` de la ventana, no con
   * `devicePixelRatio`, sabiendo que en macOS no hay que dividir. Lo
   * comprueba `scripts/guards/drop.mjs`.
   */
  onMount(() => {
    let disposed = false;
    // Con la pantalla partida cada conversación es su propia zona: el archivo va a la
    // que está bajo el puntero. macOS manda puntos y el resto píxeles físicos.
    const enPuntos = dragDropInPoints();
    let escala = 1;
    const medirEscala = () =>
      void getCurrentWindow()
        .scaleFactor()
        .then((f) => {
          escala = f;
        })
        .catch(() => {});
    medirEscala();
    const bajoElPuntero = (pos: { x: number; y: number }) => {
      const caja = deps.ancla?.parentElement?.getBoundingClientRect();
      if (!caja) return null;
      // Sin maquetación no hay cajas que medir: la conversación montada recibe, como antes.
      if (document.documentElement.clientWidth === 0) return caja;
      // Con maquetación, una caja vacía es una conversación escondida.
      if (caja.width === 0 || caja.height === 0) return null;
      const f = enPuntos ? 1 : escala;
      const x = pos.x / f;
      const y = pos.y / f;
      return x >= caja.left && x <= caja.right && y >= caja.top && y <= caja.bottom ? caja : null;
    };
    const un = getCurrentWebview().onDragDropEvent((e) => {
      // La suscripción dura lo mismo que el componente. `puedeAdjuntar()` se
      // lee al recibir cada evento para no conservar el valor que tenía al
      // montar. El acceso sigue siendo reactivo sin volver a suscribirse cuando
      // cambia la señal.
      if (disposed) return;
      if (props.soloLectura || !puedeAdjuntar()) {
        setSoltando(null);
        return;
      }
      if (e.payload.type === "enter") medirEscala();
      if (e.payload.type === "enter" || e.payload.type === "over") {
        setSoltando(bajoElPuntero(e.payload.position));
        return;
      }
      if (e.payload.type === "drop") {
        const aqui = bajoElPuntero(e.payload.position);
        setSoltando(null);
        if (aqui) agregar(e.payload.paths);
        return;
      }
      setSoltando(null);
    });

    // La promesa puede no resolver a nada, y hay que contar con ello:
    // `onDragDropEvent` habla con el backend, sin él —el guarda `mount-frontend`
    // corre en jsdom con el IPC stubeado— devuelve `undefined` y `f()`
    // revienta con «Cannot read properties of undefined». Con una
    // conversación por ventana el componente sí se desmonta, y el fallo
    // se lleva el árbol entero por delante en el primer render del guarda.
    onCleanup(() => {
      disposed = true;
      void un.then((f) => f?.()).catch(() => {});
    });
  });

  // En el navegador no hay rutas: el `drop` de HTML5 trae el `File` y se sube.
  onMount(() => {
    const zona = deps.ancla?.parentElement;
    if (!capabilities().browserFiles || !zona) return;
    const quitar = archivosDelNavegador().then((m) => enNavegador(m).escuchar(zona));
    onCleanup(() => void quitar.then((f) => f()));
  });

  async function agregar(rutas: string[]) {
    setPreparingAttachments((n) => n + 1);
    setAttachmentFailure(null);
    const conversation = props.conversacion;
    try {
      await props.onAgregarAdjuntos(rutas.filter((p) => !props.adjuntos.includes(p)));
    } catch (e) {
      if (conversation === props.conversacion) setAttachmentFailure(asFailure(e));
    } finally {
      setPreparingAttachments((n) => n - 1);
    }
  }

  async function pegar(e: ClipboardEvent) {
    if (props.soloLectura || !puedeAdjuntar()) return;
    const img = imagenPegada(e.clipboardData);
    if (!img) return;
    e.preventDefault();
    const conversation = props.conversacion;
    setAttachmentFailure(null);
    setPreparingAttachments((n) => n + 1);
    try {
      const datos = await base64De(img);
      const ruta = await props.onPegarImagen(img.type, datos);
      await agregar([ruta]);
    } catch (err) {
      if (conversation === props.conversacion) setAttachmentFailure(asFailure(err));
    } finally {
      setPreparingAttachments((n) => n - 1);
    }
  }

  /** En la web: el archivo viaja como bytes y el motor lo guarda en su máquina (`browserFiles.ts`). */
  const enNavegador = (m: typeof import("../model/browserFiles")) => m.adjuntador({
    puede: () => !props.soloLectura && puedeAdjuntar(),
    documentos: props.aceptaDocumentos,
    marcar: setSoltando,
    conversacion: () => props.conversacion,
    pegar: props.onPegarImagen,
    agregar,
    fallo: setAttachmentFailure,
    ocupado: (d) => setPreparingAttachments((n) => n + d),
  });


  async function copiarMensaje(clave: string, texto: string) {
    if (copiando()) return;
    setCopiando(clave);
    try {
      await copyText(texto);
      setCopiado(clave);
      setTimeout(() => setCopiado((actual) => (actual === clave ? null : actual)), 1500);
    } catch (e) {
      props.onError(prosaDe(e));
    } finally {
      setCopiando(null);
    }
  }

  const [forkTurn, setForkTurn] = createSignal<string | null>(null);
  // "" es sin agente: el `<select>` nativo no guarda `null`.
  const [forkAgentChoice, setForkAgentChoice] = createSignal("");

  function abrirFork(turno: string) {
    const propio = props.forkAgent ?? "";
    // Un agente que ya no está en la carpeta no se puede elegir: arranca sin.
    setForkAgentChoice(propio && (props.forkAgents ?? []).includes(propio) ? propio : "");
    setForkTurn(turno);
  }

  async function forkDesde(mode: "full" | "focused") {
    const turno = forkTurn();
    if (!turno) return;
    const hacer = props.onForkDesde;
    if (!hacer || forkeando()) return;
    setForkeando(turno);
    try {
      await hacer(turno, mode, forkAgentChoice() || null);
      setForkTurn(null);
    } catch (e) {
      setForkTurn(null);
      props.onError(prosaDe(e));
    } finally {
      setForkeando(null);
    }
  }

  async function elegirArchivos() {
    if (capabilities().browserFiles) {
      enNavegador(await archivosDelNavegador()).elegir();
      return;
    }
    const elegidos = await open({
      multiple: true,
      title: t("chat.attachments.dialog_title"),
    });
    if (elegidos) agregar(Array.isArray(elegidos) ? elegidos : [elegidos]);
  }

  // Los adjuntos los suelta quien manda, a la vez que el texto, y los devuelve
  // al borrador de esa tarea si el envío falla: sin eso, un archivo por encima
  // del tope obliga a volver a buscarlo en el disco.
  async function mandar() {
    if (entradaActiva()) {
      void teclearAlComando(`${entrada()}\r`);
      return;
    }
    if ((!props.input.trim() && props.adjuntos.length === 0) || !listo()) return;
    // Mandar es volver al final, se estuviera donde se estuviera: lo que se
    // acaba de escribir va abajo, y quedarse leyendo arriba mientras aparece
    // fuera de la vista es la conversación diciendo que no se envió nada.
    hilo.bajar();
    await props.onSend(props.adjuntos);
  }

  /**
   * Los eventos de sistema consecutivos —`usó`, `aviso`, `fin`, `gasto`—
   * forman una línea de tiempo: una fila por acto, entre turno y turno.
   * Sueltos eran una tira de renglones grises; como filas son "qué hizo
   * el agente para responder esto", que es lo que se quiere leer.
   */

  /** Dónde está el último mensaje escrito: lo que `onReintentar` vuelve a mandar. */
  const ultimoEscrito = createMemo(() => {
    for (let i = props.msgs.length - 1; i >= 0; i--) if (props.msgs[i].role === "user") return i;
    return -1;
  });
  return { abrirFork, copiarMensaje, elegirArchivos, forkAgentChoice, forkDesde, forkTurn, mandar, pegar, setForkAgentChoice, setForkTurn, ultimoEscrito };
}
