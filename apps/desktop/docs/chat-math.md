# Fórmulas en el chat

Las respuestas y los `.md` del visor pintan LaTeX con KaTeX. La sintaxis vive en
`packages/ui/src/markdown-math.ts` y el pintado en `packages/ui/src/Markdown.tsx`.

## Delimitadores

| Escrito | Se pinta |
|---|---|
| `$x$`, `\(x\)` | En línea. |
| `$$x$$` dentro de una frase | En línea. |
| `$$x$$` o `\[x\]` solos en su línea | En bloque, fuera del párrafo, aunque la línea de arriba sea un título en negrita. |
| `$$` en una línea, la fórmula y `$$` en otra | En bloque; puede tener líneas en blanco. |

`\[` solo abre una fórmula al principio de una línea: a media frase sigue siendo
un corchete escapado. El código en línea y los bloques de código no se tocan.

## Dinero

Un solo `$` sigue la regla de pandoc:

- tras el `$` que abre no va un espacio;
- el primer `$` sin escapar que viene después cierra solo si lo precede algo
  que no es espacio y no lo sigue un dígito;
- si ese `$` no puede cerrar, no hay fórmula y los dos `$` quedan como texto.

Así «cuesta $5 y luego $10», «entre $50-$80» y «US$5 y US$10» se leen como
texto, y «cuesta $3.50 y $x^2$ es otra cosa» pinta solo `x^2`. `\$` siempre es
un dólar literal. El caso que la regla no salva es una cantidad seguida, en la
misma línea, de algo que sí parece fórmula pegada a un `$` de cierre
(`$5 y 10$`); el agente puede escapar el dólar.

## Seguridad y errores

KaTeX corre con `trust: false`: `\href`, `\url`, `\includegraphics` y
`\html…` no crean enlaces, imágenes ni HTML. `maxSize` y `maxExpand` limitan
las fórmulas que crecen sin fin, y cada fórmula empieza sin las macros de la
anterior. KaTeX construye el DOM directamente, sin `innerHTML`.

Una fórmula que KaTeX no entiende muestra su texto en crudo, con el error en
el `title`, y el resto del mensaje se pinta igual. Durante el streaming una
fórmula en línea sin cerrar es texto; un bloque `$$` sin cerrar llega hasta el
final del mensaje, como un bloque de código, y se ve crudo mientras no sea
LaTeX válido.

El CSS y las fuentes de KaTeX salen del paquete `katex` y viajan dentro de
`dist/`: la ventana no pide nada a la red. KaTeX y su CSS van en un trozo
aparte (`markdown-katex.ts`) que se carga con la primera fórmula. El color sigue al texto, así que
el tema claro y el oscuro no necesitan reglas propias.
