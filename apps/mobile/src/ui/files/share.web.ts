/** En el navegador se puede guardar o compartir lo que llegó de la máquina. */
export const CAN_SAVE = true;

/**
 * La hoja de compartir del sistema si el navegador sabe mandar archivos (Safari
 * y Chrome en el teléfono); si no, una descarga.
 */
export async function saveFile(name: string, bytes: Uint8Array, mime: string) {
  const file = new File([bytes as BlobPart], name, { type: mime });
  if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      return;
    } catch (error) {
      // Cerrar la hoja no es un fallo; otro error cae a la descarga.
      if (error instanceof DOMException && error.name === "AbortError") return;
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
