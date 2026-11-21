# Paridad Visual: Archivos, Terminal y Credenciales de IA (VP2b / R13)

Documento de paridad visual portado de `apps/desktop` hacia los paquetes correspondientes del front rebuild.

## 1. Archivos (`@danil/feature-files`)

### FileIcon (`FileIcon.tsx`)
- Portado desde `apps/desktop/src/features/code/FileIcon.tsx`.
- Tamaño base por defecto: `13px`.
- SVG genérico (`GENERICO`): exactamente el vector Lucide de archivo genérico con `fill="none" stroke="currentColor" stroke-width="2"`.
- Soporte para `path` y `ruta` para compatibilidad completa con llamadas de desktop.
- Categorías con mapping compacto (< 400 líneas, conforme a R6).

### FileTree (`FileTree.tsx`)
- Portado desde `apps/desktop/src/features/code/FileTree.tsx`.
- Mismas props de interfaz (`FileTreeProps`).
- Barra superior de búsqueda (`Search` icon de 13px, campo transparente con placeholder y botón de refresco SVG).
- Indentación y dimensiones idénticas a desktop (`SANGRIA = 12`, `CHEVRON = 13`, `HuecoDeChevron`).
- Tipografía mono con soporte para marcas y badges de Git (M, A, D, U, I) en tamaño exacto (`text-[10px] font-mono font-semibold`).
- Respeto a R10: visualización de errores con botón de reintento.

### FileViewer (`FileViewer.tsx`)
- Portado desde `apps/desktop/src/features/code/FileViewer.tsx`.
- Cabecera con migas de pan (`Migas` con navegación `bdi` y delimitadores `›`), icono de archivo y nombre truncado.
- Barra de estado inferior (`BarraDeEstado`) con conteo de líneas, bytes formateados y UTF-8.
- Aviso de seguridad B-019 (> 5 MB) con advertencia y opción de carga completa.
- Visor con numeración de líneas (`tabular-nums`) y bloque de código en solo lectura.

## 2. Terminal (`@danil/feature-terminal`)

- Eliminadas las copias locales obsoletas (`TerminalPrimitives.tsx` y `AnsiText.tsx`).
- Uso directo de las primitivas de `@danil/ui`:
  - `Terminal`: Contenedor base de terminal con variables CSS de tema.
  - `TerminalName`: Nombre y estado del proceso / PTY.
  - `TerminalBody`: Cuerpo mono con auto-scroll, captura de stdin y accesibilidad.
  - `TerminalCursor`: Cursor con animación `motion-safe:animate-pulse`.
  - `AnsiText`: Procesador y renderizado de secuencias ANSI y enlaces web.
- Barra superior usando `BARRA_DE_TERMINAL` y selector de tema según `apps/desktop/src/styles/terminal.css`.

## 3. Credenciales de IA (`@danil/feature-ai-credentials`)

- Portado desde `apps/desktop/src/features/settings/AIProviders.tsx` y `Accounts.tsx`.
- Tarjeta de proveedor (`ProviderCard.tsx`) con diseño visual de superficie (`bg-neutral-900/80 border-neutral-800`).
- Badges de suscripción y conectado (`text-sky-400 bg-sky-500/10` y `text-emerald-400 bg-emerald-500/10`).
- Formulario de ingreso de API key con diseño alineado a tokens del sistema.
- Lista de cuentas configuradas por proveedor con desglose de estado por máquina (`active`, `pending`, `removed`) y acciones de quitar/restaurar.
- Pantalla `AiCredentialsScreen.tsx` con encabezado y estructura idéntica a las secciones de Settings en desktop.
