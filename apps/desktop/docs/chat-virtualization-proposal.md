# Virtualización y recuperación del historial del chat

Estado: prototipo integrado en `feat/chat-virtualization`, pendiente de QA real y
sin merge. Actualizado 2026-10-31 sobre `origin/dev` `943b3c61`. Alcance ampliado
por la persona: desktop, web, Expo nativo y web de teléfono. Lectores:
responsables de frontend, arquitectura y QA.

## Causa demostrada

`history.revision` (`bounded_history_v1`) es un hash de `session.json` entero:
medido en un motor de laboratorio, cambia con el título, `updated_at`, editar un
turno o agregar uno. El cliente la leía como «se reescribió»: cada relectura de
cola tiraba las páginas antiguas y `prependHistory` rechazaba la página en vuelo.
Con la función base, 388 turnos y un append por paso, la ventana no baja del
turno 289 y se reinicia 200 veces. El motor fijado en el lock (0.2.73 `4e10efc`)
no ofrece esa capacidad; los hosts con motores posteriores sí. La misma lectura
explica `chat.history.error` al abrir contenido largo en tareas activas: su
referencia lleva la revisión del archivo. La recuperación por relay y los
archivados no se reprodujeron en ventana.

## Qué cambia

- `packages/chat/src/history.ts`: continuidad por turnos, no por `revision`. La
  página anterior se pide con `before = start + 1` y el turno solapado prueba la
  unión. `HistoryPager` hace una petición por tarea, reintenta choques con una
  escritura y deja un fallo visible. Desktop, web, Expo y teléfono usan esta política.
- Presupuesto de 2 MiB: leyendo lejos, la ventana se separa de la cola y una cola
  nueva solo actualiza el total. «Volver a los mensajes recientes» recarga la
  cola; no hay cursor `after`. Lo pendiente sale de la última cola leída, no de la ventana.
- `packages/chat/src/historyDetail.ts`: tras cambiar el archivo, la referencia se
  vuelve a pedir comprobando el `id` del turno; sin `id` no se expande.
- `VirtualThread.tsx`: TanStack (`@tanstack/solid-virtual` 3.13.51, core 3.19.9)
  decide rango y mide. `seguirElFondo` es el único escritor de `scrollTop`; las
  escrituras de TanStack y de la búsqueda pasan por `hilo.escribir`. Las filas van
  en flujo entre márgenes y se insertan sin mover las que siguen: el `For` de Solid
  las reemplaza al saltar lejos y eso colapsa la selección.
- Identidad: `clave` por turno y pieza (`transcripcion`), alias vivo → cerrado en
  `threadRows.ts`. La lectura es clave + desfase, en memoria.
- Retención: foco, selección, gesto, visual expandido, detalle abierto y fila viva.
  Un iframe que sale de la vista se desmonta y puede reiniciarse: un visual
  guarda abierto/cerrado y alto, no su estado interno.
- `localStorage["terminus.chat.thread-chunks"]` vuelve al hilo por tramos para
  comparar; es una marca de laboratorio y debe retirarse con ese camino.
- Expo: conserva `FlatList`. Pasa a `history_request` con la forma exacta de la web,
  carga páginas al llegar al extremo, abre `history_refs` con un toque y no descarta
  una respuesta si no puede comprobar su pregunta (`question_unverified`).

## Evidencia

Chromium headless (`tests/helpers/chat-lab.mjs`): 20 filas como máximo con 10,000
bloques, contra 223 por tramos; heap 18 MB contra 72 MB tras diez ciclos; ancla
a 0.47 px o menos con prepend y append concurrentes, sin remontar el nodo.
Ventana WebKitGTK en Linux, QA con motor `58a9f7d`: primer mensaje en 31-34 s en
tarea activa, la base no llega en 120 s; selección, foco, contenido largo, visual
expandido y lectura guardada pasan sobre `08f2732e`. Un motor congelado se
comporta igual que la base. Web de escritorio con relay simulado y web de teléfono
en Chromium móvil pasan, hasta 1,500 turnos y más de 2 MiB en el teléfono. Sin comprobar: Expo nativo, lector de pantalla,
Windows y macOS, y cambio de pestaña o panel con carga en vuelo.

## Límites conocidos

