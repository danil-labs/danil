import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

export default defineConfig({
  root: fileURLToPath(new URL("../../../", import.meta.url)),
  plugins: [solid()],
  build: {
    outDir: "dist-artifact-probe",
    rollupOptions: { input: fileURLToPath(new URL("index.html", import.meta.url)) },
  },
});
