# Visualizaciones integradas al chat

La ventana presenta una gráfica entre los párrafos de la respuesta, sobre el
fondo del mensaje. El iframe conserva el sandbox de artefactos, sin red,
DOM padre ni API nativa. La gráfica recibe Geist y los tokens de la paleta
actual; cambiar tema, paleta o título no vuelve a cargar el archivo.

## Directiva y archivos

El agente escribe HTML UTF-8 autocontenido en `exchange/visuals/` de su tarea
y publica una línea fuera de código, citas y listas:

```text
::terminus-visual{file="chart-unique.html" title="Turnos por día"}
```

`file` es un basename ASCII de hasta 128 bytes terminado en `.html`. No acepta
rutas, archivos ocultos, ADS ni nombres reservados. `title` es opcional y admite
hasta 240 unidades UTF-16. Las cadenas usan comillas JSON. Los archivos tienen
nombres únicos por visualización y versión; reescribirlos cambia también lo
que muestra el historial. El parser reconoce ocho directivas por respuesta;
las adicionales conservan su texto. Las directivas en código, listas o citas
no se ejecutan. Una directiva incompleta espera al cierre del streaming.

El motor entrega la capacidad y la carpeta exacta por el canal nativo de cada
agente. La carpeta de la tarea queda fuera del prefijo compartido de instrucciones.
El HTML usa fondo transparente, altura natural y tipografía heredada, sin
tarjeta externa, barra de título repetida ni estructura de otra app.
Dispone de `--background`, `--foreground`, `--muted`, `--muted-foreground`,
`--primary`, `--border` y los tokens semánticos `--color-*-strong`.
Los colores fijos de elementos internos de un archivo anterior se conservan.

## Motor y contrato

La lectura usa `tree_show(project, session, tree, path)` del contrato RPC1
existente, con `tree="terminus-chat-visuals"` y `path` igual al basename.
Este selector no enumera ni modifica un árbol o índice Git. El motor valida
la sesión en el workspace de la petición y lee solo su `exchange/visuals/`.

La ventana transmite el workspace capturado mediante el header IPC local
`x-terminus-workspace`. El proxy lo coloca en el campo `workspace` del sobre
RPC1; no agrega un parámetro al comando. Exige el header para este selector.
`commands.json` y su hash permanecen byte-exactos.

La lectura va primero por `chat_visual_part(project, session, file, offset,
size, revision?)`, en partes de 512 KiB en base64, como `carry`: cada parte es
una llamada corta también por el relay. El motor arma la página una vez con sus
imágenes: cada `src`, `href` o `url()` relativo con extensión de imagen que esté
dentro de `exchange/visuals/` se incrusta como `data:`, como el `html_render` de
t3code. Fuera de esa carpeta, ocultos, enlaces y remotos quedan como están. Los
topes son los de t3code: 10 MiB por imagen y 25 MiB la página armada. Las
partes siguientes mandan la `revision` de la primera y salen de la misma página
armada; si ya no está, el motor contesta `visual_changed` y el lector
(`readVisualHtml` de `packages/ui/src/lib/chat/visual.ts`, el mismo en la ventana y el
teléfono) empieza otra vez una sola vez.

Con un motor sin `chat_visual_part` —el proxy de la ventana lo niega mientras
el contrato copiado no lo tenga, un motor viejo contesta `service.error.command`
y el relay o la lista del teléfono `command_not_allowed`— el lector cae a
`tree_show`, que entrega la página armada de una vez si cabe en 512 KiB. Esa
respuesta usa el `Contenido` existente: `kind="text"`, `text`, `bytes`,
`truncated=false` y sin PDF ni imagen. La lectura del motor conserva handles,
rechaza symlinks, reparse points y archivos especiales y exige UTF-8 estricto.
El front comprueba tipo, tamaño y la coincidencia entre bytes y texto; traduce
los detalles `invalid_visual_file`, `visual_too_large` y `visual_read_failed`
con su catálogo.

La capacidad requiere un motor que atienda el selector reservado. El pin
`4b8714c` anterior no lo incluye. El laboratorio puede probar un binario local
con `engine.mjs download --from`; eso no actualiza el pin de distribución ni
acredita binarios de otras plataformas. La instalación de prueba registra
los commits de ventana y motor, su hash y la identidad de datos aislados.

