import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import tailwind from "@tailwindcss/vite";
export default defineConfig({ plugins:[solid(),tailwind()], optimizeDeps:{entries:['tests/integration/agent-dock.html'], esbuildOptions:{target:'esnext'}}, server:{fs:{allow:['../..']}} });
