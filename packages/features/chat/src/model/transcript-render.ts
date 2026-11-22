/** La transcripción guardada convertida en los mensajes del hilo. */
import { isQuestionFile } from "@terminus/chat/steps";
import { mcpCallFromName } from "@terminus/chat/tools";
import { pasoDe } from "../../../../../apps/desktop/src/lib/steps.ts";
import type { Msg, Razonamiento } from "./messageTypes";
import type { Tool, Turn, TurnReasoning } from "./transcript-types.ts";

/**
 * Lo escrito en una subtarea que el motor pasó a su padre envuelto en el encargo
 * de retomarla (`subagents::relay_prompt`, `launch::relevo_de`): el encargo es del CLI.
 */
const RELEVOS = [
  /^\[Mensaje para tu subagente «(.+)»\]\nRetómalo con SendMessage usando to: "[^"\n]*" y pásale esto tal cual:\n\n([\s\S]*?)\n\nNo hagas tú su trabajo\. Cuando conteste, resume en una línea qué dijo\.$/,
  /^\[Mensaje para tu subagente «(.+)»\]\nRetómalo con resume_agent si hace falta y usa send_input con id: "[^"\n]*"\. Pásale esto tal cual y espera su resultado:\n\n([\s\S]*)$/,
];
export function relevoDe(text: string): { titulo: string; texto: string } | null {
  for (const forma of RELEVOS) {
    const m = forma.exec(text);
    if (m) return { titulo: m[1], texto: m[2] };
  }
  return null;
}

// Líneas de sistema que Rust guarda sin texto y la ventana compone.
const LINEAS_SIN_PROSA = new Set([
  "task_launched",
  "task_finished",
  "task_finished_read",
  "task_chain_limit",
  "woke_by_tasks",
  "respondido",
  "delivery_pending",
  "shell_reply",
]);

function aRazonamiento(bloques: readonly TurnReasoning[]): Razonamiento[] {
  return bloques.map((b) => ({
    text: b.text,
    ...(b.duration_ms != null ? { durationMs: b.duration_ms } : {}),
    ...(b.truncated ? { truncated: true } : {}),
  }));
}

/**
 * La transcripción guardada, tal como se pinta.
 *
 * **El rastro va delante de la respuesta que ayudó a producir.** No reproduce el
 * entrelazado exacto —en vivo el agente escribe, usa una herramienta y sigue
 * escribiendo, y el turno guarda un solo texto porque los deltas se concatenan—,
 * pero deja los pasos pegados a lo que explican, que es para lo que se leen.
 */
/**
 * `start`: la posición del primer turno en la transcripción entera. Cada mensaje lleva
 * `clave`, su identidad entre lecturas: sin ella, anteponer una página renumera el hilo.
 */
