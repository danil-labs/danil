#!/usr/bin/env node
/**
 * Copia el worker de pdf.js a `public/`, que Expo sirve tal cual en desarrollo y
 * en `expo export`: Metro no empaqueta workers, y la política de la web solo
 * deja cargar scripts de `'self'` (`ui/files/PdfView.web.tsx`). No se versiona:
 * sale de `node_modules/pdfjs-dist`, la misma versión que importa el visor.
 */
import { copyFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const pdfjs = dirname(require.resolve("pdfjs-dist/package.json"));
const target = fileURLToPath(new URL("../public/pdf.worker.min.mjs", import.meta.url));
copyFileSync(join(pdfjs, "build", "pdf.worker.min.mjs"), target);
console.log(`pdf-worker: ${target}`);
