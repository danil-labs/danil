# Plugins de Terminus

Los plugins aportan capacidades opcionales. La instalación de binarios es
compartida; su activación pertenece a cada workspace. La lengua seleccionada
también pertenece al workspace.

| Clase | Material y entrada | Instalación |
|---|---|---|
| Lenguas | JSON desde el bundle, una carpeta o un ZIP local | `<app data>/lenguas/<código>/` |
| Binarios | Artefactos de terceros descargados con versión y SHA-256 fijados | `<app data>/entorno/<id>/<versión>/` |

## Catálogo

| Id | Capacidad | Ficha |
|---|---|---|
| `yua` | Catálogo embebido en maya yucateco | [Lengua](../src/locales/yua/README.md) |
| `libreoffice` | Conversión de documentos | LibreOffice (motor) |
| `drawio` | Visor de diagramas en el chat | draw.io (motor) |
| `computer-use` | Pantalla y acciones de escritorio por MCP | Cua Driver (motor) |
| `typst` | Vista en vivo y exportación de documentos Typst en la vista del archivo | Typst (motor) |

## Lenguas

Maayatʼaan (`yua`) viaja embebido en `src/locales/yua/` junto con `es` y `en`,
listo por defecto en Desk y Web sin instalación aparte.

Los plugins binarios (descarga, hash, instalación y activación) los gestiona el
motor de Terminus; la ventana solo los muestra en Configuración → Conexiones
(`src/features/settings/ConnectionsOperation.tsx`).