export function transcripcion(turns: Turn[], start = 0): Msg[] {
  // Todo lo ofrecido en la sesión hasta este turno. Contra el turno anterior, uno
  // guardado con la lista vacía porque no llegó a lanzarse haría anunciar otra
  // vez todo su material.
  //
  // `null` es «todavía no hay con qué comparar», y ahí no se anuncia nada: en
  // una tarea empezada antes de que esto se guardara, tratar el vacío como el
  // conjunto previo pintaría todo su material como recién llegado.
  let ofrecido: Set<string> | null = null;
  // Las respuestas guardadas antes de que su fila llevara modelo y proveedor
  // los toman del turno de la persona que las lanzó (`closing.rs`).
  let delLanzamiento: Pick<Turn, "reported_model" | "model_vendor"> = {};

  const mensajesDe = (t: Turn): Msg[] => {
    if (t.role === "user") delLanzamiento = t;
    const cambio: Msg[] = [];
    if (t.sources) {
      if (ofrecido) {
        const entraron = t.sources.filter((id) => !ofrecido!.has(id));
        if (entraron.length > 0) {
          cambio.push({ role: "system", text: "", contexto: { entraron } });
        }
      }
      ofrecido = new Set([...(ofrecido ?? []), ...t.sources]);
    }
    // El `ok` vuelve del disco: sin él la transcripción reabierta perdía
    // las marcas de los pasos que devolvieron error y contaba otra cosa
    // que la de en vivo. La salida no vuelve —no se guarda—, así que la
    // fila se abre y enseña el comando, no su cuerpo.
    const paso = (h: Tool): Msg => ({
      role: "system",
      text: h.name,
      meta: "usó",
      paso: pasoDe(h.name, h.target, { ok: h.ok ?? null, mcpApp: h.mcp_app ?? mcpCallFromName(h.name) }),
    });
    const visible = (h: Tool | undefined) =>
      h !== undefined && !isQuestionFile(h.target);
    const pasos: Msg[] = (t.tools ?? []).filter(visible).map(paso);
    if (t.shell) {
      return [
        ...cambio,
        {
          role: "system" as const,
          text: t.text,
          meta: "usó",
          shell: {
            cwd: t.shell.cwd,
            output: t.shell.output,
            exit_code: t.shell.exit_code,
            truncated: t.shell.truncated,
            duration_ms: t.shell.duration_ms,
          },
          paso: pasoDe("command_execution", t.text, {
            ok: t.shell.exit_code === 0,
            detalle: {
              kind: "output",
              text: t.shell.output,
              exit_code: t.shell.exit_code,
              truncated: t.shell.truncated,
              cwd: t.shell.cwd,
            },
          }),
        },
      ];
    }
    // Lo que el turno preguntó y lo que se contestó vuelve con él: una pregunta
    // que no sobrevive a cerrar la app deja la sesión esperando para siempre,
    // sin nadie que sepa que espera.
    const relevo = t.role === "user" ? relevoDe(t.text) : null;
    const propio: Msg = {
      role: t.role as Msg["role"],
      text: relevo ? relevo.texto : t.text,
      // Del turno recortado solo vuelve el texto: los demás campos solo se abrían
      // como JSON crudo bajo la respuesta. El dato sigue entero en la tarea.
      historyRefs: t.history_refs?.filter((ref) => ref.pointer === "/text"),
      ...(relevo ? { relevo: { titulo: relevo.titulo } } : {}),
      task_mentions: t.task_mentions,
      // Un aviso de cierre —una interrupción— vive en el turno, no en el evento
      // de la ventana. Sin esto desaparecía al reabrir la tarea y una respuesta
      // cortada se leía como completa.
      meta: t.meta ?? undefined,
      // **Sin este renglón la clase se guarda y no se ve**, y no da error: el
      // campo es opcional y su ausencia se lee como «este turno no falló». Es el
      // mismo camino por el que pasó `code`.
      fallo: t.fallo ?? undefined,
      quota: t.quota ?? undefined,
      resume: t.resume ?? undefined,
      author: t.author ?? undefined,
      encargado: t.agent ?? undefined,
      channel: t.channel ?? undefined,
      // El sobre se relee del disco con el turno. Sin estos tres renglones la
      // transcripción reabierta pierde a quién se entregó, dónde se contesta y
      // cuántos saltos lleva, y la fila de reenvío se queda sin nada que decir.
      recipients: t.recipients ?? undefined,
      reply_to: t.reply_to ?? undefined,
      // Sin este renglón el mensaje de otra tarea se relee como de la persona.
      fromTask: t.from_task ?? undefined,
      hops: t.hops ?? undefined,
      woke_by: t.woke_by ?? undefined,
      turno: t.id ?? undefined,
      razonamiento: t.reasoning?.length ? aRazonamiento(t.reasoning) : undefined,
      // Sin este renglón el punto de corte de un fork nativo no existe para
      // la pantalla, y todas las respuestas se leerían como turnos en vuelo.
      nativeId: t.native_id ?? undefined,
      preguntas: t.questions ?? undefined,
      respuestas: t.answers ?? undefined,
      permission: t.permission ?? undefined,
      duration_ms: t.duration_ms ?? undefined,
      at: t.at ?? undefined,
      // **Sin esto el bloque de cambios del turno no se pintaba nunca.** Rust lo
      // guardaba, el tipo lo declaraba y el componente lo esperaba; lo que
      // faltaba era copiarlo aquí, que es por donde pasa todo lo que se lee del
      // disco. No dio error en ningún sitio: `code` es opcional, así que la
      // ausencia se lee como «este turno no tocó código».
      code: t.code ?? undefined,
      // Y lo mismo vale para los archivos: este renglón es todo lo que separa
      // «el adjunto está guardado» de «el adjunto se ve».
      attachments: t.attachments ?? undefined,
      agent: t.author?.kind !== "person" ? t.author?.kind : undefined,
      images: [
        ...new Set((t.tools ?? []).flatMap((h) => h.images ?? [])),
      ],
      // El proveedor y el modelo con los que se contestó, para la línea del
      // turno. Van en `propio`, que es el mensaje que cierra el turno; en un
      // turno con el orden registrado lo comparten los globos, y ahí el que
      // importa es este, porque es el que lleva la fila de acciones. Sin esto la
      // línea no puede decir de dónde salió la respuesta, y el dato ya viaja
      // desde Rust.
      model_vendor: t.model_vendor ?? delLanzamiento.model_vendor ?? undefined,
      // El observado antes que el pedido: el pedido puede ser un alias sin
      // versión («opus») y el del lanzamiento sí la trae («claude-opus-5-5»).
      reported_model: t.reported_model ?? delLanzamiento.reported_model ?? t.model ?? undefined,
    };
    // Lo que el turno entregó, **detrás de la respuesta y no delante**: al
    // revés que los pasos, no es lo que el agente hizo para contestar sino el
    // resultado, y ahí es donde estaba en vivo cuando ocurrió.
    const entrega: Msg[] = t.artifacts?.length
      ? [{ role: "system", text: "", artefactos: t.artifacts }]
      : [];
    // Un turno sin texto que tampoco preguntó ni contestó —el agente miró cosas
    // y murió antes de responder— aporta sus pasos y ningún globo vacío: es
    // justo el que hay que investigar.
    // `attachments` cuenta: mandar una captura sin escribir nada es un mensaje,
    // y sin esta condición se descartaba entero por no tener texto.
    if (
      !t.text &&
      !LINEAS_SIN_PROSA.has(t.meta ?? "") &&
      !propio.attachments &&
      !propio.preguntas &&
      !propio.respuestas &&
      !propio.permission &&
      !propio.historyRefs?.length &&
      !propio.razonamiento
    )
      return [...cambio, ...pasos, ...entrega];
    // Con el orden registrado se pinta el orden. Lo que el turno arrastra
    // —lo que preguntó, lo que cambió, cuánto tardó— va en el ÚLTIMO mensaje:
    // es el que cierra el turno, y repartirlo pintaría cada cosa varias veces.
    const enOrden = entrelazado(t, propio, paso, visible, t.reasoning ?? []);
    if (enOrden) return [...cambio, ...enOrden, ...entrega];
    return [...cambio, ...pasos, propio, ...entrega];
  };
  return turns.flatMap((t, k) => {
    const turno = t.id ?? `#${start + k}`;
    let pieza = 0;
    return mensajesDe(t).map((m) => ({ ...m, clave: m.contexto ? `${turno}:contexto` : `${turno}:${pieza++}` }));
  });
}

