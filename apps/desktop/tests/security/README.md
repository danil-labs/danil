# pruebas — atacar lo que la app hace con lo que escribe un agente

Estos laboratorios comprueban cómo la app presenta contenido generado:

| | Qué ataca | Con qué |
|---|---|---|
| El contenedor de artefactos | El HTML que el agente produce y la app embebe | `laboratory.html`, `hostile-artifact.html`, `artifact-hijack.html` |
| La ventana del chat | El markdown de la respuesta, que **no va dentro de ningún contenedor** | `window.mjs`, `window.html`, `unrestricted-window.html` |

Comparten la misma regla: **no se da por bueno porque el código parezca
correcto**, se prueba intentando la violación y con su control negativo. Ambos
comparten la sonda.

## El contenedor de artefactos

La app pinta HTML que **escribió un agente** sobre contenido que salió del repo
del cliente. Si ese HTML puede hacer red, se lleva el repo a donde quiera y «no
sube el contenido del repo a ningún servidor» deja de ser cierto sin que nadie se
entere. Solo lectura impide modificar, no exfiltrar, así que la vía de salida que importa
es la red y no el sistema de archivos.

Esto no se da por bueno porque el código *parezca* correcto. Se prueba
intentando la violación, y con su **control negativo** — la mitad que **debe**
pasar. Sin ella, «no llegó nada» es igual de compatible con «el candado
funciona» que con «la prueba estaba mal escrita», que es exactamente lo que pasó
al verificar la contención de Claude.

## Las piezas

| Archivo | Qué es |
|---|---|
| `probe.mjs` | Un servidor que registra **todo** lo que le llegue. Cada línea de su registro es código que logró salir a la red |
| `hostile-artifact.html` | Un artefacto hostil: 20 formas de mandar contenido afuera, con y sin JavaScript |
| `artifact-hijack.html` | El otro canal: ataca `postMessage`, que **no es red** y por eso la sonda no lo ve |
| `laboratory.html` | Los dos artefactos en los contenedores que ha tenido la app, y el panel que juzga el puente |

> **`hostile-artifact.html` no se toca.** Sus 20 vectores son el patrón de
> comparación: si cambian, «0 dentro» y «20 fuera» dejan de medir lo mismo y
> ninguna corrida vieja sirve de referencia. Lo nuevo se prueba **añadiendo
> archivos y mitades**, no editando el control.

## Correrlo

```sh
node tests/security/probe.mjs            # una terminal: la sonda, en :8788
pnpm dev                          # otra: el servidor de desarrollo
```

Y en el navegador, las tres corridas:

1. **`/tests/security/laboratory.html`** — el contenedor de ahora (rutas `/dentro/…`),
   **el mismo declarado `tabla`** (`/tabla/…`) y el de antes (`/antes/…`). Abajo,
   el panel del puente.
2. **`/tests/security/hostile-artifact.html?ruta=suelto`** — el mismo archivo sin
   contenedor ninguno. Es el control negativo (`/suelto/…` y `/fuga/…`).
3. **Dentro de la app**: copiar `hostile-artifact.html` a la carpeta de trabajo
   de una sesión y abrirlo desde la columna de artefactos.

**La mitad `tabla` existe porque una forma nueva es superficie nueva.** Entra por
el mismo `envolver()`, pero mete código nuevo *dentro* del marco —el que ordena
columnas—, y «entra por el mismo sitio» es un argumento, no una medición. Lo
único que cambia entre `/dentro/` y `/tabla/` es la palabra del `<meta>`: los 20
vectores son los mismos bytes, así que si saliera algo de un lado y no del otro,
sería la forma y no el artefacto.

## Qué contiene el contenedor

Tres candados, y hacen falta los tres. Cada uno cierra lo que los otros no
alcanzan:

| Candado | Dónde | Qué cierra |
|---|---|---|
| `sandbox` sin `allow-same-origin` | `packages/features/artifacts/src/model/sandbox.ts` | Origen opaco: no alcanza el DOM de la app, ni sus cookies, ni sus comandos |
| Política de contenido inyectada | `packages/features/artifacts/src/model/sandbox.ts` (`CSP_ARTEFACTO`) | `fetch`, XHR, WebSocket, EventSource, beacon, imagen remota, fuente, hoja de estilo, `script src`, formularios, marcos hijos |
| `frame-src 'self'` en la ventana | `index.html` | `location.href` y `meta refresh` — un marco **siempre** puede navegarse a sí mismo, y ni el sandbox ni su propia política lo impiden |

Y un cuarto candado que **no es de red y por eso no está en esa tabla**:
`leerEstado` en `packages/features/artifacts/src/model/sandbox.ts`,
que deciden qué se le acepta al marco por `postMessage`. Ver «El puente» más
abajo.

## Resultado, vuelto a correr el 2026-08-07 con la tabla dentro

WebKit es el motor del webview en macOS, así que es el banco fiel. Esta corrida
va en **WebKit 26.5 headless** (Playwright) y se repitió en **Chromium
headless**, con el mismo resultado en las dos mitades. En Windows el webview es
Chromium (WebView2) y esto **se vuelve a correr ahí**: la contención se verifica
por plataforma, no una vez.

```
=== DENTRO (el contenedor de ahora) ===
  (ninguna línea)
=== TABLA (el mismo artefacto, declarado tabla) ===
  (ninguna línea)
=== señales de vida ===
  GET /senal-de-vida/dentro?diapositivas=0&filas=14   ← el documento cargó y corrió
  GET /senal-de-vida/tabla?diapositivas=0&filas=14    ← y el runtime de tabla contó sus filas
=== ANTES (sandbox="" a secas, lo que había en main) ===
  1 /antes/css-bg-sin-js
  1 /antes/css-sin-js
  1 /antes/font-sin-js
  1 /antes/img-sin-js
=== SUELTO (el mismo archivo sin contenedor) ===
  20 vectores distintos: fetch, fetch-post, xhr, img, beacon, websocket,
  eventsource, script, css, css-bg, font, iframe, form, navegacion,
  window-open + los cinco sin JavaScript
```

Cuatro cosas se leen ahí:

1. **Del contenedor no salió nada.** Ni un intento, ni en la forma documento ni
   en la forma tabla.
2. **Los dos documentos estaban vivos.** La señal se manda desde la página que
   los embebe, no desde el documento: un marco que nunca cargó tampoco pide red,
   y sin este renglón el registro vacío no probaría nada. El de la tabla dice
   además **cuántas filas contó**, que es lo que prueba que el código nuevo corrió
   de verdad dentro del marco.
3. **El contenedor anterior no contenía.** `sandbox=""` parece más estricto que
   el de ahora —ni siquiera deja correr scripts— y deja salir cuatro cosas,
   porque **exfiltrar no necesita JavaScript**: una imagen remota, una hoja de
   estilo o una fuente son HTML a secas y el contenido viaja en la URL. El
   cambio de `sandbox=""` a `allow-scripts` + política se ve como aflojar y es
   lo contrario: se cambió «no corre nada, pero sale» por «corre, y no sale».
4. **El control negativo dio 20, no 19, y eso corrige lo que decía este
   archivo.** El vector que apareció es `window.open`, que la versión anterior
   daba por indemostrable *«ni en el control negativo: el bloqueador de ventanas
   emergentes lo para antes»*. En un navegador headless no hay bloqueador de
   emergentes, así que salió. **19 era una propiedad del navegador con el que se
   miró, no de la lista de vectores** — y como se estaba usando de cifra de
   referencia, conviene decirlo en vez de dejar la resta sin cuadrar. Dentro del
   contenedor sigue cerrado por la falta de `allow-popups`, que es lo que decía
   la otra mitad de aquella nota y sí se sostiene.

## El puente: `postMessage`, que la sonda no puede ver

El visor solo acepta contadores del marco que tiene montado, mediante
`leerEstado`. Los mensajes de edición, contenido y conversión ya no tienen
receptor ni pueden solicitar escrituras en disco. El laboratorio conserva la
prueba del estado hostil y del aislamiento entre los dos DOM.

