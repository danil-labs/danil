# Inventario · packages/features/code

Fase 1 del plan front-move (tarea 1.4). Qué es de quién. No mueve código.

La feature es el árbol, el visor y los cambios de una tarea (en `03-structure.md` el nombre de destino es `files`; esta fase no renombra el paquete). `se queda` = sigue en `packages/features/code` en `components/`, `screens/`, `model/` o `queries/`. Ningún archivo de aquí llama a `/v1/computers`, appv2, Supabase ni `legacy-desktop-auth`. Lo que habla con la red usa `invoke` de `engine-client` (comandos `tree_*`, `kn_*`, `typst_live_*`, `site_*`, `list_task_trees`, `list_integrations`, `open_external`). Esos `invoke` que hoy están en componentes y pantallas pasan a `queries.ts` en la fase 2.3; el archivo se queda.

| Archivo | Exports | Clase | Destino | Motivo |
|---|---|---|---|---|
| src/components/Changes.tsx | Cambios, SelectorDeDisposicion, CuerpoDeArchivo | propio | se queda | Lo importan `FileViewer.tsx:39` y `TaskFiles.tsx:22` (grep). Pinta el diff que le pasan (`model/diff`); no llama a `invoke` ni a otra feature. |
| src/components/Code.tsx | default | propio | se queda | Lo importa `TaskFiles.tsx:23`. `invoke` de engine-client: `list_task_trees` (64), `watch_task_tree` (109), `unwatch_task_tree` (114), más `Channel` de Tauri. `machineOf` sale de machines (línea 8). Las llamadas pasan a `queries.ts`. |
| src/components/CodeEditor.tsx | calentar, MarcaDelEditor, default | propio | se queda | Lo carga `editorLoad.ts:4` (`import("../components/CodeEditor")`). CodeMirror; no llama a `invoke`. Lo usan solo el visor y el calentado del editor. |
| src/components/FileIcon.tsx | IconoDeArchivo | ui | packages/ui/src/FileIcon.tsx | Icono de archivo reutilizado: `FileTree.tsx:31`, `TaskFiles.tsx:27`, `FileViewer.tsx:46` y `projects/src/screens/Tabs.tsx:26`. No llama a la red. `temaPintado` viene de `apps/desktop/src/lib/theme` y sube a ui con el componente. |
| src/components/FileTree.tsx | Tipo, default | propio | se queda | Lo cargan `FileTreeLazy.tsx:3` y `TaskPreview.tsx:3`. `invoke`: `preview_tree_files`, `tree_files`, `kn_status`, `tree_git_status`, `tree_summary`, `preview_tree_folder`, `tree_folder`, `tree_create_file`, `tree_create_folder`, `tree_rename`, `tree_delete`. `machineOf` de machines (línea 2). Las llamadas pasan a `queries.ts`. |
| src/components/FileTreeLazy.tsx | default | propio | se queda | Lo importan `Code.tsx:12` y `TaskPreview.tsx:4`. Solo parte el chunk de `FileTree`; no llama a la red ni a otra feature. |
| src/components/KnCloud.tsx | Descarga, default | propio | se queda | Lo importa `Code.tsx:13`. `invoke` `kn_cloud_state` (47) y `kn_cloud_start` (62); evento `kn-cloud` por `serviceEvents`. `machineOf` de machines (línea 3). Es RPC del motor para un proyecto kn, no un sistema viejo. Las llamadas pasan a `queries.ts`. |
| src/components/KnIntegrate.tsx | default | propio | se queda | Lo importa `TaskFiles.tsx:24`. `invoke` `kn_pending` (49, 79), `kn_finish` (63) y `kn_update` (78). `machineOf` de machines (línea 3). Motor actual. Las llamadas pasan a `queries.ts`. |
| src/components/PagePreview.tsx | direccionDePagina, default | propio | se queda | Lo importa `FileViewer.tsx:48`. `convertFileSrc` de Tauri (esquema `terminus-page`) es de host. El sandbox lo toma de artifacts línea 2 (`SANDBOX_ARTEFACTO`): esa constante sube a ui. El marco del `.html` de la tarea se queda. |
| src/components/TaskPreview.tsx | default, ARBOL_DE_VISTA_PREVIA | propio | se queda | Lo importa `TaskFiles.tsx:25`. Vista previa del commit base: monta `FileTreeLazy` y no llama a `invoke` ni a otra feature. |
| src/components/TypstExportPreview.tsx | default | propio | se queda | Lazy desde `FileViewer.tsx:74`. `invoke` `tree_typst_export` (52) y `tree_show` (64). `machineOf` de machines (línea 9). El PDF de viewers (línea 15) entra como slot. Las llamadas pasan a `queries.ts`. |
| src/components/TypstPreview.tsx | default | propio | se queda | Lazy desde `FileViewer.tsx:73`. `invoke` `tree_typst_export` (198) y `tree_open_external` (216). `machineOf` de machines (línea 16). `IconButton` y `clampZoom` de viewers (20, 21) suben a ui. Las llamadas pasan a `queries.ts`. |
| src/components/WorkdirIcon.tsx | workdirKindLabel, default | ui | packages/ui/src/WorkdirIcon.tsx | Icono de carpeta reutilizado: barril `index.ts:1`; `settings/.../ManageProjects.tsx:18`; `projects/.../Projects.tsx:19`, `ProjectView.tsx:39`, `FolderChip.tsx:4`; `chat/.../TaskLocation.tsx:5`. No llama a la red. |
| src/index.ts | WorkdirIcon | propio | se queda | Entrada pública de la feature. El único importador es `chat/.../TaskLocation.tsx:5`, y solo por el icono, que pasa a ui. grep no encuentra otro import de `features/code/src` ni de `code/src`. El barril se queda y deja de reexportar el icono. |
| src/model.ts | Linea, Hunk, ArchivoDiff, comoDiff, parsearDiff, saltoEntre, Tramo, PARECIDO_MINIMO, tramosCambiados, marcarLineas, Fila, filasDosPaneles, cargarEditor, calentarEditor, precargarEditor, frasesDelEditor, RESALTADO, TEMA, Dibujo, DIBUJOS, EN_CLARO, POR_NOMBRE, POR_EXTENSION, iconoDe, sangriaDe, nombreDeLenguaje, gramaticaDe, gramaticaLista, MUESTRA, Cambio, Resumen, Carpeta, Nodo, construir, filtrar, rutasDeCarpetas, EstadoGit, MarcaLocal, EstadoLocal, CambioKn, localesDeGit, localesDeKn, estadoLocal, esTransitorio, ESPERAS, LENTA_TRAS, Lector, crearLector, Lectura, siguienteLista, typst, esTypst, llevaVistaTypst, WorkdirIconKind, workdirIconKind, esDeCodigo | propio | se queda | Barril `export *` de `model/`. grep no encuentra import de `src/model` ni de `src/model.ts` (sí de `model/workdirKind` y del resto). Se queda: es el `model.ts` de la feature. Lo que sube a ui (`file-icons`, `icons`, `workdirKind`) sale del barril. |
| src/model/diff.ts | Linea, Hunk, ArchivoDiff, comoDiff, parsearDiff, saltoEntre, Tramo, PARECIDO_MINIMO, tramosCambiados, marcarLineas, Fila, filasDosPaneles | propio | se queda | Lo importan `Changes.tsx:19` y `FileViewer.tsx:38` (y el barril). Parseo de patch; no llama a la red. `chat/.../DiffBlock.tsx` solo lo nombra en un comentario: no lo importa. |
| src/model/editorLoad.ts | cargarEditor, calentarEditor, precargarEditor | propio | se queda | Lo importan `Code.tsx:4` y `FileViewer.tsx:42`. Baja el editor y las gramáticas; no llama a `invoke`. |
| src/model/editorPhrases.ts | frasesDelEditor | propio | se queda | Lo importa `CodeEditor.tsx:47`. Frases de CodeMirror vía `apps/desktop/src/lib/i18n` (sube a ui/lib). No llama a la red. |
| src/model/editorTheme.ts | RESALTADO, TEMA | propio | se queda | Lo importa `CodeEditor.tsx:49`. Tema CodeMirror con tokens de `@theme`. grep: nadie fuera de la feature. No llama a la red. |
| src/model/file-icons.ts | Dibujo, DIBUJOS, EN_CLARO, POR_NOMBRE, POR_EXTENSION | ui | packages/ui/src/file-icons.ts | Catálogo que pintan `icons.ts:3` y `FileIcon.tsx:2`. Lo genera `apps/desktop/scripts/icons.mjs` (material-icon-theme). Va con `FileIcon`, que projects también usa. No llama a la red. La cadena supabase es el nombre de un icono, no un cliente. |
| src/model/icons.ts | iconoDe | lib | packages/ui/src/lib/icons.ts | Función pura ruta → id de icono. La usa `FileIcon.tsx:3`, y ese componente lo importa projects. No llama a la red. El test `apps/desktop/tests/unit/icons.test.ts` apunta a la ruta vieja `src/features/code/icons.ts`, que ya no existe. |
| src/model/indent.ts | sangriaDe | propio | se queda | Lo importan `CodeEditor.tsx:48` y `FileViewer.tsx:45`. Sangría del editor de esta feature. No llama a la red ni sale de la feature. |
| src/model/languages.ts | nombreDeLenguaje, gramaticaDe, gramaticaLista, MUESTRA | propio | se queda | Lo importan `CodeEditor.tsx:50`, `editorLoad.ts:2` y `FileViewer.tsx:44`. Gramáticas de `@codemirror/language-data` y `typstLanguage`. No llama a `invoke`. |
| src/model/tree.ts | Cambio, Resumen, Carpeta, Nodo, construir, filtrar, rutasDeCarpetas, EstadoGit, MarcaLocal, EstadoLocal, CambioKn, localesDeGit, localesDeKn, estadoLocal | propio | se queda | Lo importan `FileTree.tsx:59` y `localStatus.ts:9`. Tipos y armado del árbol (git y kn). No llama a la red. |
| src/model/treeLoader.ts | esTransitorio, ESPERAS, LENTA_TRAS, Lector, crearLector | propio | se queda | Lo importa `FileTree.tsx:34`. Reintento de las lecturas del árbol. No llama a `invoke` ni a otra feature. El test unitario sigue en la ruta vieja `src/features/code/treeLoader.ts`. |
| src/model/trees.ts | Lectura, siguienteLista | propio | se queda | Lo importa `Code.tsx:14`. Qué lista queda tras `list_task_trees`. No llama a la red. |
| src/model/typstLanguage.ts | typst | propio | se queda | Lo carga `languages.ts:27`. Resaltado CodeMirror de Typst. No llama a la red. |
| src/model/typstScope.ts | esTypst, llevaVistaTypst | propio | se queda | Lo importan `queries/typst.ts:38` (reexporta `esTypst`) y `FileViewer.tsx:70`. Predicado de ruta `.typ`. No llama a la red. |
| src/model/workdirKind.ts | WorkdirIconKind, workdirIconKind, esDeCodigo | lib | packages/ui/src/lib/workdirKind.ts | Funciones puras usadas fuera: `WorkdirIcon.tsx:6`, `treeKind.ts:4`, `shell/src/app/App.tsx:81` (`esDeCodigo`) y `settings/.../ManageProjects.tsx:17` (`workdirIconKind`). No llama a la red. |
| src/queries.ts | publicarLocales, localDe, colorDeMarca, describirEstado, ARBOLES, DetalleDeArboles, avisarDeLosArboles, IDOS, DetalleDeIdos, avisarDeIdos, idos, esBorrado, Entrada, comoEntra, decidir, alMoverseElArbol, recordarArboles, arbolesDe, esArbolDeCodigo, ubicar, contiene, DiagnosticoTypst, ExportacionTypst, esTypst, vistaServida, conVistaTypst, conVistaExportada, soltarVistasHuerfanas, seguirPluginTypst, principalElegido, elegirPrincipal, reaperturaDe, pedirReapertura, saltoDeLaVista, abrirVista, tomarVista, soltarVista, apagarVistasDe, vivaDe, hayVistasDe, capaLista, zoomDe, ocuparCapa, moverOcupante, desocuparCapa, asegurarCapa, cerrarCapaDe, fijarZoom, ampliadaDe, ampliarVista, revelarEnElArbol, Compilado, compiladoDe, diagnosticosDelArchivo, Salto, salto, saltarA, consumirSalto, lugarDe, mensajeDeArreglo, pedirArreglo, editorTypst, mirarEditorTypst, dejarDeMirarEditorTypst, InsercionDeRuta, pedirInsercionDeRuta, rutaEnVuelo, fueArrastreDeRuta, arrastrarRuta, DondeTypst, rutaRelativa, autocompletadoTypst | propio | se queda | Barril `export *` de `queries/`. grep no encuentra import del barril; shell entra por `queries/refresh`, `queries/treeKind` y `queries/typst`. Se queda: es el `queries.ts` de la feature (R12). |
| src/queries/localStatus.ts | publicarLocales, localDe, colorDeMarca, describirEstado | propio | se queda | Lo publica `FileTree.tsx:32`. Lo lee `projects/.../Tabs.tsx:27` (`localDe`, `colorDeMarca`, `describirEstado`). No llama a la red: el árbol es quien pidió `tree_git_status` / `kn_status`. Projects no importa code; la marca entra por props desde shell. |
| src/queries/refresh.ts | ARBOLES, DetalleDeArboles, avisarDeLosArboles, IDOS, DetalleDeIdos, avisarDeIdos, idos, esBorrado, Entrada, comoEntra, decidir, alMoverseElArbol | propio | se queda | `shell/src/app/App.tsx:71` importa `avisarDeLosArboles`. Dentro: FileTree, FileViewer, TaskFiles, Code, KnCloud, KnIntegrate. Eventos DOM `harness:arboles` y `harness:archivos-idos`. No llama a `invoke` ni a otra feature. |
| src/queries/treeKind.ts | recordarArboles, arbolesDe, esArbolDeCodigo, ubicar, contiene | propio | se queda | `shell/src/app/App.tsx:74` importa `arbolesDe`, `contiene`, `ubicar`. Dentro: `Code.tsx:15`, `TaskFiles.tsx:11`, `FileViewer.tsx:47`. `invoke` `list_task_trees` (19) con `machineOf` de machines (línea 2). El tipo `ArbolEnTarea` sale hoy de `apps/desktop/src/lib/model`. |
| src/queries/typst.ts | DiagnosticoTypst, ExportacionTypst, esTypst, vistaServida, conVistaTypst, conVistaExportada, soltarVistasHuerfanas, seguirPluginTypst, principalElegido, elegirPrincipal, reaperturaDe, pedirReapertura, saltoDeLaVista, abrirVista, tomarVista, soltarVista, apagarVistasDe, vivaDe, hayVistasDe, capaLista, zoomDe, ocuparCapa, moverOcupante, desocuparCapa, asegurarCapa, cerrarCapaDe, fijarZoom, ampliadaDe, ampliarVista, revelarEnElArbol, Compilado, compiladoDe, diagnosticosDelArchivo, Salto, salto, saltarA, consumirSalto, lugarDe, mensajeDeArreglo, pedirArreglo, editorTypst, mirarEditorTypst, dejarDeMirarEditorTypst, InsercionDeRuta, pedirInsercionDeRuta, rutaEnVuelo, fueArrastreDeRuta, arrastrarRuta | propio | se queda | `shell/src/app/App.tsx:156` importa `apagarVistasDe`, `hayVistasDe`, `soltarVistasHuerfanas`. Dentro: FileViewer, TypstPreview, TypstExportPreview, FileTree, typstComplete. `invoke`: `typst_live_stop`, `typst_live_open`, `list_integrations`, `site_place`, `site_hide`, `site_close`, `site_open_local`, `site_zoom`. No importa otra feature. |
| src/queries/typstComplete.ts | DondeTypst, rutaRelativa, autocompletadoTypst | propio | se queda | Lo importa `CodeEditor.tsx:51`. `invoke` `tree_show` (177) y `typst_live_complete` (277) con `machineOf` de machines (línea 13). |
| src/screens/FileViewer.tsx | esMarkdown, esHtml, isImage, default | propio | se queda | Pantalla: `shell/src/app/App.tsx:69` (lazy) y `TaskFiles.tsx:26`. `invoke`: `tree_write`, `tree_read_part`, `tree_show`, `preview_tree_show`, `tree_patch`, `preview_file`, `office_preview`, `tree_office_preview`, `open_file_external`, `tree_open_external`, `typst_live_change`, `typst_live_close_doc`, `typst_live_reveal`. También `@terminus/protocol` (`mediaKindOf`, `TreePart`): paquete viejo, tarea 1.9; el visor se queda. Imports de artifacts y viewers abajo. Las llamadas pasan a `queries.ts`. |
| src/screens/TaskFiles.tsx | default | propio | se queda | Pantalla: `shell/src/app/App.tsx:79` (lazy). `invoke`: `tree_open_external` (96), `open_external` (103, 108), `tree_read_part` (124), `list_task_trees` (290), `tree_changes` (292). `machineOf` de machines (21). Tipo `TreePart` de `@terminus/protocol` (29), paquete viejo (1.9). `descargar` de viewers (123). Las llamadas pasan a `queries.ts`. |
| src/screens/TaskFilesRow.tsx | taskFilesWidth, default | propio | se queda | `shell/src/app/App.tsx:72` importa el default y `taskFilesWidth`. Fila del chat y de la card de archivos. No llama a `invoke` ni a otra feature. `setMoviendoHueco` de `apps/desktop/src/lib/sites` (3) sube a shell/host. |
| src/screens/TaskSide.tsx | TaskSideShell, TaskSide | propio | se queda | `shell/src/app/App.tsx:73` importa `TaskSide` y `TaskSideShell`. El marco es de esta pantalla. Importa chat (2, 3, 4) y shell (`UsageTool` 7, `usage` 8): eso entra como slots; el archivo no se muda a chat. |

