import { createHash } from "node:crypto";
import { copyFileSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, mergeConfig, type Plugin, type UserConfig } from "vite";
import solid from "vite-plugin-solid";
import tailwindcss from "@tailwindcss/vite";
import { webConnectSources, webRelayOrigins, webSessionDeployment } from "./src/web/session-config";

const fonts = resolve(fileURLToPath(
  new URL("./node_modules/@excalidraw/excalidraw/dist/prod/fonts/", import.meta.url),
));

function fontFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? fontFiles(path) : [path];
  });
}

function excalidrawFonts(): Plugin {
  return {
    name: "excalidraw-fonts",
    configureServer(server) {
      server.middlewares.use("/excalidraw/fonts", (req, res, next) => {
        const name = decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname).slice(1);
        const path = resolve(fonts, name);
        if (!path.startsWith(fonts + sep) || !path.endsWith(".woff2")) return next();
        try {
          res.setHeader("content-type", "font/woff2");
          res.end(readFileSync(path));
        } catch {
          next();
        }
      });
    },
    generateBundle() {
      for (const path of fontFiles(fonts)) {
        this.emitFile({
          type: "asset",
          fileName: `excalidraw/fonts/${relative(fonts, path).split(sep).join("/")}`,
          source: readFileSync(path),
        });
      }
    },
  };
}

// The same hash the engine announces (`engine-client` `contract()`): a computer with another one needs an update.
const CONTRACT = JSON.stringify(
  createHash("sha256").update(readFileSync(fileURLToPath(new URL("./src-tauri/crates/engine-protocol/commands.json", import.meta.url)))).digest("hex"),
);

// La entrada del navegador (`src/web/main.tsx`). Sale a `dist-web/<base>` para
// que el Worker de assets sirva las mismas rutas que reenvía la app de Danil;
// origen del borde y política se fijan al compilar.
function webBuild(serve: boolean): UserConfig {
  const env = process.env;
  const session = webSessionDeployment(env);
  const base = `/${(env.TERMINUS_WEB_BASE ?? "/terminus/").replace(/^\/+|\/+$/g, "")}/`.replace("//", "/");
  const relayOrigins = webRelayOrigins(env.RELAY_ORIGIN);
  const connect = webConnectSources(session.origin, relayOrigins);
  const version = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")).version as string;
  const root = fileURLToPath(new URL("./dist-web/", import.meta.url));
  const outDir = join(root, base);
  let policy = "";
  const page: Plugin = {
    name: "terminus-web-page",
    enforce: "post",
    buildStart() {
      if (!serve) rmSync(root, { recursive: true, force: true });
    },
    transformIndexHtml(html) {
      const out = html.replace("%TERMINUS_WEB_CONNECT%", connect);
      policy = /http-equiv="Content-Security-Policy"\s*content="([^"]*)"/.exec(out)?.[1] ?? "";
      return out;
    },
    generateBundle(_, bundle) {
      const html = bundle["web.html"];
      if (html) html.fileName = "index.html";
      if (!policy) this.error("web.html sin Content-Security-Policy");
    },
    // `_headers` lleva lo que un `<meta>` no puede (frame-ancestors). La copia de
    // la raíz es el respaldo de página única: un 404 bajo la base sirve la app.
    writeBundle() {
      if (serve) return;
      const headers = [
        `${base}*`,
        `  Content-Security-Policy: ${policy}; frame-ancestors 'none'`,
        "  X-Content-Type-Options: nosniff",
        "  Referrer-Policy: strict-origin-when-cross-origin",
        "  Strict-Transport-Security: max-age=31536000",
        "  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()",
        "",
      ];
      writeFileSync(join(root, "_headers"), headers.join("\n"));
      if (base !== "/") copyFileSync(join(outDir, "index.html"), join(root, "index.html"));
    },
  };
  return {
    base,
    define: {
      __TERMINUS_VERSION__: JSON.stringify(version),
      __DANIL_WEB_API__: JSON.stringify(session),
      __DANIL_WEB_RELAY_ORIGINS__: JSON.stringify(relayOrigins),
      __DANIL_WEB_PHONE__: JSON.stringify(env.DANIL_WEB_PHONE === "1"),
      "import.meta.env.TERMINUS_ALPHA": JSON.stringify(env.TERMINUS_WEB_ALPHA === "1"),
      "import.meta.env.TERMINUS_BROADCAST_WRITES": JSON.stringify(env.TERMINUS_WEB_BROADCAST_WRITES === "1"),
      "import.meta.env.TERMINUS_BROADCAST_DELIVERY": JSON.stringify(env.TERMINUS_WEB_BROADCAST_DELIVERY === "1"),
    },
    plugins: [page],
    // Los iconos de la pestaña solo los usa la web; la ventana de escritorio no los copia.
    publicDir: fileURLToPath(new URL("./web-public/", import.meta.url)),
    build: {
      outDir,
      emptyOutDir: true,
      rollupOptions: { input: fileURLToPath(new URL("./web.html", import.meta.url)) },
    },
  };
}

