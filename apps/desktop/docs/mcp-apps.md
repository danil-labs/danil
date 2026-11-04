# MCP Apps en el chat

Una MCP App es una vista HTML publicada por un servidor MCP junto a una herramienta.
Danil la muestra al terminar esa llamada, fuera del registro plegable de trabajo
y antes de la respuesta final del agente.

## Descubrimiento y conexión

El turno conserva servidor, herramienta, argumentos y resultado en `mcp_app`.
`has_mcp_app` descubre si hay metadatos de vista; `read_mcp_app` consulta la
herramienta y lee su recurso `ui://`, declarado en `_meta.ui.resourceUri`.
La conexión de la vista es independiente de la conexión del CLI.

Los servidores HTTP usan URL y cabeceras declaradas. Los stdio usan
`command`, `args` y `env`, con el cwd del workspace y el PATH preparado. La vista
no hereda automáticamente el OAuth que autenticó la conexión del CLI.

La vista común usa `AppBridge` y dos iframes: proxy y contenido, ambos aislados de
la navegación principal. Las llamadas de la vista pasan por `call_mcp_app_tool`;
solo se admiten herramientas cuya `_meta.ui.visibility` incluya `app`.

## Visores propios

| Recurso | Representación |
|---|---|
| `ui://excalidraw/mcp-app.html`, `create_view` | Lienzo local de Excalidraw y checkpoints del servidor |
| `ui://drawio/mcp-app.html` | XML de la llamada con el visor del plugin draw.io |
| Otros recursos | HTML del servidor dentro del proxy MCP |

Excalidraw se identifica por recurso y herramienta, aunque el servidor tenga otro
alias. Lee y guarda con `read_checkpoint` y `save_checkpoint`; el dibujo queda en
ese servidor. El componente React y sus fuentes viajan en el bundle.

El visor draw.io requiere el plugin activo; sus bibliotecas se sirven desde la
instalación privada. Resuelve las familias referidas por el XML y sus dependencias.
Las páginas comprimidas se expanden antes de esa resolución. Si falla, presenta
el error y la opción de abrir el documento afuera. La vista no conserva una
conexión MCP para editar el XML ni crea por sí sola un archivo del proyecto.

## Límites

El contenido HTML común usa `sandbox="allow-scripts"` y CSP sin red:
`connect-src 'none'`, recursos gráficos y fuentes solo `data:`, sin formularios,
objetos, workers o marcos adicionales. Un CDN no puede cargar código en esa vista.
Las herramientas y lecturas de recursos pasan por el puente del host.

Los visores propios no usan el HTML remoto de esos recursos. Excalidraw sí conserva
su conexión para checkpoints. draw.io cierra la conexión tras leer la vista.
Las imágenes externas continúan bloqueadas.

Plegar el registro de trabajo no desmonta la vista. Desmontar la conversación
cierra el puente y las conexiones administradas según el visor. No se promete
que la sesión del agente autentique todos los servidores remotos de una MCP App.

## Implementación y validación

- El motor (`seldon-runtime`): recursos, conexiones y herramientas permitidas.
- `src/features/chat/McpAppView.tsx`: descubrimiento y representación.
- `src/features/chat/mcpAppProxy.ts`: sandbox y CSP.
- `src/features/chat/ExcalidrawMcpCanvas.tsx`: checkpoints.
- `src/features/chat/DrawioMcpCanvas.tsx`: XML y plugin.
- `scripts/guards/mount-frontend.mjs`: montaje con IPC simulado.

El montaje simulado no certifica el alojamiento ni la interacción en Tauri real.
El QA identifica servidor, plugin, plataforma y build de ventana y servicio.
