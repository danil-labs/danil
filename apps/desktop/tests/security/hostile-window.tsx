/**
 * Lo que se monta dentro de las dos páginas del laboratorio de la ventana.
 *
 * Las páginas son iguales byte por byte salvo una línea —`window.html` lleva la
 * política de la app, `unrestricted-window.html` no lleva ninguna—, así que lo único
 * que puede explicar una diferencia entre sus dos registros es la política.
 *
 * Y el renderizador se elige con `?render=`:
 *
 * | | Qué es |
 * |---|---|
 * | `real` (por omisión) | El `Markdown` de la app, importado de `src/ui/` |
 * | `crudo` | Copia **congelada** de cómo pintaba antes del arreglo: `src` y `href` tal como llegan |
 *
 * `crudo` es el control negativo, y por eso es una copia y no un import: cuando el
 * arreglo cierre la puerta, «no salió nada» tiene que poder distinguirse de «la
 * prueba estaba mal escrita». Con el código de hoy los dos pintan lo mismo, que es
 * lo que prueba que la copia es fiel.
 */
import { render } from "solid-js/web";
import { SolidMarkdown } from "solid-markdown";
import remarkGfm from "remark-gfm";

import { Markdown } from "../../../../packages/ui/src/Markdown.tsx";
import { envolver, SANDBOX_ARTEFACTO } from "../../../../packages/features/artifacts/src/model/sandbox.ts";
import { RESPUESTA_HOSTIL, ARTEFACTO_LEGITIMO } from "./hostile-response";

/**
 * El puente de Tauri, imitado.
 *
 * Tauri inyecta `__TAURI_INTERNALS__` en el marco principal de la ventana, y los
 * comandos que registra la app **no pasan por las capabilities**: cualquier script
 * que corra en la página los alcanza todos. Aquí se pone un doble para poder
 * medir, sin la app, si un `javascript:` llega hasta él. Lo que este laboratorio
 * demuestra es el alcance; que del otro lado esté `open_external` de verdad se lee
 * en `src-tauri/src/delivery/preview.rs`.
 */
declare global {
  interface Window {
    __ESCALADA__: { cmd: string; args: unknown }[];
    __TAURI_INTERNALS__: { invoke: (cmd: string, args: unknown) => Promise<unknown> };
    __ARTEFACTO__: { vivo: boolean; filas?: number };
  }
}

window.__ESCALADA__ = [];
window.__TAURI_INTERNALS__ = {
  invoke: (cmd, args) => {
    window.__ESCALADA__.push({ cmd, args });
    return Promise.resolve(null);
  },
};

// El runtime del artefacto manda esto al cargar. Si la política de la ventana se
// hereda al `srcdoc` y mata su `<script>`, el mensaje no llega y el contenedor
// está roto — que es la mitad que este laboratorio también tiene que vigilar.
window.__ARTEFACTO__ = { vivo: false };
window.addEventListener("message", (e) => {
  const d = e.data as { harness?: string; filas?: number } | null;
  if (d && d.harness === "estado") window.__ARTEFACTO__ = { vivo: true, filas: d.filas };
});

/** Cómo pintaba `Markdown.tsx` antes del arreglo. Congelado: es el control. */
function MarkdownCrudo(props: { children: string }) {
  return (
    <SolidMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a: (p) => <a href={p.href}>{p.children}</a>,
        img: (p) => <img src={p.src} alt={p.alt} loading="lazy" />,
      }}
    >
      {props.children}
    </SolidMarkdown>
  );
}

const crudo = new URLSearchParams(location.search).get("render") === "crudo";

render(
  () => (
    <>
      <div id="respuesta">
        {crudo ? (
          <MarkdownCrudo>{RESPUESTA_HOSTIL}</MarkdownCrudo>
        ) : (
          <Markdown>{RESPUESTA_HOSTIL}</Markdown>
        )}
      </div>
      <iframe
        id="artefacto"
        title="artefacto legítimo"
        sandbox={SANDBOX_ARTEFACTO}
        srcdoc={envolver(ARTEFACTO_LEGITIMO)}
        style={{ width: "300px", height: "200px" }}
      />
    </>
  ),
  document.getElementById("root")!,
);
