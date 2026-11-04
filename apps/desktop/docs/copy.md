# Lo que una pantalla dice

> El texto visible es etiqueta, estado, error o consecuencia. Lo que explica
> cómo funciona la interfaz es un defecto de disposición.

Esta regla aplica a todo lo que una persona lee dentro de la app: catálogos
`es` y `en`, frases de `packages/`, `Frase` del Rust y textos de estado.

## La prueba

Quita la frase.

- Si la pantalla se sigue entendiendo, sobraba.
- Si al quitarla se pierde una acción, un riesgo o un costo, era una
  consecuencia y se queda.

Un subtítulo que hay que leer para usar la pantalla es una pantalla mal
dispuesta, no un texto que falte.

## Lo que se queda

| Texto | Por qué se queda |
|---|---|
| Errores y qué hacer | Sin la salida, la persona no puede recuperarse |
| Confirmaciones destructivas | Nombran lo que se pierde y no se deshace |
| Permisos, costo, espacio, privacidad | Son consecuencias, no descripciones |
| `aria-label` y `title` | No son texto visible: sostienen lector de pantalla y hover |
| Título de un estado vacío | Es una etiqueta; la acción que lo acompaña hace el resto |
| Estado de una tarea o una máquina | Es un dato, no una explicación |

## Lo que se va, y con qué se reemplaza

| Patrón | En su lugar |
|---|---|
| `lede` bajo el título de una pantalla | El paso, el título y el control ya dicen dónde estás |
| `hint` bajo el nombre de una sección | El nombre y sus pestañas; si hace falta el hint, sobra una pestaña |
| `why` visible junto a una métrica | La unidad correcta, una leyenda bajo la gráfica o el `title` |
| Leyenda de teclado en el compositor | El menú que abre el gesto, con su fila resaltada |
| «Todavía no disponible» | No pintes la entrada hasta que exista |
| «Puedes cambiarlo después» | Ninguna opción es definitiva; decirlo una vez ya sobra |

## El guarda

`scripts/guards/copy.mjs` cuenta las claves del catálogo fuente que nombran una
explicación: `description`, `hint`, `why`, `lede`, `intro`, `help`, `note`,
`subtitle` y `tagline`, con punto (`settings.x.description`) o con guion bajo
(`settings.x_hint`).

```bash
node scripts/guards/copy.mjs            # guarda: falla si subió
node scripts/guards/copy.mjs --update   # fija el trinquete; solo baja
node scripts/guards/copy.mjs --list     # audita las claves contadas
```

El baseline (`scripts/guards/copy-baseline.json`) solo baja: `--update` nunca
sube un número, igual que `comments-baseline.json`. Una limpieza lo baja; una
pantalla nueva no lo sube.

### Lo que el guarda no ve

- **El texto que explica sin sufijo**: una clave `foo.bar` con un párrafo
  dentro no se cuenta. El guarda mide la forma, no el contenido.
- **Un cambio por otro**: borrar un `hint` y añadir otro deja el total igual.
  `--list` es la auditoría; el guarda es el trinquete.
- **La app móvil**: sus 517 frases viven en `apps/mobile/src/lib/i18n.ts`,
  fuera de esta cadena. Queda como el siguiente paso, con su propio guarda.
- **Si la traducción dice lo mismo**: eso lo revisa quien habla la lengua, no
  un programa.

## Fuera de alcance

No se recortan errores, confirmaciones destructivas, permisos ni etiquetas de
accesibilidad. Tampoco se recorta el texto del lanzador cuando el motor falla:
ahí el texto es la salida.

La regla del catálogo sigue en [localization.md](./localization.md); la del
sistema visual, en [visual-system.md](./visual-system.md).
