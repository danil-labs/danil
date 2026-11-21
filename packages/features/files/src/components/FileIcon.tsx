import type { JSX } from "solid-js";
import type { IconCategory } from "../model.ts";

/** Diccionario compacto de extensiones a categorías (< 400 líneas, B-020) */
const EXTENSION_MAP: Record<string, IconCategory> = {
  // Código
  ts: "code", tsx: "code", js: "code", jsx: "code", mjs: "code", cjs: "code",
  rs: "code", py: "code", go: "code", c: "code", cpp: "code", h: "code", hpp: "code",
  java: "code", kt: "code", rb: "code", php: "code", sh: "code", bash: "code",
  zsh: "code", lua: "code", swift: "code", dart: "code", typ: "code", sql: "code",
  // Estilos
  css: "style", scss: "style", sass: "style", less: "style",
  // Datos y marcado
  json: "markup", yaml: "markup", yml: "markup", toml: "markup", xml: "markup",
  html: "markup", htm: "markup", csv: "markup", tsv: "markup",
  // Documentos
  md: "document", markdown: "document", txt: "document", pdf: "document",
  rst: "document", org: "document", doc: "document", docx: "document",
  // Imágenes
  png: "image", jpg: "image", jpeg: "image", gif: "image", webp: "image",
  svg: "image", ico: "image", avif: "image",
  // Multimedia
  mp3: "media", wav: "media", ogg: "media", mp4: "media", webm: "media", mov: "media",
  // Archivos comprimidos
  zip: "archive", tar: "archive", gz: "archive", "7z": "archive", rar: "archive",
  // Binarios
  exe: "binary", bin: "binary", so: "binary", dylib: "binary", dll: "binary", wasm: "binary",
};

const FILENAME_MAP: Record<string, IconCategory> = {
  ".gitignore": "config",
  ".gitattributes": "config",
  ".env": "config",
  ".env.local": "config",
  ".editorconfig": "config",
  dockerfile: "config",
  "package.json": "markup",
  "cargo.toml": "markup",
  "tsconfig.json": "config",
  "readme.md": "document",
  license: "document",
};

export function getFileCategory(path: string, isDirectory?: boolean, expanded?: boolean): IconCategory {
  if (isDirectory) {
    return expanded ? "folderOpen" : "folder";
  }

  const slash = path.lastIndexOf("/");
  const baseName = (slash >= 0 ? path.slice(slash + 1) : path).toLowerCase();

  if (FILENAME_MAP[baseName]) {
    return FILENAME_MAP[baseName];
  }

  const dot = baseName.lastIndexOf(".");
  if (dot > 0) {
    const ext = baseName.slice(dot + 1);
    if (EXTENSION_MAP[ext]) {
      return EXTENSION_MAP[ext];
    }
  }

  return "file";
}

const GENERICO = {
  viewBox: "0 0 24 24",
  cuerpo:
    '<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/>' +
    '<path d="M14 2v4a2 2 0 0 0 2 2h4"/></g>',
};

export interface FileIconProps {
  path?: string;
  ruta?: string;
  isDirectory?: boolean;
  expanded?: boolean;
  class?: string;
  size?: number;
}