## Imports cruzados

Cada import de este paquete cuyo módulo vive en otra feature. En su lugar entra un slot o una prop desde shell, o el símbolo sube a `ui`, `session` o al cliente. Shell puede seguir montando las pantallas de code (`App.tsx` 69, 71, 72, 73, 74, 79, 81, 156): eso no es un import entre features.

### machines (`machineOf` de `features/machines/src/queries/store`)

La máquina de la sesión la pasa shell a la query, o la resuelve `engine-client` dentro de `queries.ts`. El componente deja de importar machines, y el `invoke` que hoy va a su lado se muda a `queries.ts`.

- `src/queries/treeKind.ts:2` → machines
- `src/queries/typstComplete.ts:13` → machines
- `src/components/Code.tsx:8` → machines
- `src/components/FileTree.tsx:2` → machines
- `src/components/KnCloud.tsx:3` → machines
- `src/components/KnIntegrate.tsx:3` → machines
- `src/components/TypstExportPreview.tsx:9` → machines
- `src/components/TypstPreview.tsx:16` → machines
- `src/screens/FileViewer.tsx:16` → machines
- `src/screens/TaskFiles.tsx:21` → machines

### artifacts

- `src/components/PagePreview.tsx:2` → artifacts (`SANDBOX_ARTEFACTO`). Sube a `packages/ui`: es la constante de sandbox, no una pantalla de artifacts.
- `src/screens/FileViewer.tsx:26` → artifacts (`Documento`). El HTML sandboxed entra como slot desde shell, o el marco sube a `packages/ui` (el Markdown ya está ahí).
- `src/screens/FileViewer.tsx:27` → artifacts (tipo `Preview`). El tipo de `office_preview` / `tree_office_preview` sale del cliente del motor, no de artifacts.
- `src/screens/FileViewer.tsx:28` → artifacts (`formaDe`). Sube a `packages/ui` junto al sandbox.

