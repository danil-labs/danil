# Tokens de color

El inventario de todos los colores de la app y su valor en cada paleta. Las reglas visuales están en [visual-system.md](visual-system.md); aquí están los valores y los puntos de edición de una paleta.

Las muestras de color de cada token, lado a lado en las cuatro paletas, con el chat y el sidebar, están en [color-tokens.html](color-tokens.html); se regenera con `node scripts/color-tokens.mjs`.

La única fuente de verdad es [`src/styles/global.css`](../src/styles/global.css). Si este documento y el CSS no coinciden, manda el CSS: copia los valores de ahí, no de otro documento.

## Las paletas y cómo se eligen

| Paleta | Cuándo se pinta | Selector en el CSS |
|---|---|---|
| Claro violeta | Tema claro, por omisión | `@theme static` + `:root` |
| Claro grafito | Tema claro, si se elige «Grafito» | `[data-theme="light"][data-light-style="graphite"]` |
| Oscuro grafito | Tema oscuro, por omisión | `[data-theme="dark"][data-dark-style="graphite"]` |
| Oscuro azul | Tema oscuro, si se elige «Azul» | `[data-theme="dark"]` |

Ajustes → Apariencia elige el **tema** (Como el sistema / Claro / Oscuro) y un estilo para cada modo: **claro** (Violeta / Grafito) y **oscuro** (Grafito / Azul). Los tres viven en `localStorage` y [`src/lib/theme.ts`](../src/lib/theme.ts) los aplica antes del primer pintado: `data-theme`, `data-light-style` y `data-dark-style` en `<html>`.

Las paletas se apilan: el oscuro grafito solo redeclara lo que cambia respecto al azul, y el azul y el claro grafito solo lo que cambia respecto al claro violeta. En las tablas, «= azul» o «= violeta» quiere decir que el token se hereda, y «= surface-muted» que apunta a otro token de la misma paleta.

## Superficies

| Token | Claro violeta | Claro grafito | Oscuro grafito | Oscuro azul | Para qué |
|---|---|---|---|---|---|
| `--color-bg` | `#f9f9f9` | `#f4f4f5` | `#111113` | `#070b1c` | Suelo de la ventana |
| `--color-surface-muted` | `#f3f4f8` | `#ececee` | `#19191c` | `#101630` | Superficie hundida: bloques de código y diff |
| `--color-surface` | `#ffffff` | `#ffffff` | `#212124` | `#1a2240` | Composer, tarjetas, contenido de Ajustes |
| `--color-surface-raised` | `#ffffff` | `#ffffff` | `#2c2c30` | `#242e54` | Menús, popovers, globo de un agente |
| `--color-rail` | `#edeff5` | `#ebebed` | `#161618` | `#0d132b` | Riel de Ajustes |
| `--color-border` | `rgb(10 13 35 / 0.1)` | `rgb(9 9 11 / 0.09)` | `rgb(255 255 255 / 0.08)` | `rgb(255 255 255 / 0.1)` | Borde por defecto (hairline con alfa) |
| `--color-border-strong` | `rgb(10 13 35 / 0.16)` | `rgb(9 9 11 / 0.15)` | `rgb(255 255 255 / 0.14)` | `rgb(255 255 255 / 0.16)` | Borde de controles y foco suave |
| `--color-danil-mark-from` | `#6539f5` | = violeta | = azul | `#8b6cff` | Inicio del degradado del borde de un workspace de Danil en el riel |
| `--color-danil-mark-to` | `#8f5ff8` | = violeta | = azul | `#c9a8ff` | Fin de ese degradado; reemplaza al borde normal del cuadro. Contra la superficie del cuadro: 3,21:1 en hover y 3,70:1 contra el fondo en claro; mínimo 3,57:1 en oscuro |

## Rampa de neutros