- Una reescritura de turnos antiguos que deje igual el turno frontera no se
  detecta: se vería texto viejo, no una unión equivocada.
- Una pregunta pendiente a más de 50 turnos del final sin proceso vivo no se ve en
  Expo. Una señal aditiva de pendientes en `kind:"state"` la resolvería; no es bloqueante.
- `questions` y `answers` enviados a `history_refs` no se expanden para calcular lo pendiente.
- La búsqueda cubre lo cargado. No hay salto directo a una página desalojada.
- Un mensaje de más de 8 KB llega por referencia: su texto se trae al montar la
  fila y no ofrece el botón de copiar.
- Las medidas no se invalidan al cambiar de ancho: una fila fuera de vista conserva su
  alto anterior hasta montarse y la lectura la sostiene el ancla.

La evaluación original sigue abajo como antecedente; donde difiera, manda lo anterior.

## Evaluación original

### Evidencia del cliente

| Área | Comportamiento observado | Implicación |
|---|---|---|
| `src/features/chat/threadWindow.ts:6` | Tramos de 10 bloques; abre los dos últimos | Reduce montaje inicial, sin una ventana móvil continua |
| `src/features/chat/Chat.tsx:1661` | El inicio montado retrocede al subir; se libera al volver al fondo tras 30 s | Mientras se lee hacia arriba quedan montados los tramos hasta el final |
| `src/features/chat/history.ts:30` | Para v1 recorta a 2 MiB de serialización de turnos, salvo un turno individual | Es presupuesto de datos serializados, no límite estricto de heap ni de DOM |
| `src/app/App.tsx:1329` | Una página pendiente se descarta si cambió el objeto cargado; errores devuelven `null` | Riesgo de detener la carga sin aviso; no demuestra la causa del caso reportado |
| `src/features/chat/paste.ts:193` | Control propio de fondo, ancla, prepend y gestos | No activar dos controladores escribiendo el mismo `scrollTop` |
| `src/features/chat/Chat.tsx:369` | Bloques derivados sin clave estable propia; incluyen índice `i` | Hace falta identidad de presentación independiente del índice y del texto |
| `src/features/chat/ThreadSearch.tsx:15` | Búsqueda sobre mensajes cargados y salto por índice de bloque | Debe montar el resultado antes de medir y pintar sus rangos |
| `src/features/chat/ChatVisual.tsx:80` | Desmontar libera recursos; el iframe tiene estado propio | Virtualizar puede reiniciar una interacción al volver a montar |
| `src/features/chat/MonotonicHeight.tsx:26` | Evita encogimientos transitorios del markdown vivo | Mantener inicialmente; medición dinámica no prueba equivalencia visual |
| `src-tauri/src/extracted/proxy.rs:920` y `src/features/machines/router.ts:413` | Hay caminos negociados de historial y compatibilidad heredada | Probar transporte local y remoto; no asumir capacidades del host instalado |

La lectura por CLI realizada durante esta investigación encontró 388 registros
guardados en la tarea reportada y permitió recuperar el primer mensaje. Esa
observación no reproduce el bloqueo de la ventana ni acredita recorrerla completa.
Antes de corregirlo, reproducir en laboratorio el punto donde deja de paginar.

## Biblioteca comprobada

Consulta de fuentes primarias y registro npm: 2026-10-31.

