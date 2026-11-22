/** Una imagen elegida con el selector de archivos de la página: la ventana y la web, sin rutas de la máquina. */
export function elegirArchivoDeImagen(extensiones: readonly string[]): Promise<File | null> {
  return new Promise((done) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = extensiones.map((ext) => `.${ext}`).join(",");
    input.onchange = () => done(input.files?.[0] ?? null);
    input.oncancel = () => done(null);
    input.click();
  });
}