### viewers

- `src/screens/FileViewer.tsx:37` → viewers (tipo `LeerParte` de `Media`). Viaja con el slot del reproductor.
- `src/screens/FileViewer.tsx:49` → viewers (`delimiterFor` de `model/csv`). Función de formato: sube a `packages/ui/src/lib`.
- `src/screens/FileViewer.tsx:76` → viewers (`Pdf`). Slot desde shell.
- `src/screens/FileViewer.tsx:77` → viewers (`ImageViewer`). Slot desde shell.
- `src/screens/FileViewer.tsx:78` → viewers (`CsvTable`). Slot desde shell.
- `src/screens/FileViewer.tsx:79` → viewers (`Media`). Slot desde shell.
- `src/screens/FileViewer.tsx:1184` → viewers (`descargar` de `Media`). Entra con el slot, o sube a host (guardar un archivo).
- `src/screens/TaskFiles.tsx:123` → viewers (`descargar` de `Media`). Igual que la línea anterior.
- `src/components/TypstExportPreview.tsx:15` → viewers (`Pdf`). Slot desde shell.
- `src/components/TypstPreview.tsx:20` → viewers (`IconButton`). Sube a `packages/ui` (ahí ya están `Button` e `IconAction`).
- `src/components/TypstPreview.tsx:21` → viewers (`clampZoom`, `ZOOM_STEP`). Suben a `packages/ui/src/lib`.

