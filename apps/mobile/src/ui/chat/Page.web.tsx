import { SANDBOX_ARTEFACTO } from "@terminus/chat";

/** La política de la página (`frame-src 'self'`) no deja abrir un PDF en `data:`; se ofrece abrirlo en la computadora. */
export const PDF_INLINE = false;

/** En el navegador, el `iframe` de la ventana: `srcdoc` y `allow-scripts` sin `allow-same-origin`. */
export function SandboxedPage({ html }: { html: string }) {
  return <iframe title="preview" srcDoc={html} sandbox={SANDBOX_ARTEFACTO} style={{ flex: 1, width: "100%", height: "100%", border: 0, background: "transparent" }} />;
}

export function PdfPage(_: { base64: string }) {
  return null;
}
