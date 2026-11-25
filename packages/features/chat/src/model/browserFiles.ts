/**
 * Adjuntar desde el navegador, que no tiene rutas: el `File` viaja como bytes.
 * Solo lo carga la web (`capabilities().browserFiles`); el escritorio no lo baja.
 */
import type { Accessor } from "solid-js";
import {
  attachmentAccept,
  isImageMime,
  MAX_UPLOAD_BYTES,
  mimeOfAttachment,
} from "../../../../engine-client/src/index.ts";
import { base64De } from "../../../../host/src/clipboard";
import { t } from "../../../../ui/src/lib/i18n";
import { asFailure, type Failure } from "../../../../ui/src/Failure";
import type { FormaDeCaja } from "./attachmentSlots";

type Conversacion = {
  puede: () => boolean;
  /** La máquina del turno anuncia `attachment_documents_v1`; si no, solo imágenes. */
  documentos: () => boolean;
  marcar: (caja: DOMRect | null) => void;
  conversacion: Accessor<unknown>;
  pegar: (mime: string, datos: string, nombre?: string) => Promise<string>;
  agregar: (rutas: string[], contar?: boolean) => Promise<boolean>;
  fallo: (f: Failure | null) => void;
  reservar: (formas: FormaDeCaja[]) => { ordenesCanceladas: () => number[]; cerrar: (noLlegaron: number) => void };
  descartar: (ordenes: number[]) => void;
};

export function adjuntador(c: Conversacion) {
  async function subir(files: File[]) {
    if (!c.puede() || files.length === 0) return;
    const conversation = c.conversacion();
    const documentos = c.documentos();
    const admitidos: File[] = [];
    const sinDocumentos: string[] = [];
    const noAdmitidos: string[] = [];
    for (const f of files) {
      const mime = mimeOfAttachment(f.type, f.name);
      if (!mime || f.size > MAX_UPLOAD_BYTES) noAdmitidos.push(f.name);
      else if (!documentos && !isImageMime(mime)) sinDocumentos.push(f.name);
      else admitidos.push(f);
    }
    c.fallo(null);
    // Una caja por archivo desde el primer byte: `agregar` no vuelve a contarlas.
    const reserva = admitidos.length
      ? c.reservar(admitidos.map((f) => (isImageMime(mimeOfAttachment(f.type, f.name)!) ? "imagen" : "archivo")))
      : null;
    let ok = false;
    try {
      const rutas: string[] = [];
      for (const f of admitidos) {
        const mime = mimeOfAttachment(f.type, f.name)!;
        rutas.push(await c.pegar(mime, await base64De(f), f.name));
      }
      ok = rutas.length ? await c.agregar(rutas, false) : true;
      if (ok && reserva && conversation === c.conversacion()) c.descartar(reserva.ordenesCanceladas());
      if ((sinDocumentos.length || noAdmitidos.length) && conversation === c.conversacion()) {
        if (noAdmitidos.length) {
          c.fallo({
            what: t("chat.attachments.web_unsupported", { names: noAdmitidos.join(", ") }),
            detail: "web_unsupported",
          });
        } else {
          c.fallo({
            what: t("chat.attachments.web_documents_unavailable", { names: sinDocumentos.join(", ") }),
            detail: "web_documents_unavailable",
          });
        }
      }
    } catch (err) {
      if (conversation === c.conversacion()) c.fallo(asFailure(err));
    } finally {
      if (reserva) reserva.cerrar(ok ? reserva.ordenesCanceladas().length : admitidos.length);
    }
  }

  return {
    elegir() {
      const input = document.createElement("input");
      input.type = "file";
      input.multiple = true;
      input.accept = attachmentAccept(c.documentos());
      input.onchange = () => void subir([...(input.files ?? [])]);
      input.click();
    },
    /** El `drop` de HTML5 sobre la conversación; devuelve cómo quitarlo. */
    escuchar(zona: HTMLElement): () => void {
      const conArchivos = (e: DragEvent) => !!e.dataTransfer?.types.includes("Files");
      const encima = (e: DragEvent) => {
        if (!conArchivos(e)) return;
        e.preventDefault();
        c.marcar(c.puede() ? zona.getBoundingClientRect() : null);
      };
      const fuera = (e: DragEvent) => {
        if (!zona.contains(e.relatedTarget as Node | null)) c.marcar(null);
      };
      const soltar = (e: DragEvent) => {
        if (!conArchivos(e)) return;
        e.preventDefault();
        c.marcar(null);
        void subir([...(e.dataTransfer?.files ?? [])]);
      };
      const eventos = [["dragenter", encima], ["dragover", encima], ["dragleave", fuera], ["drop", soltar]] as const;
      for (const [tipo, f] of eventos) zona.addEventListener(tipo, f);
      return () => {
        for (const [tipo, f] of eventos) zona.removeEventListener(tipo, f);
      };
    },
  };
}