### chat

- `src/screens/TaskSide.tsx:2` → chat (`SearchPanel`). Slot desde shell.
- `src/screens/TaskSide.tsx:3` → chat (`DelegatedPanel`, tipo `DelegatedPanelModel`). Slot y props desde shell.
- `src/screens/TaskSide.tsx:4` → chat (tipo `SearchSurface`). Lo declara la prop que shell pasa; code no importa chat.

`TaskSide.tsx:7` y `:8` importan `UsagePanel` y el tipo `Usage` de shell. No es otra feature: es al revés. El panel de uso entra como slot que shell ya posee.

### Hacia code (lo cortan las otras features)

No son imports de este paquete, pero son el cruce que esta tabla resuelve:

- `projects/src/screens/Tabs.tsx:26` → `FileIcon`. Pasa a `packages/ui`.
- `projects/src/screens/Tabs.tsx:27` → `localStatus`. La marca entra por props desde shell; el almacén se queda en code.
- `projects/src/screens/Projects.tsx:19`, `ProjectView.tsx:39`, `FolderChip.tsx:4` → `WorkdirIcon`. Pasa a `packages/ui`.
- `settings/src/screens/ManageProjects.tsx:17` → `workdirKind`. Pasa a `packages/ui/src/lib`.
- `settings/src/screens/ManageProjects.tsx:18` → `WorkdirIcon`. Pasa a `packages/ui`.
- `chat/src/screens/TaskLocation.tsx:5` → barril `code/src` (`WorkdirIcon`). Pasa a `packages/ui`.

### Libs que no son features

`apps/desktop/src/lib` no es una feature. Al separarlo: `i18n`, `utils` (`cn`), `format` (`peso`, `df`), `prefs`, `wrap`, `shortcuts` y `theme` suben a `packages/ui/src/lib`; `sites` (hueco de ventana) sube a shell o host; `serviceEvents` (`listen`) pasa por `engine-client`; los tipos `ArbolEnTarea`, `TaskFiles` y `TaskSideMode` pasan al `model.ts` de esta feature o al cliente generado. `@terminus/protocol` (`TreePart`, `mediaKindOf` en `FileViewer.tsx:36` y `TaskFiles.tsx:29`) es paquete viejo: lo clasifica la tarea 1.9; estas pantallas no se borran por eso.

Los tests `apps/desktop/tests/unit/{icons,diff,diff-words,tree,tree-loader,trees,typst-scope,workdir-icon,code-refresh,last-good-trees}.test.ts` importan `apps/desktop/src/features/code/…`, ruta que ya no existe. No cuentan como importadores de este paquete.
