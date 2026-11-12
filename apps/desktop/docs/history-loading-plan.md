# Historial acotado en host, relay, escritorio y web

Estado: propuesta del 2026-10-28; la parte del cliente ya entró (#441 y
`history_request` en `features/machines/router.ts`), host y relay se confirman en su repo. Preparada a petición de la
persona; no es aceptación de arquitectura ni autorización de despliegue.
Base del cliente inspeccionada: `4cc7a618`. Lectores: responsables del motor,
Machines y clientes. Resultado esperado: cualquier conversación existente abre
y permite continuar aunque contenga resultados de herramientas mayores que un
marco del transporte.

## Evidencia y alcance

- La tarea `82yn5thq` existe, no está archivada y el host lee su conversación.
  `task open` falla con «Lo que pediste es demasiado grande para traerlo a la
  ventana de una vez»; operación `86171375-4a5a-47fb-834a-2175d38206fb`.
- Su `session.json`, observado sin modificarlo, contiene 22 registros y
  37,246,567 bytes. Un turno ocupa aproximadamente 14.92 MiB al serializarse
  compacto; prácticamente todo corresponde a `tools`.
- `src-tauri/crates/engine-protocol/src/lib.rs` fija `MAX_FRAME` en 16 MiB.
  `src-tauri/src/extracted/proxy.rs`, `read_history`, pide hasta 150 turnos.
- `src/features/machines/router.ts`, `remote`, responde `load_history` leyendo
  `load_session` completo: la web no conserva la paginación del IPC local.
- `src/features/chat/history.ts` conserva y concatena páginas ya leídas.
  `packages/fleet/src/slices.ts` limita la persistencia de caché, pero su mapa
  de rebanadas en memoria no tiene un presupuesto explícito de bytes.
