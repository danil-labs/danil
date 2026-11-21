# @danil/feature-files

Área de exploración de archivos, visualización de código y estado git del proyecto.

## Qué hace

- **Árbol de directorios (`FileTree`):** Navegación jerárquica bajo demanda por carpetas con indicador visual de estado git (modificado, nuevo, borrado, sin rastrear, ignorado).
- **Visor de archivos (`FileViewer`):** Visualización de contenido de archivos con migas de pan (breadcrumbs), tamaño en bytes y numeración de líneas.
- **Tope seguro para archivos grandes (B-019):** Si un archivo supera los 5 MB, muestra una advertencia de seguridad y carga una vista preliminar segura para proteger el rendimiento de la interfaz contra bloqueos, ofreciendo la opción de cargar el contenido completo de manera controlada.
- **Diccionario compacto de iconos (B-020):** Mapeo ligero de extensiones y nombres de archivo a categorías semánticas (`FileIcon`), manteniéndose en menos de 400 líneas de código.
- **Gestión de errores:** Cualquier fallo al consultar el motor muestra un estado explícito de error con botón de reintento (`Reintentar`), nunca una lista o visor vacío.

## Qué consume y de qué contrato

Consume exclusivamente el cliente de motor `@danil/engine-client` mediante los siguientes comandos RPC1 definidos en `packages/engine-client/src/generated/commands/tree.ts`:

| Comando RPC1 | Propósito |
|---|---|
| `tree_files` | Lista los archivos del directorio raíz del árbol de trabajo. |
| `tree_folder` | Lista archivos y carpetas hijas de una ruta específica bajo demanda. |
| `tree_git_status` | Devuelve el estado git de los archivos modificados, añadidos o eliminados. |
| `tree_show` | Obtiene el contenido textual o metadatos de un archivo en disco. |
| `tree_write` | Sobrescribe el contenido de un archivo en disco. |
| `tree_patch` | Obtiene el diff unificado en formato patch del archivo modificado. |

No consume rutas OpenAPI HTTP directamente; toda manipulación de archivos y árbol de trabajo se realiza sobre el motor de la máquina.

## Editor de código

CodeMirror 6 no está presente en las dependencias actuales del workspace. Se proporciona un visor de solo lectura con `<pre>` y numeración de líneas.

## Pendiente

- Pendiente: Integrar el editor interactivo CodeMirror 6 cuando se añada `@danil/ui/code-editor` o la dependencia directa al workspace.
- Pendiente: Incorporar el comando RPC1 tipado `tree_read_part` con paginación binaria formal (`offset`, `length`, `total_size`, `encoding`) una vez disponible en el motor.