/**
 * El turno pintado en su orden, o `null` si no se registró.
 *
 * Los mensajes anteriores al último son globos pelados: llevan de quién son y
 * nada más. Sin esto, un turno con tres mensajes pintaría tres veces sus
 * preguntas, sus cambios de código y su entrega.
 */
function entrelazado(
  t: Turn,
  propio: Msg,
  paso: (h: Tool) => Msg,
  visible: (h: Tool | undefined) => boolean,
  reasoning: readonly TurnReasoning[],
): Msg[] | null {
  const piezas = t.pieces ?? [];
  if (piezas.length === 0) return null;
  const ultimoTexto = piezas.reduce(
    (acc, p, i) => ("text" in p ? i : acc),
    -1,
  );
  // Sin texto no hay dónde colocar el orden: el turno se pinta como antes.
  if (ultimoTexto < 0) return null;
  // La respuesta es lo dicho tras la última herramienta, como `orchestration::mensaje_final`.
  let primeroFinal = ultimoTexto;
  while (primeroFinal > 0 && "text" in piezas[primeroFinal - 1]) primeroFinal--;
  const respuesta = piezas
    .slice(primeroFinal, ultimoTexto + 1)
    .map((p) => ("text" in p ? p.text.trim() : ""))
    .filter(Boolean)
    .join("\n\n");
  // El razonamiento va pegado al mensaje que lo rodea: al texto anterior si
  // lo sigue, y si no al siguiente. Los textos del cierre se juntan en `propio`.
  const destino = (before: number) => {
    const desde = Math.min(Math.max(0, before), piezas.length);
    const previo = desde > 0 ? piezas[desde - 1] : undefined;
    if (previo && "text" in previo) return desde - 1 >= primeroFinal ? ultimoTexto : desde - 1;
    for (let i = desde; i < piezas.length; i++) {
      if ("text" in piezas[i]) return i >= primeroFinal ? ultimoTexto : i;
    }
    return ultimoTexto;
  };
  const porPieza = new Map<number, Razonamiento[]>();
  for (const r of reasoning) {
    const bloque: Razonamiento = {
      text: r.text,
      ...(r.duration_ms != null ? { durationMs: r.duration_ms } : {}),
      ...(r.truncated ? { truncated: true } : {}),
    };
    const clave = destino(r.before_piece ?? 0);
    porPieza.set(clave, [...(porPieza.get(clave) ?? []), bloque]);
  }
  const out: Msg[] = [];
  piezas.forEach((pieza, i) => {
    if ("tool" in pieza) {
      const h = (t.tools ?? [])[pieza.tool];
      if (visible(h)) out.push(paso(h));
      return;
    }
    if (i === ultimoTexto) {
      out.push({ ...propio, text: respuesta, razonamiento: porPieza.get(i) });
      return;
    }
    if (i >= primeroFinal) return;
    out.push({
      role: "agent",
      text: pieza.text,
      avanceDe: t.id ?? undefined,
      author: t.author ?? undefined,
      agent: t.author?.kind !== "person" ? t.author?.kind : undefined,
      razonamiento: porPieza.get(i),
    });
  });
  return out;
}