// Tauri espera un puerto fijo y falla si no está disponible. `strictPort` se
// conserva a propósito: con varias ramas probándose a la vez, un puerto que se
// mueve solo haría que la ventana cargue la app de OTRA rama sin decir nada.
// Mejor que truene. Quién asigna el puerto de cada rama: `scripts/dev.mjs`.
const desktop: UserConfig = {
  // Tailwind v4 es CSS-first: no hay `tailwind.config.js`, los tokens viven en
  // el `@theme` de `src/styles/global.css` y este plugin es todo el cableado.
  plugins: [solid(), tailwindcss(), excalidrawFonts()],
  define: {
    __TERMINUS_CONTRACT__: CONTRACT,
  },
  // noVNC (la pantalla de una VM) usa `await` de nivel superior. Solo lo carga
  // su trozo perezoso: un webview sin soporte falla al abrir esa pestaña, no la app.
  esbuild: { supported: { "top-level-await": true } },
  clearScreen: false,
  // **Sin esto la ventana sale en blanco en desarrollo, y sin un solo error.**
  //
  // `micromark` —que `solid-markdown` arrastra— publica dos builds por
  // condición de exportación:
  //
  //     ".": { "development": "./dev/index.js", "default": "./index.js" }
  //
  // y **solo el de desarrollo importa `debug`**, que es CommonJS. Vite resuelve
  // con la condición `development`, sirve ese archivo crudo, y el navegador
  // muere al evaluarlo:
  //
  //     SyntaxError: The requested module '…/debug/src/browser.js'
  //     does not provide an export named 'default'
  //
  // Eso revienta la evaluación del grafo **entero**: `main.tsx` no llega a
  // correr, `#root` se queda con cero hijos y la consola no dice nada. Se ve
  // idéntico a una app que no arrancó. Salió importando `main.tsx` a mano desde
  // la propia página, que es lo único que hace hablar al error.
  //
  // `optimizeDeps.include` no sirve aquí: con el layout de pnpm ni `micromark`
  // ni `debug` son dependencias directas, y Vite contesta *«Failed to resolve
  // dependency»*. Lo que sí decide es la condición, y se pide `production` a
  // propósito — de micromark no queremos su build de desarrollo, que es
  // justamente el que trae la dependencia rota.
  //
  // Por qué `pnpm build` pasaba y `pnpm desktop:dev` no: en producción se usa
  // la condición `default`, que no importa `debug`.
  optimizeDeps: {
    include: [
      // Llega por `micromark`, y por eso `debug` está declarado en
      // `devDependencies` aunque nadie lo importe: con el layout de pnpm no es
      // alcanzable desde la raíz, y sin declararlo Vite contesta *«Failed to
      // resolve dependency»* y no lo pre-empaqueta.
      "debug",
      // Estos sí se alcanzan atravesando a su padre. `style-to-js` NO se pone:
      // no resuelve por esta vía y tampoco hace falta.
      "solid-markdown > extend",
      "solid-markdown > style-to-object",
      "solid-markdown > inline-style-parser",
    ],
  },
  server: {
    port: Number(process.env.HARNESS_DEV_PORT) || 5174,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
};

export default defineConfig(({ mode, command }) => (mode === "web" ? mergeConfig(desktop, webBuild(command === "serve")) : desktop));