| Token | Claro violeta | Claro grafito | Oscuro grafito | Oscuro azul | Para qué |
|---|---|---|---|---|---|
| `--color-neutral-50` | `#fafbfd` | `#fafafa` | `#111113` | `#070b1c` | Texto sobre rellenos invertidos (`text-neutral-50`) |
| `--color-neutral-100` | `#f3f4f8` | `#e9e9ec` | `#1e1e21` | `#101630` | Rellenos suaves y hover |
| `--color-neutral-200` | `#e2e4ee` | `#e0e0e4` | `#2c2c30` | `#242e54` | Rellenos de chips, avatares y hover |
| `--color-neutral-300` | `#d0d3e0` | `#d4d4d8` | `#424248` | `#39456f` | Casi sin uso |
| `--color-neutral-500` | `#62647a` | `#5f5f68` | `#9a9aa3` | `#8d96bc` | Texto secundario: metadatos, fechas, rótulos |
| `--color-neutral-700` | `#3c3f50` | `#3f3f46` | `#b4b4bc` | `#a3abcb` | Texto atenuado: filas, descripciones |
| `--color-neutral-900` | `#14162a` | `#18181b` | `#d4d4d8` | `#c6cbe2` | Texto fuerte y rellenos invertidos |
| `--color-neutral-950` | `#0a0d23` | `#0a0a0b` | `#ececef` | `#e9ecf8` | Texto principal |

## Acción y marca

| Token | Claro violeta | Claro grafito | Oscuro grafito | Oscuro azul | Para qué |
|---|---|---|---|---|---|
| `--color-primary` | `#6539f5` | `#18181b` | `#ececef` | `#4fe3d8` | Acción: botón principal, foco, barra de selección |
| `--color-primary-dark` | `#5429e5` | `#27272a` | `#ffffff` | `#6bede4` | Hover de la acción |
| `--action-text` | `#ffffff` | `#ffffff` | `#111113` | `#070b1c` | Texto sobre la acción |
| `--color-secondary` | `#f4eb7b` | = violeta | `#f4eb7b` | `#6539f5` | Inversión de marca (amarillo salvo en el oscuro azul); casi sin uso |
| `--color-accent` | `#5fcc79` | = violeta | = violeta | = violeta | Verde de marca; casi sin uso |
| `--color-emphasis` | `#6539f5` | `#0a0a0b` | `#ececef` | `#4fe3d8` | Negritas del chat |
| `--color-link` | `#277c3c` | `#6e5f00` | `#f4eb7b` | `#fbbf24` | Enlaces del chat |
| `--color-brand-yellow` | `#f4eb7b` | = violeta | = violeta | = violeta | Amarillo Danil, igual en todos los temas |
| `--color-brand-navy` | `#0a0d23` | = violeta | = violeta | = violeta | Navy Danil, igual en todos los temas |
| `--color-brand-purple` | `#6539f5` | = violeta | = violeta | = violeta | Morado Danil, igual en todos los temas |

## Chat

| Token | Claro violeta | Claro grafito | Oscuro grafito | Oscuro azul | Para qué |
|---|---|---|---|---|---|
| `--color-chat-user` | `primary 8% sobre surface-raised` | `brand-yellow 28% sobre surface-raised` | `brand-yellow 8% sobre surface-raised` | `primary 12% sobre surface-raised` | Globo de la persona |
| `--color-chat-user-border` | `primary al 20%` | `#c9bb2a al 45%` | `brand-yellow al 22%` | `primary al 25%` | Borde del globo de la persona |
| `--color-chat-incoming` | `= surface-muted` | `#f0f0f2` | = azul | `= surface-raised` | Globo de un agente u otra tarea |

El globo de un agente u otra tarea usa `chat-incoming` ([`TaskChatPresentation.tsx`](../src/features/chat/TaskChatPresentation.tsx)). En oscuro es `surface-raised`; en claro no puede serlo, porque `surface-raised` es blanco como el chat (1,00:1). El globo de la persona **tiene** que llevar un tinte que lo separe de `chat-incoming`, o los dos se ven iguales.