- En el checkout local de `machines`, [mirror.ts de Machines](https://github.com/danil-labs/machines/blob/main/src/mirror.ts) limita cada valor a
  1,000,000 bytes, el total a 64,000,000 bytes y las entradas a 500. Un valor
  demasiado grande borra la copia anterior de esa petición. Estos valores son
  evidencia del checkout, no una comprobación de la versión desplegada.
- Los registros muestran desconexiones del relay; no está demostrado que el
  tamaño las cause. Investigar conectividad como un defecto separado.

No se ha medido una fuga de RAM ni agotamiento de memoria. El defecto
reproducido es de tamaño y carga de historial. Tampoco se atribuye todavía el
bloqueo del editor a una condición concreta del frontend.

## Invariantes

1. Conservar mensajes, orden, identidades, resultados, adjuntos, permisos y
   referencias de las conversaciones existentes. No resumir ni truncar el
   original para hacer que quepa.
2. El motor conserva la autoridad sobre los datos. El relay mantiene una copia
   de lectura acotada; su desalojo nunca elimina el original del host.
3. Leer o transformar para presentación no cambia el contexto nativo del
   proveedor ni su mecanismo de continuación.
4. Toda respuesta y evento tiene un presupuesto de bytes serializados. También
   se limita el elemento individual; contar turnos no garantiza el tamaño.
5. Un error de historial no cambia presencia, permisos ni estado de ejecución.
   No impide escribir cuando el estado autoritativo de la tarea lo permite.
6. Ningún cursor, referencia o caché puede cruzar cuenta, máquina, workspace o
   tarea. Una referencia de contenido no es una autorización para leerlo.

## Contrato propuesto

Negociar una capacidad nueva, nombre de trabajo `bounded_history_v1`, entre
host y clientes, y anunciar su soporte en el camino remoto. No usar
`push_stream_v1` como sustituto de la capacidad de historial. No modificar
unilateralmente `commands.json`, su hash ni las listas de comandos permitidos.
El primer entregable fija la extensión coordinada de RPC1 y del protocolo de
Machines, con versiones y detección de soporte independientes.

La API lógica, con nombres aún por cerrar en el contrato, ofrece:

| Operación | Solicitud | Respuesta |
|---|---|---|
| Estado de tarea | Identidad completa | Proveedor, permisos, ejecución y disponibilidad; sin historial pesado |
| Página de historial | Identidad, cursor opaco, máximo de bytes y elementos | Entradas de presentación, revisión, secuencia superior y cursores anterior/siguiente |
| Detalle de contenido | Identidad, referencia, revisión, cursor de fragmento | Fragmento acotado, tamaño total, integridad y siguiente cursor |
| Reanudación de eventos | Identidad, última secuencia confirmada | Cambios posteriores; o instrucción explícita de resincronización |

Cada entrada tiene ID estable, orden y referencias a contenido pesado. Mantener
la relación de `pieces` con herramientas por ID o por un mapa de índices
preservado; no quitar elementos del arreglo rompiendo índices. La proyección
incluye texto de conversación y metadatos ligeros. Resultados, imágenes, salidas
de comandos y texto excepcionalmente grande se sirven bajo demanda. Incluso el
texto o los metadatos de una sola entrada deben poder fragmentarse.

Cursores ligados a identidad, formato y revisión del historial. Durante append,
el recorrido anterior sigue un límite superior estable y los eventos traen lo
nuevo. Una reescritura devuelve `revision_changed`: releer y reconciliar por ID,
sin mezclar páginas de revisiones distintas ni perder el borrador. Un cursor
inválido produce un error acotado, nunca la sesión completa como alternativa.

Presupuestos iniciales propuestos, sujetos a medición y al menor límite de
toda la ruta: 512 KiB por respuesta completa, 128 KiB de contenido crudo por
fragmento y 64 KiB por lote de eventos. Contar bytes UTF-8 de la respuesta final,
incluyendo envoltura, escapes y codificación. El host impone un máximo aunque
el cliente pida más. La compresión es opcional y no sustituye límites sobre el
contenido descomprimido. Estos valores no son resultados de un benchmark.

## Cambios por componente

### Host: seldon-host / seldon-runtime

- Localizar primero el código vigente de almacenamiento, `service history`,
  `load_session`, stream y espejo. El checkout local consultado no contiene el
  runtime fuente; no se han validado sus rutas de implementación.
- Añadir una proyección ligera y un lector paginado con presupuesto de bytes,
  compartidos por IPC local, conector remoto y CLI. No serializar toda la sesión
  para después comprobar si la respuesta excede el límite.
- Para formatos heredados, construir un índice derivado de manera incremental,
  con lectura en streaming y memoria acotada. Evitar deserializar el JSON completo
  en cada apertura. Si el índice tarda, devolver progreso y estado de tarea por
  separado; no bloquear el envío detrás de una lectura larga.
- Guardar índices y contenido derivado fuera del original, con esquema,
  identificador de origen y publicación atómica. Detectar cambios concurrentes,
  invalidar resultados incompletos y reconstruirlos tras un fallo.
- Para nuevas escrituras, separar contenido pesado de la representación ligera
  mediante almacenamiento versionado y recuperable. Coordinar exportación,
  carry, borrado y recuperación para que ningún resultado quede huérfano.
- Acotar el stream vivo y su catch-up con las mismas reglas. Una herramienta
  grande no debe reaparecer entera en un evento y eludir la paginación.

### Relay y espejo: Machines

- Incorporar las operaciones versionadas a autorización, enrutamiento y espejo.
  Aplicar permisos existentes en cada página y fragmento; no aceptar rutas del
  sistema de archivos ni referencias como sustituto del control de acceso.
- Sustituir la sesión completa como unidad de caché nueva por índice ligero,
  páginas y fragmentos inmutables. Clave: cuenta/máquina/workspace/tarea,
  versión, revisión y cursor. Una respuesta tardía no reemplaza otra revisión.
- Preservar la última copia válida si una actualización excede el presupuesto.
  Marcar su antigüedad; no presentarla como estado vivo. No interpretar una
  página ausente como conversación vacía o eliminada.
- Mantener cuotas por entrada, máquina y cuenta, con desalojo verificable.
  La disponibilidad offline garantiza lo sincronizado dentro de esas cuotas;
  no promete conservar todo el historial de todas las tareas en el relay.
- Acotar concurrencia y bytes en vuelo. Frenar transferencias de historial ante
  consumidores lentos y priorizar mensajes, permisos y señales de vida. Una
  desconexión de transporte no cancela el trabajo del agente.
- Reanudar por secuencia e ID con deduplicación. Auditar qué mecanismos ya
  existen antes de añadir otro diario de eventos o una segunda cola de acciones.

### Cliente compartido, desktop y web

- Definir tipos y clasificación de operaciones en `packages/protocol`;
  adaptar identidad, rebanadas y caché en `packages/fleet` y
  transporte/capacidades en `packages/computers`.
- En `router.ts`, preservar cursor y presupuesto en la llamada remota; retirar
  la conversión de historial paginado a sesión completa cuando haya soporte.
  En `proxy.rs`, usar la capacidad negociada independientemente del push.
- Separar carga del estado de tarea, carga de mensajes y carga de detalles.
  Al fallar una página, mostrar «No se pudo cargar este tramo» con reintento,
  conservando mensajes ya vistos, borrador y capacidad de enviar autorizada.
- Enviar sin el historial requiere estado autoritativo suficiente para saber
  proveedor, permisos y máquina destino. Si ese estado falta, explicar ese
  bloqueo real; no inferirlo de una lista vacía ni de datos cacheados.
- Cargar herramientas e imágenes al expandirlas. Cancelar o ignorar respuestas
  de otra generación al cambiar de tarea, cuenta o workspace.
- Limitar cachés por bytes: páginas, detalles, hilos y rebanadas. Usar LRU con
  presupuesto global; el stream activo también debe estar acotado. No desalojar
  borradores ni permisos pendientes. Al subir, recuperar páginas descartadas
  manteniendo posición de lectura. Virtualizar DOM es un control adicional.
- Unificar comportamiento del escritorio local, escritorio remoto y navegador.
  Revisar consumidores móviles del protocolo sin asumir que usan el mismo
  componente de chat.

## Compatibilidad y conservación

Primera entrega: lector nuevo de datos heredados y caché derivada; ninguna
migración destructiva del `session.json`. Mantener IDs y semántica de orden.
La primera lectura puede indexar, pero no reescribe el archivo original.

| Combinación | Comportamiento esperado |
|---|---|
| Host/relay/cliente nuevos | Historial y detalles acotados, local y remoto |
| Cliente nuevo, host anterior | Camino anterior mientras quepa; error localizado y estado/editor independientes cuando sea posible. No prometer acceso completo a un host sin soporte |
| Host nuevo, cliente anterior | Conservar operaciones antiguas; la lectura heredada puede seguir limitada. Actualizar cliente para resolver sesiones grandes |
| Host nuevo, relay anterior | Desktop local usa la capacidad nueva; remoto informa falta de soporte y conserva copia válida. No volver a descargar la sesión gigante automáticamente |

El formato de escritura separado es una segunda entrega: exige compatibilidad
de lectura/exportación y decisión explícita sobre downgrade antes de activarlo.
Mientras tanto, mantener la escritura heredada y los índices derivados. Un
rollback del lector elimina o ignora sólo los derivados y deja las sesiones
originales utilizables por la versión previa dentro de sus límites conocidos.

## Secuencia de ejecución

| Paso | Entregable | Depende de |
|---|---|---|
| 1 | Contrato versionado, inventario de límites desplegados y fixture sintético que reproduce el fallo | — |
| 2 | Host: estado ligero, lectura heredada acotada, detalles por fragmentos y stream seguro | 1 |
| 3 | Relay: transporte, autorización, espejo paginado y cuotas | 1; validar integración con 2 |
| 4 | Paquetes compartidos y clientes: cursor remoto real, carga progresiva y editor independiente | 1; validación final con 2 y 3 |
| 5 | Pruebas integradas, mediciones y activación gradual de lecturas nuevas | 2, 3, 4 |
| 6 | Escrituras separadas y eventual migración optativa de almacenamiento | 5 y compatibilidad de downgrade resuelta |

Publicar primero soporte aditivo en relay y host; activar cliente mediante
capacidades cuando ambos estén disponibles. Verificar hashes y matriz de
versiones antes de cambiar el motor fijado. Integrar por `dev` y después `main`.
El despliegue web y una publicación desktop son acciones distintas; este plan
no autoriza ninguna de ellas ni reiniciar el host con tareas activas.

## Pruebas de aceptación y medición

Ejecutar en laboratorio aislado con fixtures sintéticos; no usar conversaciones
de producción como fixtures versionados. Registrar el fallo previo y repetir
las pruebas con el mismo límite de 16 MiB después del cambio.

1. Sesión de 35 MiB, una herramienta mayor de 16 MiB, una imagen grande y un
   texto individual mayor que una página: abrir el último mensaje y recuperar
   cada detalle completo. Verificar orden, integridad y correspondencia de IDs.
2. Preservación: hashes del archivo heredado antes/después idénticos; comparación
   semántica de todos los mensajes y detalles exportados; mismo proveedor y
   sesión nativa al continuar. No basta comparar sólo lo visible.
3. Camino local, remoto desde desktop y web por relay: ninguna respuesta o
   evento excede su presupuesto final, incluso con Unicode, escapes o base64.
4. Fallo de una página con host disponible: el historial anterior permanece y
   se puede enviar una vez sin duplicar, según permisos y estado reales.
5. Desconexión a mitad de carga, reconexión, append concurrente, reescritura y
   respuesta tardía de otra cuenta/tarea: sin huecos silenciosos ni duplicados.
6. Máquina offline: mostrar sólo copia disponible con antigüedad; explicar los
   detalles no sincronizados. La falta de una página no vacía la lista de tareas.
7. Interrumpir indexación y reconstruir; probar cambios del original durante
   indexación, disco lleno y caché corrupta sin alterar el historial original.
8. Probar todas las combinaciones de versiones de la tabla, revocación de
   acceso y acceso indebido a referencias de otra identidad.
9. Probar exportación/carry/archivo/borrado y continuación de sesiones con
   contenido separado antes de habilitar el nuevo formato de escritura.

Medir memoria residente del host y relay, heap del navegador, bytes en vuelo,
tiempo al primer mensaje y latencia de envío. Comparar sesiones sintéticas de
35 MiB y 350 MiB con el mismo viewport, página y caché: la memoria retenida por
la carga debe quedar dentro de presupuestos, sin crecer proporcionalmente al
historial total. Registrar pico y memoria estable, no sólo después del GC.
Fijar umbrales de latencia tras obtener una línea base; no inventar resultados.

Ejecutar `pnpm verify` del cliente cuando haya implementación; para host y
relay confirmar primero los comandos del checkout vigente. Los checks de este
documento son revisión de rutas y formato, no aceptación funcional.

## Decisiones pendientes antes de implementar

- Localizar y fijar commits vigentes del runtime y del relay desplegado.
- Aprobar el contrato aditivo y su negociación en cada transporte, manteniendo
  intacto el contrato congelado hasta una integración coordinada.
- Calibrar presupuestos globales de caché, cola y concurrencia por plataforma.
- Acordar alcance offline dentro de cuotas y soporte de downgrade de escrituras.

## Referentes revisados

Consulta de fuentes primarias, 2026-10-28. Se toman patrones, no compatibilidad
directa ni una garantía de que esos productos resuelvan este caso de tamaño.

- [Happier: arquitectura](https://docs.happier.dev/self-hosting/how-it-works):
  ejecución en máquina, relay, recuperación HTTP y secuencias de mensajes.
- [Happier: rutas de mensajes, commit a2372552](https://github.com/happier-dev/happier/blob/a23725528108c941778398ce0a5f3a0d1190f4a5/apps/server/sources/app/api/routes/session/registerSessionMessageRoutes.ts):
  cursores `beforeSeq`/`afterSeq`, `hasMore` y límites por cantidad. El código
  revisado no acredita un límite por bytes de esas páginas.
- [Coder: networking](https://coder.com/docs/admin/networking) y
  [terminal web](https://github.com/coder/coder/blob/main/docs/user-guides/workspace-access/web-terminal.md):
  relay DERP y reconexión de sesiones desde navegador.
- [MeshCentral: meshrelay.js](https://github.com/Ylianst/MeshCentral/blob/master/meshrelay.js):
  pausa del origen y reanudación al terminar el envío al destino.