- [`@tanstack/solid-virtual` 3.13.51](https://registry.npmjs.org/@tanstack/solid-virtual/3.13.51):
  licencia MIT, peer `solid-js ^1.3.0`, dependencia exacta de
  `@tanstack/virtual-core` 3.19.9. Compatible por rango con nuestro Solid `^1.9.17`;
  esto no acredita compatibilidad de comportamiento.
- [Adaptador Solid](https://tanstack.com/virtual/latest/docs/framework/solid/solid-virtual):
  ofrece `createVirtualizer` sobre un elemento HTML. No requiere reescribir el chat en React.
- [Guía de chat](https://tanstack.com/virtual/latest/docs/chat): documenta
  `anchorTo: 'end'`, `followOnAppend`, `scrollEndThreshold`, claves estables y
  medición de filas durante streaming. La carga de red queda fuera del virtualizador.
- [API del núcleo](https://tanstack.com/virtual/latest/docs/api/virtualizer):
  incluye `measureElement`, `scrollToIndex`, `scrollToEnd`, `isAtEnd`, `overscan`
  y personalización de rango. Verificar límites de scroll animado con alturas dinámicas.

Se descargaron e inspeccionaron en memoria los tarballs publicados, sin instalar
dependencias: los tipos de core 3.19.9 incluyen las opciones de chat anteriores.
El adaptador publicado reconcilia su lista interna por `index`; esto exige
comprobar identidad de DOM en Solid, además de definir `getItemKey`. No se afirma
que esa reconciliación sea un defecto. Fijar 3.13.51 en el prototipo y revisar el
lockfile, sin confundir la versión del adaptador con la del núcleo.

## Diseño propuesto

### 1. Identidades y estado fuera de las filas

Crear una proyección de filas con `key`, clase de bloque y referencias a mensajes.
La clave combina identidad completa de tarea, registro/turno y pieza o herramienta;
no usar índice relativo de página, contenido del texto ni identidad del objeto
reconstruido. Un turno puede producir varios bloques: `turn.id` solo no basta.
Para datos heredados sin ID, usar ordinal absoluto del registro y ordinal de pieza
dentro de una revisión. Si no hay identidad verificable, invalidar restauración
de esa revisión de forma explícita; no unir por texto coincidente.
Antes del prototipo, confirmar qué significa `revision` en el host objetivo:
si cambia con cada append, no sirve por sí sola como identidad de reescritura.
En ese caso, validar continuidad por registros/solapamiento o acordar una señal
aditiva con el motor; no asumir que todas las revisiones son equivalentes.

Conservar la identidad del bloque vivo al cerrarse si sigue siendo el mismo
bloque lógico; cuando plegar fusiona bloques, definir un mapa al bloque
superviviente. Guardar lectura como clave + desfase y resolverla al recargar la
página que la contiene. La lectura actual es estado en memoria del cliente;
no cambiar el formato de la conversación ni nombres serializados del motor.

Extraer estado de expansión, respuestas en curso y foco fuera de las filas
desmontables cuando se deba conservar. Auditar también diffs y MCP Apps.
Una fila enfocada o con selección activa no debe desmontarse durante el gesto.

### 2. Geometría con un solo controlador

Introducir `src/features/chat/VirtualThread.tsx` como adaptador de vista,
manteniendo los renderizadores actuales. Virtualizar bloques, no turnos enteros:
un turno puede contener una secuencia extensa de mensajes y herramientas.

Configurar orden cronológico normal, `getItemKey`, medición con `measureElement`
y contenedor de altura disponible. Empezar con `anchorTo: 'end'`, seguimiento
condicionado a intención de lectura y `overscan` de 6 filas; éste es un valor de
experimento, no un presupuesto aprobado. Estimar alturas por clase de bloque y
registrar medidas por clave y ancho. Invalidarlas al cambiar ancho o tipografía.

Sustituir en el camino nuevo los tramos, observador superior y compensaciones de
`seguirElFondo`. Conservar la detección de intención de usuario, scroll interno,
selección y botón de novedades mediante una interfaz de navegación común.
TanStack controla la geometría; el código de intención no corrige el mismo
desplazamiento de forma adicional. Mantener `AltoMonotono` hasta probar que
retirarlo no causa regresiones. Ajustar la altura útil al compositor y al teclado.
No usar animación suave para el seguimiento continuo durante streaming.

### 3. Historial recuperable en ambos sentidos

Mantener paginación, caché y errores en un controlador fuera del virtualizador.
Al acercarse al inicio pedir una página anterior, con una petición activa por
dirección/tarea y deduplicación por identidad. Un append compatible no debe
invalidar automáticamente una página anterior pendiente: reconciliar revisión,
solapamiento e identidades. Una reescritura sí invalida las páginas afectadas.

Al desalojar datos recientes para leer antiguos, mostrar ese límite y ofrecer
recuperación hacia adelante. El contrato leído tiene `before`, sin cursor
simétrico `after`: en la primera entrega, «Volver a lo reciente» recupera la cola
por la ruta existente. No prometer recorrido incremental hacia adelante tras el
desalojo hasta validar un mecanismo con ese contrato o acordar una extensión
con el motor. No inventar comandos ni modificar `commands.json`.
Recargar la cola puede sustituir el tramo antiguo; regresar después a esa ancla
puede exigir paginar otra vez. No hay todavía un localizador arbitrario de
mensajes definido para garantizar un salto directo a una página desalojada.

Error de página: estado visible con reintento, sin vaciar lo ya cargado ni perder
borrador o permisos. Si la respuesta llega tras cambiar tarea, workspace, cuenta
o generación, ignorarla. Una página fallida no indica fin del historial.

Acotar por separado datos serializados, proyección, medidas, detalles e iframes.
Un DOM pequeño no reduce el trabajo de `bloques()` o la búsqueda sobre todos los
datos retenidos. Perfilar ambos antes de añadir memoización o índices nuevos.
No conservar metadatos de toda la conversación sin presupuesto sólo para simular
una barra de scroll global: el primer alcance representa el tramo cargado y sus
límites. Saltar a cualquier mensaje no cargado requiere localizarlo en los datos.

### 4. Búsqueda, riel y contenido interactivo

Cambiar búsqueda y riel a claves y mapa clave/índice. Usar `scrollToIndex`, esperar
montaje y medición del destino y luego pintar el rango de texto; evitar un segundo
salto por cada medida. La búsqueda sigue cubriendo el historial cargado. Buscar
en toda la conversación es otro alcance y exige un índice/servicio de búsqueda.

Los visuales expandidos y filas con interacción activa se retienen mediante un
rango adicional mientras se usan. Considerar activa una fila con modal abierto,
foco dentro, gesto de puntero/selección en curso o formulario sin confirmar;
liberar la retención al terminar esas condiciones. No detectar actividad dentro
de un iframe mediante acceso a su DOM: conservar al menos el expandido y el
foco observable, y definir el caso no observable antes de activar esa fila.
Definir un presupuesto finito de retención
compatible con `VisualBudget`: si una nueva interacción excede la cuota, ofrecer
abrir fuera del hilo o cerrar otra, sin destruir silenciosamente una sesión.
Al terminar la interacción, una fila fuera de pantalla puede desmontarse; su
estado de UI recuperable se conserva fuera del componente. Un iframe genérico
no ofrece serialización de estado: documentar su posible reinicio al remontar.
Si preservar ese estado resulta requisito, resolver su ciclo de vida antes de
activar virtualización para esas filas; no prometer persistencia transparente.

## Alternativas y decisión

| Alternativa | Ventaja | Costo o límite | Evaluación |
|---|---|---|---|
| Corregir sólo la paginación actual | Cambio menor; atiende errores y concurrencia | El DOM sigue creciendo al recorrer hacia arriba | Entrega inicial útil |
| Ventana propia en ambos sentidos | Conserva controlador actual | Mantener medidas, espaciadores, anclas y desalojos propios | Mayor carga de mantenimiento |
| TanStack con adaptador Solid | Geometría especializada y APIs de chat ya publicadas | Identidades, scroll e interactividad exigen integración | Opción preferida para prototipo |

## Entregas y revisión

1. Reproducir el atasco con fixtures sintéticos; medir línea base y corregir
   reintento/concurrencia de páginas independientemente de la biblioteca.
2. Preparar proyección con claves estables y probar transición vivo/cerrado,
   prepend, revisiones y restauración de lectura. Revisar con `architect` antes
   de implementar cambios de concurrencia o contratos.
3. Prototipo de `VirtualThread` con dependencia fijada, renderizadores reales,
   búsqueda/riel adaptados y un solo controlador. Comparar contra el camino actual
   mediante selector interno de laboratorio, no una opción de producto.
4. Revisar ciclo de vida de visuales, controles y accesibilidad con `design`;
   `qa` verifica la ventana real y transportes. `tech-lead` integra sólo si los
   criterios siguientes se cumplen. Retirar el camino anterior y sus pruebas de
   tramos cuando la sustitución esté validada; conservar pruebas de comportamiento.

La propuesta no inicia tareas de esos encargados. Trabajo a `dev` y después
`main`; la activación web y una publicación desktop requieren sus procesos
correspondientes. La preparación de esta propuesta no autoriza publicar desktop.

## Pruebas y criterios de aceptación

Fixtures sintéticos con IDs deterministas, alturas variadas, markdown, imágenes
tardías, herramientas plegables y visuales; nunca conversaciones privadas
versionadas. Separar prueba de DOM con datos precargados de prueba de páginas:
el recorte de 2 MiB no debe ocultar crecimiento del virtualizador.

| Recorrido | Comprobación necesaria |
|---|---|
| Abrir y recorrer 100, 1,000 y 10,000 bloques | Mismo viewport; DOM proporcional a filas visibles + overscan + retenidas, sin crecer con distancia recorrida |
| Prepend con append y cierre concurrentes | Cada ID esperado aparece una vez; página pendiente se integra o reintenta; ancla conserva clave y desfase |
| Superar 2 MiB y desalojar extremos | Recuperar comienzo y cola; límites explícitos; sin presentar ausencias como fin o conversación vacía |
| Error, timeout, desconexión y reescritura | Reintento visible; sin mezclar revisiones; editor/borrador preservados según estado autorizado |
| Streaming al fondo y leyendo arriba | Seguir sólo al fondo; ninguna llegada arrastra a quien se soltó; probar cierre y plegado de trabajo |
| Imagen/visual tardío y cambio de ancho | Mantener lectura al medir/refluir; sin ciclos de ResizeObserver ni saltos al minimizar/restaurar |
| Buscar y saltar mediante el riel | Destino inicialmente desmontado se monta, mide y resalta; selección sigue identificando el mismo mensaje tras prepend |
| Visual expandido, MCP App, foco y selección | Interacción activa no se destruye; cuotas y liberación observables; conservar respuestas y expansión al remontar |
| Cambiar pestaña, panel, tarea o cuenta durante carga | Recuperar lectura de su tarea; ninguna respuesta tardía ni medida llega a otro ámbito |
| Teclado y accesibilidad | Tabulador, lector de pantalla y selección/copia funcionan; orden cronológico y anuncios no se repiten con cada remount |

Propuesta de umbral geométrico: con layout estabilizado, mismo ancla con desviación
máxima de 2 CSS px tras prepend o cambio de tamaño por encima. Instrumentar
también cuadros intermedios para detectar saltos que se corrigen después; un
resultado final correcto no basta. No sustituir esta prueba con mocks de layout.

Registrar apertura p50/p95, tiempo por delta, cuadros largos, nodos montados,
heap retenido, medidas retenidas, caché y reservas de visuales. Repetir diez
recorridos completos y cambios de tarea con fixtures y viewport idénticos, tras
calentamiento, anotando navegador, plataforma y método de GC cuando exista.
Aceptar si no hay acumulación monotónica de nodos, listeners, medidas de tareas
cerradas o reservas; fijar presupuestos de heap y latencia con la línea base
antes de declarar mejora. No se atribuye una mejora porcentual sin medirla.

Unitarias: identidad/proyección y mezcla de páginas, ejecutando código de
producción. Integración: montaje Solid y continuidad de nodos durante prepend
y streaming, sin dar por válida una prueba basada sólo en igualdad de texto.
Layout: navegador con WebKit y Chromium; aceptación principal en ventana Tauri
macOS y cobertura de Windows/Linux antes de afirmar equivalencia multiplataforma.
Cubrir desktop local, desktop remoto y web con relay de laboratorio; no tocar
datos del host de producción. Expo conserva su verificación separada con FlatList.

## Validación de esta evaluación

- Pasan: 9 pruebas existentes, ejecutadas con
  `node --test apps/desktop/tests/unit/thread-window.test.ts apps/desktop/tests/unit/push-history.test.ts`.
  Acreditan funciones actuales de tramos y mezcla de páginas, no la migración.
- Comprobados: metadatos npm y opciones en tarballs publicados, rutas citadas y
  revisión estática del código anterior. No se instaló TanStack ni cambió runtime.
- Revisión de lectura independiente: sin contradicciones importantes contra los
  archivos consultados. Se aclararon semántica pendiente de revisión, condiciones
  de retención y limitación al regresar desde la cola a una página desalojada.
- Sin comprobar: reproducción en ventana, integración Solid con TanStack,
  rendimiento, accesibilidad, plataformas y transportes de la matriz propuesta.
- Para la implementación, completar `pnpm verify` local y los recorridos reales
  de QA. No se ejecutó esa cadena para este cambio exclusivamente documental.