Dentro del globo de la persona, la línea «Para: …» va en `neutral-900` y no en `neutral-500`: el tinte baja el gris secundario a 3,43:1 en azul y 4,02:1 en grafito.

## Estado

| Token | Claro violeta | Claro grafito | Oscuro grafito | Oscuro azul | Para qué |
|---|---|---|---|---|---|
| `--color-success` | `#5fcc79` | = violeta | = violeta | = violeta | Relleno de éxito |
| `--color-error` | `#ef4444` | = violeta | = violeta | = violeta | Relleno de error |
| `--color-warning` | `#f59e0b` | = violeta | = violeta | = violeta | Relleno de aviso |
| `--color-info` | `#3b82f6` | = violeta | = violeta | = violeta | Relleno informativo |
| `--color-success-strong` | `#166534` | = violeta | = azul | `#4ade80` | Texto de éxito |
| `--color-error-strong` | `#dc2626` | = violeta | = azul | `#f87171` | Texto de error |
| `--color-warning-strong` | `#92400e` | = violeta | = azul | `#fbbf24` | Texto de aviso |
| `--color-info-strong` | `#1d4ed8` | = violeta | = azul | `#93c5fd` | Texto informativo |

El relleno (`success`, `error`…) es igual en todos los temas; el texto (`-strong`) cambia de escalón para pasar AA sobre su fondo.

## Diff

| Token | Claro violeta | Claro grafito | Oscuro grafito | Oscuro azul | Para qué |
|---|---|---|---|---|---|
| `--color-diff-add` | `#e6f4ea` | = violeta | = azul | `#122a1b` | Fondo de línea añadida |
| `--color-diff-del` | `#fdecec` | = violeta | = azul | `#3a1a1f` | Fondo de línea quitada |
| `--color-diff-add-word` | `#aedfbc` | = violeta | = azul | `#1c4a2d` | Tramo añadido dentro de la línea |
| `--color-diff-del-word` | `#f7c9c9` | = violeta | = azul | `#6c2a3c` | Tramo quitado dentro de la línea |

## Editor y sintaxis

| Token | Claro violeta | Claro grafito | Oscuro grafito | Oscuro azul | Para qué |
|---|---|---|---|---|---|
| `--color-syntax-keyword` | `#6d28d9` | = violeta | = azul | `#c4b5fd` | Palabras clave |
| `--color-syntax-string` | `#166534` | = violeta | = azul | `#86efac` | Cadenas |
| `--color-syntax-number` | `#92400e` | = violeta | = azul | `#fcd34d` | Números |
| `--color-syntax-function` | `#1e40af` | = violeta | = azul | `#93c5fd` | Funciones |
| `--color-syntax-type` | `#115e59` | = violeta | = azul | `#5eead4` | Tipos |
| `--color-syntax-tag` | `#9f1239` | = violeta | = azul | `#fda4af` | Etiquetas |
| `--color-syntax-attribute` | `#7e22ce` | = violeta | = azul | `#d8b4fe` | Atributos |
| `--color-syntax-comment` | `#585a6e` | = violeta | `#8b8b94` | `#99a2c4` | Comentarios |
| `--color-editor-selection` | `primary 14% sobre surface-muted` | = violeta | = azul | `primary 16% sobre surface-muted` | Selección en el editor |
| `--color-editor-match` | `warning 20% sobre surface-muted` | = violeta | = violeta | = violeta | Coincidencias de búsqueda |
| `--color-editor-active-line` | `neutral-950 al 4%` | = violeta | = violeta | = violeta | Línea del cursor |

## Sombras y scroll

