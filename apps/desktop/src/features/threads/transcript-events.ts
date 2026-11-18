import { anexarImagen, anexarRazonamiento, mcpCallFromName, tramoGuardado, type ChatEvent, type Msg } from "../chat/index.ts";
import { type Paso, pasoDe } from "../../lib/steps.ts";
import { clavesConocidas, t } from "../../lib/i18n.ts";

export type TranscriptMetadata = { provider?: string; author: NonNullable<Msg["author"]> | null; model?: string | null };
/** Paint-only facts. Turn lifecycle, gates and machine control remain with their owners. */
export function transcriptEvent(messages: Msg[], event: ChatEvent, metadata: TranscriptMetadata): Msg[] {
  const { kind, text, meta, id, target, detail, mcp_app, ok, task, message_id, segment_id } = event;
  let result = messages;
  const append = (update: (messages: Msg[]) => Msg[]) => { result = update(messages); };
      if (kind === "task_launched") {
        if (task && id) append(messages => messages.some(message => message.turno === id) ? messages : [
          ...messages, { role: "system", text: "", meta: "task_launched", fromTask: task, turno: id },
        ]);
        return result;
      }

      if (kind === "segment_saved") {
        if (id) append((messages) => tramoGuardado(messages, id));
        return result;
      }


      if (kind === "tool") {
        append((m) => [
          ...m,
          {
            role: "system",
            text,
            meta: "usó",
            ...(segment_id ? { tramo: segment_id } : {}),
            paso: pasoDe(text, target ?? null, {
              id,
              detalle: detail ?? null,
              mcpApp: mcp_app ?? mcpCallFromName(text),
              corriendo: id !== undefined,
            }),
          },
        ]);
        return result;
      }

      if (kind === "tool_done") {
        const imagenes = detail?.kind === "output" ? detail.images : undefined;
        append((m) => {
          const cerrado = (p: Paso): Paso => ({
            ...p,
            corriendo: false,
            ok,
            detalle: detail ?? p.detalle,
            mcpApp: mcp_app ? { ...p.mcpApp, ...mcp_app, arguments: mcp_app.arguments ?? p.mcpApp?.arguments } : p.mcpApp ?? mcpCallFromName(text),
          });
          let i = m.length - 1;
          while (i >= 0 && !(id !== undefined && m[i].paso && m[i].paso?.id === id && (segment_id ? m[i].tramo === segment_id : m[i].paso?.corriendo))) i--;
          const conPaso: Msg[] =
            i < 0
              ? [
                  ...m,
                  {
                    role: "system",
                    text,
                    meta: "usó",
            ...(segment_id ? { tramo: segment_id } : {}),
                    paso: cerrado(pasoDe(text, target ?? null, { id })),
                  },
                ]
              : (() => {
                  const copia = [...m];
                  copia[i] = { ...m[i], paso: cerrado(m[i].paso as Paso) };
                  return copia;
                })();
          return imagenes?.length ? anexarImagen(conPaso, imagenes, segment_id) : conPaso;
        });
        return result;
      }


      if (kind === "command_output" || kind === "command_running") {
        const fila: Msg = {
          role: "system",
          text,
          meta: kind === "command_running" ? kind : (meta ?? "command_output"),
          agent: metadata.provider,
        };
        append((m) => [...m.filter((x) => x.meta !== "command_running"), fila]);
        return result;
      }

      if (kind === "notice" && meta === "delivery_pending") {
        append((m) => id && m.some((x) => x.turno === id) ? m : [
          ...m, { role: "system", text: "", meta: "delivery_pending", fromTask: task ?? undefined, turno: id },
        ]);
        return result;
      }
      if (kind === "notice") {
        const message = clavesConocidas().has(text) ? t(text) : text;
        append((m) => [...m, { role: "system", text: message, meta: meta?.startsWith("handler_") ? meta : "aviso" }]);
        return result;
      }

      if (kind === "presence") return result;

      if (kind === "image") {
        const imagenes = detail?.kind === "output" ? detail.images ?? [] : [];
        if (imagenes.length > 0) append((m) => anexarImagen(m, imagenes, segment_id));
        return result;
      }

      if (kind === "reasoning") {
        append((m) =>
          anexarRazonamiento(m, {
            text,
            messageId: message_id,
            segmentId: segment_id,
            author: metadata.author,
          }),
        );
        return result;
      }

  return result;
}