## Altura, estado y recursos

El bloque empieza a leer al entrar en vista o quedar a 200 píxeles. Cada chat
reserva hasta 16 visualizaciones cargadas, con páginas de hasta 25 MiB.
Cerrar, fallar o desmontar libera la reserva; una lectura pendiente conserva
la suya hasta terminar y descarta resultados anteriores.

El runtime mide el cuerpo y la caja del documento, incluidos los márgenes
exteriores, después de cambios de contenido, fuentes y ancho.
La altura inicial reserva 320 píxeles; después sigue el contenido entre 48 y
4096 píxeles. Lo que excede ese tope se desplaza dentro del marco.
El receptor acepta solo alturas numéricas finitas y Escape del `contentWindow`
del iframe cargado, con origen opaco. No acepta rutas, HTML ni llamadas nativas.

Ampliar pasa el mismo nodo a la capa modal del navegador, con hasta 75 dvh,
trampa de foco y fondo. Reducir o Escape lo devuelve al mensaje y restaura
el foco. El iframe permanece montado, con sus filtros y sliders.
Las acciones aparecen al posar o enfocar, y quedan visibles con puntero táctil.
La ampliación reserva la capa modal en `lib/sites.ts`, ocultando los sitios
nativos aunque el diálogo siga bajo `#root`. Reducir, cerrar o desmontar libera
esa reserva; los menús y portales conservan su propia suspensión.

Si la lectura falla, el bloque conserva su lugar entre los párrafos: título,
nombre del archivo, el error, Reintentar y Abrir en el navegador. Abrir usa
`tree_open_external` con el mismo selector, header y comprobaciones de ruta,
sin el tope de tamaño ni UTF-8.

En Windows, la lectura comparte lectura y escritura en las carpetas y también
el borrado en los archivos, y suelta `session.json` antes de leer el visual.
La ventana suele pedir el visual cuando el turno que lo publicó está cerrando;
un handle sin compartir hacía fallar con os error 32 el rename que guarda la
transcripción. Si el motor no logra guardar un turno, su `done` lleva
`text="unsaved"`: la ventana conserva lo que pintó en vivo, avisa y no relee
el disco hasta otra apertura.

El historial conserva la directiva original. Reabrir carga el mismo archivo;
el estado JavaScript se reinicia tras cerrar o desmontar el iframe.
El sandbox no limita CPU ni memoria de los scripts del agente.

## Escenarios de validación

| Recorrido | Resultado esperado |
|---|---|
| Filtro, slider, tema y paleta | Actualizan la gráfica sin recargarla |
| Título, cierre del turno y relectura | Conservan iframe y selección |
| Ampliar, tabular y Escape | Mismo estado, foco modal y retorno al botón |
| Gráfica y sitio en paneles separados | Ampliar oculta el sitio nativo; cerrar lo restaura |
| Contenido que crece y se reduce; márgenes; ancho estrecho | Ajusta altura y permite seguir por el chat |
| Altura no finita o mensaje de otro marco | Rechaza; las alturas válidas se acotan |
| Ocho directivas y una novena; 17 marcos en el hilo | Respeta límites y permite cerrar para cargar otro |
| Archivo faltante y reintento | Error localizado con el nombre del archivo; recupera tras crearlo |
| Lectura fallida y Abrir en el navegador | El texto sigue; abre el HTML con su app |
| Turno con visual cuyo guardado falla | El mensaje sigue en el chat, con aviso |
| Tamaño, UTF-8, symlink, reparse, reservado y archivo especial | Rechazo por el motor antes de cargar HTML |
| Sesión ajena y cambio de workspace durante la lectura | Mantiene el ámbito capturado |
| Red, DOM padre, API, popups y navegación | Bloqueados por el sandbox y la CSP |

La integración en Chromium y jsdom no acredita apertura nativa en WebKit o
WebView2. Cada corrida nativa conserva plataforma, commits, identidad de datos,
sellos de ventana y motor, comandos, resultado y evidencia según
[desarrollo](development.md).
