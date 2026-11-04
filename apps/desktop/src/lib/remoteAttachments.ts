/**
 * Los adjuntos de un turno que corre en otra máquina. Al adjuntar, la copia
 * queda en el motor de la ventana (`prepare_attachments`), y una ruta de esta
 * Mac no le sirve a la VM: el agente de allá no la puede abrir. Antes de
 * mandar, cada imagen o PDF viaja como bytes al motor de la tarea
 * (`guardar_adjunto`) y allá se prepara su copia, igual que en el teléfono
 * (`apps/mobile/src/lib/engine.ts`).
 */
import { IMAGE_MIMES, isImageMime, MAX_UPLOAD_BYTES } from "@terminus/protocol";

export type AttachmentMover = {
  /** La máquina del turno anuncia `attachment_documents_v1`. */
  documentos: boolean;
  /** La miniatura o los bytes del archivo en la máquina de la ventana (`preview_file`). */
  read: (path: string) => Promise<{ data_url?: string | null; pdf?: string | null }>;
  /** Guarda los bytes en la máquina de la tarea y devuelve su ruta allá. */
  save: (mime: string, datos: string, nombre: string) => Promise<string>;
  /** `prepare_attachments` en la máquina de la tarea. */
  prepare: (paths: string[]) => Promise<string[]>;
};

/**
 * Lo que no se pudo llevar: no es una imagen ni un PDF, ya no está, pasa del
 * tope de la miniatura (4 MB), del de un PDF (25 MB) o del mensaje (11 MB en
 * base64), o la máquina del turno no acepta documentos.
 */
export class NotMovable extends Error {
  readonly names: string[];
  constructor(names: string[]) {
    super(`not_movable: ${names.join(", ")}`);
    this.names = names;
  }
}

const nameOf = (path: string) => path.split(/[\\/]/).pop() || path;

function payload(preview: { data_url?: string | null; pdf?: string | null } | null | undefined): { mime: string; datos: string } | null {
  const m = /^data:([^;,]+);base64,(.*)$/s.exec(preview?.data_url ?? "");
  if (m && (IMAGE_MIMES as readonly string[]).includes(m[1])) return { mime: m[1], datos: m[2] };
  if (preview?.pdf) return { mime: "application/pdf", datos: preview.pdf };
  return null;
}

/**
 * Las rutas de `paths` en la máquina de la tarea, en el mismo orden. Lee todas
 * antes de subir ninguna: si una no se puede llevar, no deja copias a medias
 * en la otra máquina y el mensaje no sale.
 */
export async function moveAttachments(paths: string[], c: AttachmentMover): Promise<string[]> {
  if (paths.length === 0) return [];
  const read = await Promise.all(paths.map(async (path) => ({ path, file: payload((await c.read(path).catch(() => null)) ?? null) })));
  const refused = read
    .filter((r) => !r.file
      || (!c.documentos && !isImageMime(r.file.mime))
      || r.file.datos.length * 0.75 > MAX_UPLOAD_BYTES)
    .map((r) => nameOf(r.path));
  if (refused.length) throw new NotMovable(refused);
  const saved: string[] = [];
  for (const { path, file } of read) saved.push(await c.save(file!.mime, file!.datos, nameOf(path)));
  return c.prepare(saved);
}

/**
 * Como `moveAttachments`, pero solo lleva las que no están ya en la máquina
 * del turno (`here`); las demás conservan su ruta y su lugar.
 */
export async function attachmentsOn(paths: string[], here: (path: string) => boolean, c: AttachmentMover): Promise<string[]> {
  const moving = paths.filter((p) => !here(p));
  if (moving.length === 0) return paths;
  const moved = await moveAttachments(moving, c);
  return paths.map((p) => (here(p) ? p : moved.shift()!));
}