| Token | Claro violeta | Claro grafito | Oscuro grafito | Oscuro azul | Para qué |
|---|---|---|---|---|---|
| `--shadow-sm` | `0 1px 2px rgb(10 13 35 / 0.06)` | `0 1px 2px rgb(9 9 11 / 0.08)` | = azul | `0 1px 2px rgb(0 0 0 / 0.4)` | Elevación ligera |
| `--shadow-md` | `0 2px 8px rgb(10 13 35 / 0.08)` | `0 2px 8px rgb(9 9 11 / 0.08)` | = azul | `0 2px 8px rgb(0 0 0 / 0.45)` | Elevación media |
| `--shadow-lg` | `0 8px 24px rgb(10 13 35 / 0.1)` | `0 8px 24px rgb(9 9 11 / 0.1)` | = azul | `0 16px 40px rgb(0 0 0 / 0.55)` | Menús y diálogos |
| `--scrollbar-thumb` | `rgb(10 13 35 / 0.15)` | `rgb(9 9 11 / 0.15)` | = azul | `rgb(255 255 255 / 0.18)` | Pulgar de la barra de scroll |
| `--scrollbar-thumb-hover` | `rgb(10 13 35 / 0.3)` | `rgb(9 9 11 / 0.3)` | = azul | `rgb(255 255 255 / 0.35)` | Pulgar en hover |

## Lo que no cambia con la paleta

- **La terminal** tiene su propia capa de color (`--color-terminal-*`), oscura en todos los temas. Hay cinco esquemas escritos en [`src/styles/terminal.css`](../src/styles/terminal.css), pero hoy ninguna pantalla los ofrece.
- **Los cuerpos celestes** (`--astro-*`, en `:root`) distinguen a quince agentes entre sí. El oscuro azul solo retoca la luna, el asteroide y el agujero negro; grafito los hereda.
- **Los radios** (`--radius-sm/md/lg`: 4 / 6 / 8 px) son los mismos en todas las paletas. Grafito probó 6/8/10 y se descartó: los botones se veían demasiado redondos.

## Crear una paleta nueva

1. **Decide de qué tema sale.** Una paleta oscura es un bloque `[data-theme="dark"][data-dark-style="<id>"]` y una clara `[data-theme="light"][data-light-style="<id>"]`.
2. **Redeclara como mínimo**, que es lo que hicieron los dos grafitos:
   - las cinco superficies (`bg`, `surface-muted`, `surface`, `surface-raised`, `rail`) y los dos bordes;
   - la rampa de neutros entera (`neutral-50` … `neutral-950`);
   - `primary`, `primary-dark` y `--action-text`;
   - `emphasis` y `link`;
   - `chat-user`, `chat-user-border` y, si el chat y `surface-raised` coinciden, `chat-incoming`;
   - `syntax-comment` en oscuro, que cuelga de la rampa;
   - en claro, las sombras y el scroll, que llevan el tono de la rampa.
3. **Mide antes de dar valores por buenos** (WCAG, sobre la superficie donde se posa, no sobre el fondo de la ventana):
   - texto principal sobre `bg`: muy por encima de 7:1, sin llegar al blanco o negro puro;
   - `neutral-500` sobre la superficie más cercana a él y sobre la tarea abierta (`neutral-200`): **4,5:1 o más**;
   - `link` y `--action-text` sobre su fondo: 4,5:1 o más;
   - escalones contiguos de superficie, el hover del sidebar (`neutral-100` contra `bg`) y el globo de un agente contra el chat: alrededor de **1,1:1**, para que se distingan.
4. **Añade la opción** en [`src/lib/theme.ts`](../src/lib/theme.ts) (`DarkStyle` o `LightStyle`) y en [`Appearance.tsx`](../src/features/settings/Appearance.tsx), con sus textos en `src/locales/{es,en}/settings.json`.
5. **Revisa en la app** chat, diff, editor, menús y Ajustes. `pnpm verify` cuida que ningún color salga de la paleta por omisión de Tailwind (`scripts/guards/theme-inversion.mjs`), pero no mira contrastes.
6. **Actualiza este documento** con una columna nueva, añade la paleta a `PALETAS` en `scripts/color-tokens.mjs` y regenera el HTML.