Las mediciones históricas del editor y de los conversores se retiraron junto
con esos canales. El laboratorio de navegador actualizado está sin verificar.

## Lo que esta prueba **no** cubre, y hay que decirlo

- **Fuera de la app no hay contenedor.** «Abrir afuera» y la copia para imprimir
  entregan el archivo al navegador del sistema, donde nada de esto aplica. La
  copia para imprimir se lleva la política embebida dentro del archivo, que
  mitiga casi todo salvo la navegación; el artefacto original se abre tal cual.
  Es un límite, no un control. Un HTML del árbol de trabajo sale igual, tal
  cual, por «Abrir en mi navegador».
- **La vista previa del árbol no se ha corrido aquí.**
  `packages/features/code/src/screens/FileViewer.tsx` pinta un HTML del árbol con el mismo
  `packages/ui/src/Document.tsx`, así que tiene los mismos
  tres candados. Eso es un argumento y no una medición: la corrida 3 se puede
  hacer abriendo `hostile-artifact.html` desde el árbol.
- **Esto no dice nada de la ventana del chat.** Es el otro laboratorio, más
  abajo: ahí el contenido del agente se pinta **sin contenedor ninguno**.
- **`meta refresh` sigue sin demostrarse ni en el control negativo**, y no
  porque esté contenido: `location.href` se dispara antes y se lleva la página,
  así que el refresco nunca llega a vencer. Es un hueco de la prueba, no un
  candado.
- **El puente se juzga con las funciones de la app, pero no con la app.** El
  panel llama a las mismas cuatro funciones que usa `Document.tsx`; lo que no
  ejercita es el resto de la cadena —el comando de Tauri, la escritura en disco—.
  Para eso está la corrida 3, dentro de la app.
- **Los topes se prueban por arriba, no por abajo.** Se comprueba que un
  documento gigante se recorte y lo diga; no se comprueba qué pasa con uno que
  quepa justo en el límite.

---

# La ventana del chat

**El chat no va dentro de ningún contenedor.** El artefacto se embebe en un marco
con tres candados; la respuesta del agente se pinta **en el documento de la app**,
al lado del puente con Rust. Los dos leen material del cliente, y el material del
cliente no es de confianza: un README, un issue o un comentario de código pueden
traer «cita este gráfico» con una URL ajena detrás. No hace falta un agente
malicioso — basta material malicioso, que es lo que este producto existe para
leer.

Y lo que sale por aquí no pasa por ninguna salida registrada: **sin sello y sin rastro**.

## Las piezas

| Archivo | Qué es |
|---|---|
| `hostile-response.ts` | La respuesta del agente, con siete vectores. **No se toca**: es el patrón de comparación |
| `hostile-window.tsx` | Monta el `Markdown` de la app —el de verdad, importado de `packages/ui/src/`— o la copia congelada de cómo pintaba antes |
| `window.html` | La misma política que `index.html`, byte por byte. `scripts/guards/csp.mjs` falla si dejan de serlo |
| `unrestricted-window.html` | El mismo archivo sin política ninguna: el control negativo |
| `window.mjs` | Levanta la sonda, el servidor de desarrollo y los dos motores, y dice qué salió |

```sh
PLAYWRIGHT=/ruta/a/node_modules/playwright node tests/security/window.mjs
```

Playwright no es dependencia de este repo —no hace falta para compilar la app— y
por eso se pasa la ruta. Los navegadores van headless: esto no le quita la
pantalla a nadie.

**WebKit es el motor del webview en macOS y Chromium el de Windows**, así que se
corren los dos. La política la aplica cada motor por su cuenta.

## Las cuatro mitades, y hacen falta las cuatro

Cruzar «con política / sin política» por «con filtro / sin filtro» es lo que
permite decir **cuál de las dos capas paró cada cosa**. Con una sola corrida, un
registro vacío no distingue entre las dos — ni entre ellas y una prueba mal
escrita.

## Resultado, corrido el 2026-08-13

Antes, con `csp: null` y el `href`/`src` sin filtrar, las cuatro corridas daban
**exactamente lo mismo**, que es la forma corta de decir que no había ni política
ni filtro:

