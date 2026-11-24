import { t } from "../../../../../apps/desktop/src/lib/i18n";
import type { Source } from "../../../../ui/src/lib/model";
import { interrumpible } from "../../../../ui/src/lib/queue.ts";
import type { Respuesta } from "../components/Questions";
import type { VirtualThreadApi } from "../components/VirtualThread";
import type { InputMessage } from "../components/YourMessages";
import { pideClave } from "../model/commandInput";
import { chunkAt, chunkStart } from "../model/threadWindow";
import type { createChatBlocks } from "./chat-blocks";
import type { createChatComposerInput } from "./chat-composer-input";
import type { createChatComposerState } from "./chat-composer-state";
import { ANCHO_DEL_RIEL, DESFASE_DEL_SALTO, ESPERA_DEL_RIEL_MS, mensajeDe, mismoRemitente } from "./chat-model";
import type { ChatProps } from "./chat-props";
import type { createChatThreadWindow } from "./chat-thread-window";
import { createEffect, createMemo, createSignal, on, onCleanup, onMount } from "solid-js";

/** Lo que el bloque usa del cuerpo de Chat. */
export type ChatTurnStateDeps = { bloques: ReturnType<typeof createChatBlocks>["bloques"]; composerBox: HTMLDivElement | undefined; elContenido: HTMLElement | undefined; filaDe: ReturnType<typeof createChatThreadWindow>["filaDe"]; hilo: ReturnType<typeof createChatComposerState>["hilo"]; hiloDeFilas: VirtualThreadApi | undefined; hiloVirtual: ReturnType<typeof createChatThreadWindow>["hiloVirtual"]; menuOpen: ReturnType<typeof createChatComposerInput>["menuOpen"]; motivos: ReturnType<typeof createChatThreadWindow>["motivos"]; origen: ReturnType<typeof createChatThreadWindow>["origen"]; retenerFila: ReturnType<typeof createChatThreadWindow>["retenerFila"]; searchMessages: ReturnType<typeof createChatBlocks>["searchMessages"]; setCajaDeFilas: ReturnType<typeof createChatThreadWindow>["setCajaDeFilas"]; setFirstChunk: ReturnType<typeof createChatThreadWindow>["setFirstChunk"]; setRetenidas: ReturnType<typeof createChatThreadWindow>["setRetenidas"]; shownFrom: ReturnType<typeof createChatThreadWindow>["shownFrom"] };

