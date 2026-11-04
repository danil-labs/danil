---
name: animate-ui
description: Cómo se anima la interfaz de Danil (Solid + Tailwind v4 dentro del webview de Tauri) — qué herramienta elegir entre CSS, Web Animations, View Transitions, Motion y GSAP, con qué duraciones, cómo se limpia en Solid y cómo se respeta prefers-reduced-motion. Úsala cuando pidan animar, meter una transición, un efecto de entrada o salida, un timeline, algo «más fluido» o «con más vida», o usar GSAP, Motion o anime.js en el front de Danil.
---

# Animar la interfaz

Cada animación comunica entrada, desplazamiento o actividad. Elige la
herramienta necesaria y libera sus recursos al desmontar.

## Entradas

- **Qué debe entender la persona** con la animación: entrada, salida, cambio de
  vista, estado sostenido o celebración. Si la petición es «que se vea más
  vivo» sin eso, se pregunta qué momento de la interfaz lo necesita.
- **El componente o la vista** donde vive, en `src/features/` o `src/ui/`.
- `docs/visual-system.md`. El movimiento tiene motivo: de 150 a 250 ms al
  entrar, y lo único sostenido es el latido del agente con turno en vuelo.

## Pasos

1. **Elegir la herramienta, de la más barata a la más cara**:

   | Si hace falta | Se usa | Ya está en el árbol |
   |---|---|---|
   | Hover, foco, un estado que cambia | `transition-*` de Tailwind | en todo `src/` |
   | Un bucle o un latido | `@keyframes` en `src/styles/global.css` dentro de `@media (prefers-reduced-motion: no-preference)` | `finish-task-*`, `astro-*`, `danil-skeleton` |
   | Una secuencia corta disparada por código | `element.animate()` (Web Animations) | `celebrateFinishedTask` en `src/ui/FinishTaskButton.tsx` |
   | Pasar de una vista a otra | `document.startViewTransition`, siempre detrás de una comprobación de que existe | — |
   | Salida animada de algo que `<Show>` desmonta, o resortes | Motion (`motion`) | — |
   | Coreografía larga con timeline, SVG o texto partido | GSAP (`gsap`) | — |

   Motion y GSAP no están instalados. Añadir uno es una dependencia nueva: se
   justifica con el caso que las filas de arriba no cubren y se mide el bundle
   antes y después (`npx vite build`, el chunk `index-*.js`).
2. **Tomar la duración y la curva de un token**, no de un número suelto.
   Las curvas van en `@theme` como `--ease-*`, que genera la utility
   `ease-*`. Si la animación es desde JS, lee el valor con
   `getComputedStyle`. Si todavía no existe el token que hace falta, se crea
   en `@theme` y no en el componente.
3. **Animar solo `transform` y `opacity`**. `width`, `height`, `top` o `margin`
   recalculan el layout en cada frame. En WebKitGTK (Linux) se nota antes que en
   WebView2 o WKWebView.
4. **Respetar `prefers-reduced-motion`**. En CSS: `motion-safe:` o el `@media`
   de arriba. Desde JS: `matchMedia("(prefers-reduced-motion: reduce)")`, y si
   da `true` se sale sin animar, igual que `celebrateFinishedTask`. En GSAP:
   `gsap.matchMedia()`.
5. **Limpiar en el ciclo de Solid**. Se anima en `onMount` o en un
   `createEffect` sobre el `ref`, y se revierte en `onCleanup`. El patrón de
   GSAP y Motion en Solid está en `references/gsap-and-motion-in-solid.md`:
   ábrelo antes de escribir la primera línea con cualquiera de los dos.
6. **Mirarla en la app**: `pnpm window:build` y `pnpm engine:start`, según
   `docs/development.md`, y también con el movimiento reducido activado en el
   sistema. Registra el commit de la build.

## Salida esperada

El cambio con la herramienta más barata que cumple. Duraciones y curvas salen de
tokens, se limpia en `onCleanup` y hay una rama sin movimiento. Se reporta en
qué plataforma se miró y si también se miró con el movimiento reducido.

## Ejemplo

Petición: «que el panel de cambios entre deslizando en vez de aparecer de golpe».
Resultado: `transition` de `transform` y `opacity` con `ease-*` de `@theme`, 200 ms,
`motion-safe:`. Nada de GSAP: una transición CSS lo dice entero.

## Qué no hacer

- **Animar el hilo mientras el agente escribe**: el hilo sigue al fondo
  (`seguirElFondo` en `src/features/chat/paste.ts`). Mover la altura de lo que
  entra rompe esa cuenta y hace saltar el scroll.
- **Dejar un `gsap.context()` o un `animate()` sin revertir**: sigue vivo sobre
  nodos que Solid ya desmontó, y tiene más trabajo en cada vuelta a la vista.
- **Una animación sostenida sin motivo**: compite por atención con lo que llegue
  después, y el sistema visual solo admite el latido del turno en vuelo.
- **Añadir GSAP cuando basta una transición CSS**: agrega una dependencia y
  recursos que limpiar. Mide el costo del bundle antes de adoptarlo.

## Se activa con

- «anima la entrada del panel de cambios»
- «quiero usar GSAP para la pantalla de bienvenida»
- «que el cambio entre tareas se sienta más fluido»

No se activa con: «cambia el color del botón primario», «el scroll del chat salta
cuando llega un mensaje».