export function FileIcon(props: FileIconProps): JSX.Element {
  const filePath = () => props.path ?? props.ruta ?? "";
  const category = () => getFileCategory(filePath(), props.isDirectory, props.expanded);
  const size = () => props.size ?? 13;
  const className = () => props.class ?? "";

  if (category() === "folder") {
    return (
      <svg
        viewBox="0 0 24 24"
        width={size()}
        height={size()}
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        class={`shrink-0 text-amber-500/80 ${className()}`}
        aria-hidden="true"
      >
        <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
      </svg>
    );
  }

  if (category() === "folderOpen") {
    return (
      <svg
        viewBox="0 0 24 24"
        width={size()}
        height={size()}
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        class={`shrink-0 text-amber-500 ${className()}`}
        aria-hidden="true"
      >
        <path d="m6 14 1.45-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.55 6a2 2 0 0 1-1.94 1.5H4a2 2 0 0 1-2-2V5c0-1.1.9-2 2-2h3.93a2 2 0 0 1 1.66.9l.82 1.2a2 2 0 0 0 1.66.9H18a2 2 0 0 1 2 2v2" />
      </svg>
    );
  }

  if (category() === "code") {
    return (
      <svg
        viewBox="0 0 24 24"
        width={size()}
        height={size()}
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        class={`shrink-0 text-sky-400 ${className()}`}
        aria-hidden="true"
      >
        <polyline points="16 18 22 12 16 6" />
        <polyline points="8 6 2 12 8 18" />
      </svg>
    );
  }

  if (category() === "style") {
    return (
      <svg
        viewBox="0 0 24 24"
        width={size()}
        height={size()}
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        class={`shrink-0 text-pink-400 ${className()}`}
        aria-hidden="true"
      >
        <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z" />
      </svg>
    );
  }

  if (category() === "markup") {
    return (
      <svg
        viewBox="0 0 24 24"
        width={size()}
        height={size()}
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        class={`shrink-0 text-emerald-400 ${className()}`}
        aria-hidden="true"
      >
        <polyline points="4 7 4 4 20 4 20 7" />
        <line x1="9" y1="20" x2="15" y2="20" />
        <line x1="12" y1="4" x2="12" y2="20" />
      </svg>
    );
  }

  if (category() === "document") {
    return (
      <svg
        viewBox="0 0 24 24"
        width={size()}
        height={size()}
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        class={`shrink-0 text-indigo-400 ${className()}`}
        aria-hidden="true"
      >
        <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <line x1="10" y1="9" x2="8" y2="9" />
      </svg>
    );
  }

  if (category() === "image") {
    return (
      <svg
        viewBox="0 0 24 24"
        width={size()}
        height={size()}
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        class={`shrink-0 text-purple-400 ${className()}`}
        aria-hidden="true"
      >
        <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
        <circle cx="9" cy="9" r="2" />
        <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
      </svg>
    );
  }

  if (category() === "media") {
    return (
      <svg
        viewBox="0 0 24 24"
        width={size()}
        height={size()}
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        class={`shrink-0 text-rose-400 ${className()}`}
        aria-hidden="true"
      >
        <polygon points="6 3 20 12 6 21 6 3" />
      </svg>
    );
  }

  if (category() === "archive") {
    return (
      <svg
        viewBox="0 0 24 24"
        width={size()}
        height={size()}
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        class={`shrink-0 text-yellow-600 ${className()}`}
        aria-hidden="true"
      >
        <polyline points="21 8 21 21 3 21 3 8" />
        <rect width="22" height="5" x="1" y="3" />
        <line x1="10" y1="12" x2="14" y2="12" />
      </svg>
    );
  }

  if (category() === "config") {
    return (
      <svg
        viewBox="0 0 24 24"
        width={size()}
        height={size()}
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        class={`shrink-0 text-neutral-400 ${className()}`}
        aria-hidden="true"
      >
        <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    );
  }

  if (category() === "binary") {
    return (
      <svg
        viewBox="0 0 24 24"
        width={size()}
        height={size()}
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        class={`shrink-0 text-orange-400 ${className()}`}
        aria-hidden="true"
      >
        <rect width="18" height="18" x="3" y="3" rx="2" />
        <path d="M7 7h.01M17 7h.01M7 17h.01M17 17h.01M12 12h.01" />
      </svg>
    );
  }

  return (
    <svg
      viewBox={GENERICO.viewBox}
      width={size()}
      height={size()}
      class={`shrink-0 text-neutral-500 ${className()}`}
      aria-hidden="true"
      innerHTML={GENERICO.cuerpo}
    />
  );
}

export function IconoDeArchivo(props: {
  ruta?: string;
  path?: string;
  size?: number;
  class?: string;
}): JSX.Element {
  return <FileIcon path={props.ruta ?? props.path ?? ""} size={props.size ?? 13} class={props.class} />;
}
