const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

/** Una imagen elegida con el selector de archivos de la página: la ventana y la web, sin rutas de la máquina. */
export function elegirArchivoDeImagen(extensiones: readonly string[]): Promise<File | null> {
  return new Promise((done) => {
    let settled = false;
    const finish = (file: File | null) => {
      if (settled) return;
      settled = true;
      done(file);
    };
    const mimes = new Set<string>();
    for (const ext of extensiones) {
      const mime = MIME_BY_EXT[ext.toLowerCase()];
      if (mime) mimes.add(mime);
    }
    const input = document.createElement("input");
    input.type = "file";
    input.accept = [...extensiones.map((ext) => `.${ext}`), ...mimes].join(",");
    input.onchange = () => finish(input.files?.[0] ?? null);
    input.oncancel = () => finish(null);
    input.click();
  });
}
