import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig, mergeConfig } from "vite";
import original from "../../../vite.config";
import { WEB_PREVIEW_FRAME_SOURCE } from "../../../src/web/preview-config";

export default defineConfig(async env => mergeConfig(typeof original === "function" ? await original(env) : original, {
  root: fileURLToPath(new URL(".", import.meta.url)), publicDir: false,
  define: { __TERMINUS_VERSION__: JSON.stringify("preview-test") },
  plugins: [{ name: "preview-lab-policy", transformIndexHtml(html: string) {
    const source = readFileSync(new URL("../../../web.html", import.meta.url), "utf8");
    const policy = /http-equiv="Content-Security-Policy"\s*content="([^"]*)"/.exec(source)![1]
      .replace("%TERMINUS_WEB_CONNECT%", "https://edge.danil.ai").replace("%DANIL_WEB_PREVIEW_FRAME%", WEB_PREVIEW_FRAME_SOURCE);
    return html.replace("<head>", `<head><meta http-equiv="Content-Security-Policy" content="${policy}">`);
  } }],
  build: { outDir: process.env.PREVIEW_LAB_OUT, emptyOutDir: true, rollupOptions: { input: fileURLToPath(new URL("./index.html", import.meta.url)) } },
}));
