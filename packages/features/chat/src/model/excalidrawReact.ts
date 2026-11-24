import {
  convertToExcalidrawElements,
  defaultLang,
  Excalidraw,
  languages,
  serializeAsJSON,
} from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { lengua } from "../../../../ui/src/lib/i18n";

/** La lengua del workspace entre las que trae Excalidraw: `es` cae en `es-ES`; sin traducción, la suya. */
function excalidrawLang(code: string): string {
  const base = code.split("-")[0];
  return languages.find((l) => l.code === code)?.code
    ?? languages.find((l) => l.code.split("-")[0] === base)?.code
    ?? defaultLang.code;
}

export function mountExcalidraw(
  node: HTMLElement,
  source: { elements: unknown[]; appState?: unknown; files?: unknown },
  onChange: (scene: string) => void,
): () => void {
  const canonical = source.elements.every(
    (element) => element && typeof element === "object" && "version" in element,
  );
  const elements = canonical
    ? source.elements as ReturnType<typeof convertToExcalidrawElements>
    : convertToExcalidrawElements(source.elements as Parameters<typeof convertToExcalidrawElements>[0]);
  const root = createRoot(node);
  let userEdited = false;
  const markEdited = () => { userEdited = true; };
  node.addEventListener("pointerdown", markEdited, true);
  node.addEventListener("keydown", markEdited, true);
  node.addEventListener("paste", markEdited, true);
  node.addEventListener("drop", markEdited, true);
  const initialData = { elements, appState: source.appState, files: source.files, scrollToContent: true } as React.ComponentProps<typeof Excalidraw>["initialData"];
  const render = () => root.render(
    createElement(Excalidraw, {
      initialData,
      onChange: (next, appState, files) => {
        if (!userEdited) return;
        onChange(serializeAsJSON(next, appState, files, "local"));
      },
      theme: document.documentElement.dataset.theme === "dark" ? "dark" : "light",
      langCode: excalidrawLang(lengua()),
    }),
  );
  render();
  const themeObserver = new MutationObserver(render);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => {
    themeObserver.disconnect();
    node.removeEventListener("pointerdown", markEdited, true);
    node.removeEventListener("keydown", markEdited, true);
    node.removeEventListener("paste", markEdited, true);
    node.removeEventListener("drop", markEdited, true);
    root.unmount();
  };
}
