# Sistema visual

Los controles de Danil usan tokens de `src/styles/global.css` y átomos de
`src/ui/`. Los valores por paleta están en [`color-tokens.md`](./color-tokens.md).

## Tema y paletas

La persona elige Sistema, Claro u Oscuro en Configuración → Apariencia. Puede
seleccionar Violeta o Grafito para claro, y Grafito o Azul para oscuro.
La configuración vive en `localStorage`; `src/lib/theme.ts` la aplica antes del
montaje mediante `data-theme`, `data-light-style` y `data-dark-style`.

El modo Sistema sigue `prefers-color-scheme`. Una elección explícita conserva su
modo aunque el sistema cambie. Las paletas se aplican por cascada CSS; un componente
no redefine sus valores.

## Color

| Uso | Regla |
|---|---|
| Superficies y texto | Tokens de la paleta, incluidos en `@theme static` |
| Acción | `primary` para acciones, enlaces y foco |
| Selección | Forma y estado del control; no confundirla con una acción nueva |
| Estado | Tokens semánticos para éxito, error, advertencia e información |
| Texto de estado | Variantes `strong` sobre la superficie o chip correspondiente |
| Diff | Fondos de adición y retirada, más el tramo de palabra cambiado |
| Identidad del agente | Cuerpo celeste o avatar y nombre; no es un estado de ejecución |
| Iconos de archivo | Identidad del formato, generada desde el paquete de iconos |

Los tonos del diff pertenecen a la paleta de la app. El color indica el lado del
cambio; las barras y símbolos conservan la distinción sin depender solo del color.
Los colores crudos de un componente requieren revisión manual: los guardas de
utilities y tema no detectan todos los valores CSS válidos.

## Tipografía y controles

Geist es la fuente de interfaz; Geist Mono, la de código; Bricolage Grotesque, la de
títulos. Las fuentes están empaquetadas y sus licencias están en `CREDITS.md`.

Los colores, radios, sombras y la escala de texto salen de tokens; los tamaños
se escriben `text-2xs`, `text-caption`, `text-label`, `text-ui`, `text-body` y
`text-lead`, definidos en `packages/design/src/scale.ts` y repetidos en
`global.css`. La separación usa la escala de Tailwind. Anchos de panel, `z-index`
y duraciones todavía no tienen tokens propios.
Los controles asumen el preflight de Tailwind. `cva` define variantes; `cn` combina
clases. Kobalte aporta foco, portal y accesibilidad de popovers, tooltips y menús.

Los nombres, `aria-label`, ayudas de error y estados vacíos salen del catálogo de
idioma. Un control deshabilitado conserva su identidad visual y semántica. El foco
se indica mediante las variantes del átomo; no se sustituye por un hover.

## Geometría de la ventana

`src/lib/window.ts` define la altura de cabecera y la reserva del semáforo de macOS.
La fila de título usa esas medidas; el riel y el panel de trabajo empiezan debajo.
Windows usa controles de ventana propios y Linux conserva decoración nativa.
La apariencia final requiere comprobarse en cada plataforma.

Las columnas laterales tienen ancho independiente. La conversación ocupa el espacio
restante. El reparto de paneles se guarda por espacio; con ancho insuficiente solo
se muestra el panel activo. Los menús y diálogos suspenden la capa nativa de sitios
para mantenerse visibles por encima de ella.

## Tarjetas de tarea

El slot de identidad mide 24 px y permanece a la derecha del título. Un handler
conserva su avatar entre estados; sin handler, el centro queda vacío. Trabajando
lleva un arco exterior y el movimiento interno de Astro, sin punto ni pulso extra.
Las otras marcas de atención van en la esquina de la identidad. El check verde
indica entrega sin ver; el neutro corresponde a una entrega ya leída.

La segunda línea ordena proveedor (solo icono, slot de 16 px), carpeta, máquina,
Git/kn, acción y hora. Carpeta y máquina tienen anchos acotados por el contenedor;
solo su texto se recorta. Agrupar omite la sección repetida y su ancho. La acción
de finalizar conserva el morado de marca y aparece antes de la hora. El pin es
independiente de la atención: sobre el borde superior en escritorio, en línea en
móvil. El menú tiene su espacio y no sustituye la identidad.

Git/kn conserva sus colores e iconos de trabajo; no decide el estado de atención.
El movimiento reducido y el fondo suspenden arcos y movimiento interno. Los tokens
semánticos existentes determinan el contraste de las marcas; el morado fijo conserva
su limitación de contraste sobre el riel oscuro y no se sustituye por `primary`.

## Página de carpeta

La página abre en Tareas; Configuración es otra pestaña con carpeta, fuentes,
agentes y memoria. Cada sección usa `Panel` de `src/ui/`, con `surface` sólido: el
contraste de su texto no depende de la imagen de fondo. Un agente ocupa una línea
y solo muestra quién lo lee cuando esa combinación se sale de la más común.

## Tema de terminal

`src/lib/terminal-themes.ts` y `src/styles/terminal.css` conservan los temas Danil,
Tomorrow Night Blue, Nord, Gruvbox Dark y Dracula. `Workspace.terminal_theme` guarda
la elección y `data-terminal-theme` aplica los tokens `terminal-*`.

El selector de terminal no se ofrece en la sección Apariencia actual. Sus tokens
no repintan las superficies de la app; tampoco reemplazan los tonos actuales del
editor y el diff. La presencia del catálogo no certifica que todos los lectores de
código respondan a esa elección.

## Verificación

| Comprobación | Alcance |
|---|---|
| `scripts/guards/terminal-themes.mjs` | Conjunto de tokens, coincidencia de catálogos y contraste calculado de temas de terminal |
| `scripts/guards/missing-classes.mjs` | Utilities usadas que Tailwind no genera |
| `scripts/guards/theme-inversion.mjs` | Colores de la paleta de Tailwind ajenos a los tokens del sistema |
| `scripts/icons.mjs` | Iconos generados frente al paquete fuente |
| `scripts/guards/animations.mjs` | Animaciones continuas fuera del contrato permitido |

Los contrastes se calculan desde los tokens vigentes. Un valor histórico no certifica
las cuatro paletas actuales. Ninguno de esos guardas demuestra la accesibilidad
completa ni la apariencia de cada pantalla en una ventana nativa. El QA funcional
conserva plataforma, commit y sello del build probado.
