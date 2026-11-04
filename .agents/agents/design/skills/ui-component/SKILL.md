---
name: ui-component
description: Cómo se escribe o se cambia una pieza de interfaz de Danil dentro del sistema visual — tokens en @theme, átomos de src/ui con cva y cn, Kobalte para foco y portal, Solid sin desestructurar props y texto desde el catálogo. Úsala cuando pidan una pantalla, un panel, un componente, un botón o un control nuevo, cambiar colores, espaciado o tipografía, añadir una variante, o «rediseñar» algo en el front de Danil.
---

# Una pieza de interfaz dentro del sistema

Construye la pieza con los átomos y tokens del sistema visual. Las variantes
y valores nuevos se definen en los archivos compartidos.

## Entradas

- **Qué hace la persona con la pieza**, no cómo se ve. Si llega un «que se vea
  más moderno», se pregunta qué le cuesta hoy.
- `docs/visual-system.md` y `src/AGENTS.md`. Se leen antes de tocar nada:
  dicen qué está prohibido y por qué.
- La vista donde entra, en `src/features/`.

## Pasos

1. **Buscar el átomo** en `src/ui/` (`Button`, `Input`, `Select`, `Popover`,
   `Tooltip`, `Dialog`, `Toggle`, `Badge`, `Table`…). Si existe, se usa. Si le falta
   una forma, se le añade una variante con `cva`, para todos sus consumidores.
2. **Crear un átomo solo con un consumidor real.** Patrón: `cva` para las
   variantes y `cn()` de `src/lib/utils.ts`. Lo que necesita foco, portal o
   teclado (menús, popovers, diálogos) sale de un primitivo de Kobalte, no se
   escribe a mano.
3. **El color sale de un token.** Los valores viven solo en `@theme static` de
   `src/styles/global.css`, y el componente usa la utility (`bg-surface`,
   `text-muted`…). Un token nuevo se declara en `@theme` y no en `:root`, porque
   Tailwind v4 solo genera la clase de lo que está en `@theme`. Su valor de
   oscuro va en el bloque de oscuro del mismo archivo.
4. **Escribir Solid como Solid**: sin desestructurar props (`splitProps` si hay
   que repartirlas); `<Show>` y `<For>` en vez de `&&` y `.map`; señales derivadas
   como función y no copiadas en otra señal.
5. **El texto sale del catálogo** (`src/locales/`, según `docs/localization.md`). Si la pieza necesita un renglón de explicación, se arregla la
   estructura y no se añade el renglón.
6. **Correr los guardas** con `pnpm verify --no-cargo`: `theme-inversion` comprueba
   colores fuera de `@theme`, y `missing-classes` comprueba clases que Tailwind
   no generó. Sus contratos están en `docs/guards.md`. Después, revisa la pieza
   con `review-ui`.

## Salida esperada

La pieza usando átomos y tokens. Cualquier token o variante nueva vive en
`src/styles/global.css` o en su átomo. `pnpm verify --no-cargo` pasa sin `SKIPPED`, o se
dice cuál se omitió. Hay capturas en claro y oscuro.

## Ejemplo

Petición: «un chip que diga en qué rama está la tarea».
Resultado: `Badge` con una variante nueva en su `cva` si ninguna sirve. El color
sale de un semántico existente, el texto del catálogo, y no hay `#hex` ni
`dark:` en el componente.

## Qué no hacer

- **Un `#hex`, un `zinc-500` o un `dark:text-*` en un componente**: no se
  invierte con el tema, o se invierte dos veces porque la rampa ya lo hace, y
  queda ilegible en el modo contrario.
- **Una variable CSS fuera de `@theme` usada como clase**: no pinta nada, no da
  error y no rompe el build. Se ve como un control que no está.
- **Tintar con el color de acción** filas, contenedores o selección: si todo
  lleva el color de acción, nada es la acción (`docs/visual-system.md`).
- **Desenfoque o superficies translúcidas**: el sistema no los usa porque el
  contraste pasaría a depender de lo que haya debajo. Cambiarlo es una decisión
  sobre la regla, no sobre un componente.

## Se activa con

- «hazme un panel para ver las fuentes adjuntas»
- «añade una variante de botón peligrosa»
- «el menú de la tarea se ve raro, rediséñalo»

No se activa con: «anima la entrada del panel», «mira si se ve bien en oscuro».