/** Movido tal cual de Chat.tsx (el componente `Chat`, tarea 2.6). Lo que usa del cuerpo de Chat llega por `deps`. */
export function createChatTurnState(props: ChatProps, deps: ChatTurnStateDeps) {
  const { bloques, filaDe, hilo, hiloVirtual, menuOpen, motivos, origen, retenerFila, searchMessages, setCajaDeFilas, setFirstChunk, setRetenidas, shownFrom } = deps;
  // Un input por marca, incluido el que llegó de un encargado o de otra tarea.
  const inputsDelHilo = createMemo<InputMessage[]>(
    () =>
      bloques().flatMap((bloque, j) => {
        const m = mensajeDe(bloque)?.msg;
        if (!m || m.role !== "user" || m.shell || m.permission) return [];
        const texto = m.text.trim().replace(/\s+/g, " ")
          || m.attachments?.map((rel) => rel.split("/").pop()).join(", ")
          || (m.meta === "hidden_task" ? t("chat.subagent.hidden_task") : "");
        const sender = m.encargado ? { kind: "agent" as const, name: m.encargado }
          : m.fromTask ? { kind: "task" as const, agent: m.fromTask.provider, model: m.fromTask.model }
          : m.author && m.author.kind !== "person" ? { kind: "agent" as const, name: m.author.kind }
          : undefined;
        return texto ? [{ block: j, text: texto, sender }] : [];
      }),
    [],
    // `bloques()` se rehace con cada delta; la lista del riel solo cambia cuando entra un mensaje.
    { equals: (a, b) => a.length === b.length && a.every((m, k) => m.block === b[k].block && m.text === b[k].text && mismoRemitente(m.sender, b[k].sender)) },
  );
  const [cajaDelHilo, setCajaDelHilo] = createSignal<{ ancho: number; alto: number }>({ ancho: 0, alto: 0 });
  const [mensajeVisto, setMensajeVisto] = createSignal(0);
  let elHilo: HTMLElement | undefined;
  const [searchThread, setSearchThread] = createSignal<HTMLElement>();
  const rielVisible = () => inputsDelHilo().length > 0 && cajaDelHilo().ancho >= ANCHO_DEL_RIEL && cajaDelHilo().alto - altoDeLaCaja() >= 48;
  /** El mensaje cuyo turno ocupa el tercio de arriba de lo que se ve; abajo del todo, el último. */
  const medirMensajeVisto = () => {
    const lista = inputsDelHilo();
    if (!elHilo || !lista.length) return;
    if (hilo.alFondo()) return setMensajeVisto(lista.length - 1);
    const hijos = deps.elContenido?.children;
    const montadoDesde = chunkStart(shownFrom(), origen());
    const corte = elHilo.getBoundingClientRect().top + (elHilo.clientHeight - altoDeLaCaja()) / 3;
    if (hiloVirtual) {
      const borde = corte - elHilo.getBoundingClientRect().top;
      for (let k = lista.length - 1; k >= 0; k--) {
        const arriba = deps.hiloDeFilas?.topOf(lista[k].block);
        if (arriba !== null && arriba !== undefined && arriba <= borde) return setMensajeVisto(k);
      }
      return setMensajeVisto(0);
    }
    for (let k = lista.length - 1; k >= 0; k--) {
      const el = hijos?.[lista[k].block - montadoDesde];
      if (lista[k].block < montadoDesde || (el && el.getBoundingClientRect().top <= corte)) return setMensajeVisto(k);
    }
    setMensajeVisto(0);
  };
  const tomarHilo = (el: HTMLElement) => {
    hilo.contenedor(el);
    elHilo = el;
    setSearchThread(el);
    // Tras insertarla: recién clonada del `<template>` su documento no tiene ventana ni observadores.
    createEffect(() => setCajaDeFilas(el));
    let espera: ReturnType<typeof setTimeout> | undefined;
    const alScrollear = () => {
      clearTimeout(espera);
      espera = setTimeout(medirMensajeVisto, ESPERA_DEL_RIEL_MS);
    };
    el.addEventListener("scroll", alScrollear, { passive: true });
    const alEnfocar = (e: FocusEvent) => retenerFila(filaDe(e.target as Node), "foco");
    const alDesenfocar = (e: FocusEvent) => { if (!el.contains(e.relatedTarget as Node | null)) retenerFila(null, "foco"); };
    const alPulsar = (e: PointerEvent) => retenerFila(filaDe(e.target as Node), "gesto");
    const alSoltar = () => retenerFila(null, "gesto");
    const alSeleccionar = () => {
      const seleccion = document.getSelection();
      const dentroDelHilo = seleccion && !seleccion.isCollapsed && el.contains(seleccion.anchorNode);
      retenerFila(dentroDelHilo ? filaDe(seleccion.anchorNode) : null, "seleccion");
      retenerFila(dentroDelHilo ? filaDe(seleccion.focusNode) : null, "seleccion-fin");
    };
    if (hiloVirtual) {
      el.addEventListener("focusin", alEnfocar);
      el.addEventListener("focusout", alDesenfocar);
      el.addEventListener("pointerdown", alPulsar);
      window.addEventListener("pointerup", alSoltar);
      window.addEventListener("pointercancel", alSoltar);
      document.addEventListener("selectionchange", alSeleccionar);
      onCleanup(() => {
        el.removeEventListener("focusin", alEnfocar);
        el.removeEventListener("focusout", alDesenfocar);
        el.removeEventListener("pointerdown", alPulsar);
        window.removeEventListener("pointerup", alSoltar);
        window.removeEventListener("pointercancel", alSoltar);
        document.removeEventListener("selectionchange", alSeleccionar);
        motivos.clear();
        setRetenidas(new Set<string>());
      });
    }
    // `clientWidth` y no la entrada: sin layout —jsdom— no hay ancho, y el riel no tiene dónde ir.
    const ojo = typeof ResizeObserver === "undefined"
      ? undefined
      : new ResizeObserver(() => setCajaDelHilo({ ancho: el.clientWidth, alto: el.clientHeight }));
    ojo?.observe(el);
    onCleanup(() => {
      clearTimeout(espera);
      el.removeEventListener("scroll", alScrollear);
      ojo?.disconnect();
      if (elHilo === el) { elHilo = undefined; setSearchThread(undefined); setCajaDeFilas(undefined); }
    });
  };
  createEffect(on([inputsDelHilo, hilo.alFondo], () => medirMensajeVisto()));
  /** Monta el tramo del mensaje si no estaba y lo deja arriba, suelto del fondo. */
  const saltarAlMensaje = (bloque: number) => {
    if (hiloVirtual) {
      hilo.soltar();
      void deps.hiloDeFilas?.jump(bloque, DESFASE_DEL_SALTO).then(medirMensajeVisto);
      return;
    }
    const tramo = chunkAt(bloque, origen());
    if (tramo < shownFrom()) hilo.anteponer(() => setFirstChunk(tramo));
    hilo.retomar(bloque - chunkStart(shownFrom(), origen()), DESFASE_DEL_SALTO);
    medirMensajeVisto();
  };

  onMount(() => props.onSearchReady?.({ messages: searchMessages, thread: searchThread, jump: saltarAlMensaje, move: (delta) => hilo.escribir((elHilo?.scrollTop ?? 0) + delta, true) }));
  onCleanup(() => props.onSearchReady?.(null));

  const respondido = createMemo(() => {
    const m = new Map<string, Respuesta[]>();
    for (const msg of props.msgs)
      for (const r of msg.respuestas ?? [])
        m.set(r.turn, [...(m.get(r.turn) ?? []), r]);
    return m;
  });
  const preguntaPendiente = createMemo(() =>
    props.msgs.find(
      (msg) =>
        msg.turno &&
        msg.preguntas?.some(
          (pregunta) =>
            !respondido()
              .get(msg.turno!)
              ?.some((respuesta) => respuesta.question === pregunta.id),
        ),
    ),
  );
  /**
   * El primer mensaje elegible para interrumpir y enviar conserva el orden del resto.
   */
  const interruptibles = () =>
    props.cola.onDetenerYEnviar
      ? props.cola.items.filter((q) => !props.cola.pending?.includes(q.id) && interrumpible(q))
      : [];

  const nombreDelAgente = (id?: string) => {
    const agente = id ?? props.agent;
    return props.agents.find((a) => a.id === agente)?.label ?? agente;
  };
  // La salida de un `!` viaja con lo siguiente que lea el agente.
  const salidaSinLeer = (i: number) =>
    !props.msgs.slice(i + 1).some((m) => m.role === "user" || m.role === "agent" || m.meta === "shell_reply");
  const pieDeTerminal = (i: number) => {
    const respuesta = props.msgs.slice(i + 1).find((m) => m.role === "user" || m.role === "agent" || m.meta === "shell_reply" || m.shell);
    if (respuesta?.meta === "shell_reply") return t("chat.shell.reply", { agent: nombreDelAgente(respuesta.agent) });
    if (!salidaSinLeer(i)) return null;
    if (props.contestandoALaTerminal) return t("chat.shell.reply", { agent: nombreDelAgente() });
    return t("chat.shell.pending", { agent: nombreDelAgente() });
  };
  // Mientras corre un `!`, la caja le escribe a él; Esc la devuelve al agente
  // hasta el siguiente comando. Lo tecleado no pasa por el borrador: puede ser una clave.
  const [soltadoDe, setSoltadoDe] = createSignal<string | null>(null);
  const [entrada, setEntrada] = createSignal("");
  const entradaActiva = () =>
    Boolean(props.onEntradaDeComando && props.terminal?.id && soltadoDe() !== props.terminal.id);
  const entradaOculta = () => entradaActiva() && pideClave(props.terminal?.output ?? "");
  createEffect(on(() => props.terminal?.id, () => setEntrada("")));
  async function teclearAlComando(texto: string) {
    const mandarla = props.onEntradaDeComando;
    if (!mandarla) return;
    const eco = !entradaOculta();
    setEntrada("");
    if (!(await mandarla(texto, eco))) setSoltadoDe(props.terminal?.id ?? null);
  }
  const modoTerminal = () => entradaActiva() || props.input.startsWith("!");
  const modoAlMargen = () =>
    Boolean(props.sideCommand) && props.input.toLowerCase().startsWith(`/${props.sideCommand} `);
  const carpetaDeTerminal = () => {
    const conocida = props.terminal?.cwd ?? props.carpetaDeTerminal;
    if (conocida) return conocida;
    for (let i = props.msgs.length - 1; i >= 0; i--) {
      const cwd = props.msgs[i].shell?.cwd;
      if (cwd) return cwd;
    }
    return null;
  };
  function interrumpirConCola() {
    const primero = interruptibles()[0];
    if (primero) void props.cola.onDetenerYEnviar?.(primero.id);
  }

  const [cancelandoPregunta, setCancelandoPregunta] = createSignal(false);
  async function cancelarPregunta(turno: string) {
    if (cancelandoPregunta()) return;
    setCancelandoPregunta(true);
    try {
      await props.onCancelarPregunta(turno);
    } catch {
      // El fallo ya se dijo en el hilo; la pregunta se queda como estaba.
    } finally {
      setCancelandoPregunta(false);
    }
  }

  /**
   * Si hay dónde poner un archivo que se suelte ahora mismo. Es la misma
   * condición que pinta la lista de adjuntos, se escribe mirándola: con
   * una pregunta del agente sin contestar la caja se sustituye por ella,
   * un adjunto entraría sin verse.
   */

  /**
   * Que la cuenta no sirva o que el agente esté trabajando no bloquea:
   * adjuntar es preparar el mensaje, no mandarlo — el motivo por el que
   * no se puede mandar ya se dice al pie de la caja.
   */
  const puedeAdjuntar = () => !preguntaPendiente() || Boolean(props.permission);

  /**
   * La caja de escribir: componente y no nodo guardado, se monta en dos
   * sitios —centrada cuando la conversación está vacía, al pie cuando hay
   * hilo— (SYSTEM.md § Las reglas de Solid, regla 9). Cada montaje crea su
   * propio nodo para no dejar una de las dos ramas vacía.
   */

  /**
   * Las fuentes de la tarea: lo que ya lee y lo que entrará con el próximo
   * mensaje, en una sola fila. Separarlos en dos sitios obligaba a mirar dos
   * veces para saber qué alcanza esta tarea.
   */
  const fuentes = createMemo(() => {
    const vistas = new Map<string, Source>();
    for (const f of [...props.contexto, ...props.material]) {
      if (!vistas.has(f.id)) vistas.set(f.id, f);
    }
    return [...vistas.values()];
  });

  /**
   * Cuánto alto tapa la caja flotante, para dejárselo libre al hilo por
   * abajo. Se mide, no se supone: la caja crece con lo que se escribe y
   * también recibe colas, preguntas o permisos; con un número fijo, la
   * última línea de la conversación quedaba detrás justo cuando más alta
   * era, y sin error.
   */

  /**
   * `ResizeObserver` se pregunta antes de usarlo: jsdom no lo tiene y ahí
   * corre el guarda `mount-frontend`, que evalúa el bundle entero. Sin la guarda,
   * el primer render lanzaría y la app abriría con el esqueleto puesto.
   */
  const [altoDeLaCaja, setAltoDeLaCaja] = createSignal(0);
  const medirCaja = (el: HTMLDivElement) => {
    // Un cero no es una medida, es que todavía no hay layout: el `ref`
    // corre antes de que el elemento tenga caja, la primera lectura es 0
    // y el hueco reservado cae a 12 px hasta que el observador habla. Eso
    // es `scrollHeight` moviéndose ~120 px de golpe.

    // Con la caja montándose cada vez que una ventana toma el mando
    // (`Show` sobre `soloLectura`), eso parpadea al elegir ventana en
    // pantalla partida. Al no escribirlo, el valor anterior se conserva y
    // la geometría del hilo no cambia por activar una ventana.
    const alto = (el: HTMLDivElement) => {
      const medido = el.offsetHeight;
      if (medido > 0) setAltoDeLaCaja(medido);
    };
    alto(el);
    if (typeof ResizeObserver === "undefined") return;
    const ojo = new ResizeObserver(() => alto(el));
    ojo.observe(el);
    onCleanup(() => {
      ojo.disconnect();
      // Sin caja el hueco es cero: conservar la última medida al
      // desmontarse era lo que dejaba el botón de «Ir al final» flotando
      // en mitad del hilo, en pantalla partida la caja se va cuando la
      // ventana deja de mandar, y el botón se quedaba a la altura donde
      // la caja estaba. El valor se conserva mientras la caja existe —lo
      // que evita el parpadeo del cero previo al layout— y se suelta al desmontarse.
      setAltoDeLaCaja(0);
    });
  };

  const [menuAnchor, setMenuAnchor] = createSignal<DOMRect | null>(null);
  const measureMenu = () => setMenuAnchor(deps.composerBox?.getBoundingClientRect() ?? null);
  createEffect(on(menuOpen, (abierto) => {
    if (!abierto || !deps.composerBox) return;
    measureMenu();
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(measureMenu);
    observer?.observe(deps.composerBox);
    window.addEventListener("resize", measureMenu);
    onCleanup(() => {
      observer?.disconnect();
      window.removeEventListener("resize", measureMenu);
    });
  }));
  return { altoDeLaCaja, cajaDelHilo, cancelarPregunta, carpetaDeTerminal, entrada, entradaActiva, entradaOculta, fuentes, inputsDelHilo, interrumpirConCola, interruptibles, medirCaja, mensajeVisto, menuAnchor, modoAlMargen, modoTerminal, pieDeTerminal, preguntaPendiente, puedeAdjuntar, respondido, rielVisible, saltarAlMensaje, setEntrada, setSoltadoDe, teclearAlComando, tomarHilo };
}