```
=== SIN CLIC ===
  /fuga/img-inline?d=SALARIOS-Q3-CONFIDENCIAL       ← la imagen se pide sola
  /fuga/img-referencia?d=SALARIOS-Q3-CONFIDENCIAL   ← y por la otra sintaxis
=== AL PULSAR javascript: ===
  /fuga/a-javascript?d=Informe Q3\n\nEl material del cliente dice…
  el documento cambió de título
  llamó al puente de Tauri → invoke(open_external)
=== AL PULSAR http: ===
  /fuga/a-navegacion?d=SALARIOS-Q3-CONFIDENCIAL
  y en Chromium la ventana acabó en chrome-error://chromewebdata/
```

Después, con la política y el filtro:

```
=== LA APP (política + Markdown.tsx) ===
  (ninguna línea, en los dos motores)
  imágenes pintadas: solo la data: embebida
  enlaces con destino: solo http(s), y el clic llama a open_external
=== SOLO LA POLÍTICA (renderizador de antes) ===
  la imagen: «Refused to load … img-src»
  el javascript: EJECUTA, y su fetch muere en connect-src
=== SOLO EL FILTRO (sin política) ===
  (ninguna línea)
=== CONTROL NEGATIVO (sin política y sin filtro) ===
  los mismos vectores de la línea base, todos
=== CONTROLES que deben pasar ===
  el artefacto sigue vivo (contó sus filas) · el recargado en caliente conectó
```

Cuatro cosas se leen ahí:

1. **Las dos capas se sostienen solas.** La política sin el filtro para la imagen
   y mata el `fetch` del `javascript:`; el filtro sin la política no deja ni que
   se pinte. Que las dos estén no es cinturón y tirantes: cada una cubre lo que la
   otra no.
2. **El `javascript:` sigue ejecutando si algo lo pinta.** La política no lo
   cierra porque `script-src-elem` tiene que dejar correr al contenedor de
   artefactos, que **hereda esta política por ser un `srcdoc`**. Su red está
   muerta, pero `window.__TAURI_INTERNALS__` no es red: alcanzaría los 89 comandos
   de `lib.rs`, que no pasan por ninguna capability. Lo que lo cierra es el filtro,
   y por eso el filtro no es opcional.
3. **La navegación no la gobierna ninguna política.** Un `http:` en un enlace se
   llevaba la ventana entera. Lo cierra `packages/ui/src/Markdown.tsx` mandando el destino al
   navegador del sistema, no una directiva.
4. **Cerrar la ventana no rompió el contenedor**, y esa mitad hacía falta: con
   `script-src 'self'` a secas el runtime del artefacto no arrancaba —*«Refused to
   execute a script…»*— y la vista previa se quedaba muerta en los dos motores.

## Lo que esta prueba **no** cubre

- **La app no se levantó.** Esto corre sobre el servidor de desarrollo con la
  política de la ventana; lo que no ejercita es el webview de Tauri: que el IPC
  siga vivo con `connect-src` cerrado y que `open_external` reciba el destino.
  Sí se comprobó que el **paquete de producción** carga bajo la política sin una
  sola violación en los dos motores.
- **La escalada al puente se midió con un doble.** `__TAURI_INTERNALS__` es un
  objeto puesto por el laboratorio donde Tauri pone el suyo. Que ahí esté el
  puente real lo dice `tauri/scripts/core.js`; que detrás no haya permisos lo
  dice `capabilities/default.json`. Correrlo contra la app es lo que falta.
- **Un enlace legítimo que la persona pulsa sigue sacando lo que lleve en la
  URL.** Se abre en su navegador, fuera de la app, y no queda en
  `publications.jsonl`. Es un límite y lo decide un acto de la persona, no el
  documento.
- **`data:` en un enlace lo para el navegador, no nosotros.** *«Not allowed to
  navigate top frame to data URL»*, en los dos motores. El filtro también lo
  rechaza, así que no dependemos de eso — pero la corrida no lo demuestra.

---
