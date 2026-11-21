# @danil/ui

Biblioteca de componentes visuales puros y sistema de internacionalización para las aplicaciones de Danil (SolidJS + Tailwind CSS + Kobalte).

## Qué hace

Provee los componentes visuales puros, primitivas, controles reutilizables y catálogos de traducción para Danil:
- Botones, inputs, selects, toggles, textareas.
- Diálogos, popovers, menús contextuales, dropdowns y tooltips.
- Paneles, tabs, tablas, barras de progreso y terminal.
- Avisos (Toast), badges, skeletons, spinners y estados vacíos o de fallo.
- Atajos de teclado (`Shortcut`), marcas (`MarcaServicio`), marcas de agentes/proveedores e íconos.
- Renderizado de texto ANSI (`AnsiText`).
- Riel de navegación lateral (`Sidebar`).
- Internacionalización y catálogo único de textos a través del submódulo `@danil/ui/i18n`.

## Qué consume

- **Nada de dominio**: no tiene conocimiento del motor (`danil-engine`), tareas, agentes, workspaces ni modelos de datos.
- **Nada de red**: no realiza llamadas HTTP, WebSocket, IPC de Tauri ni invoca endpoints remotos (R1).
- **Aislamiento absoluto**: no importa ningún paquete `@danil/*` (cumple estrictamente con la regla R4).

## Internacionalización (`@danil/ui/i18n`)

Submódulo de textos e internacionalización unificado para todo el front nuevo:
- **Origen:** Port directo de `apps/desktop/src/lib/i18n.ts`.
- **Catálogos:** Los archivos JSON ubicados en `packages/ui/src/i18n/locales/` son copia idéntica de `apps/desktop/src/locales/`. La regla R13 (`scripts/verify-front.mjs`) rechaza cualquier texto inventado o frase que no coincida con el catálogo de `apps/desktop`.
- **Carga de idiomas:**
  - `es` (español) es la lengua base y está empotrada de forma síncrona en `catalogs.ts`. Sin ella, `t()` devuelve la clave tal cual.
  - `en` (inglés) se carga de forma diferida en segundo plano al arrancar la aplicación mediante `cargarLenguas()`.

### Inicialización en la aplicación

Al inicializar la app (`apps/workspace`, `apps/desk`), se importan los catálogos y se arrancan las lenguas secundarias:

```ts
import { cargarLenguas } from "@danil/ui/i18n";

// Carga las lenguas diferidas sin bloquear el arranque inicial
void cargarLenguas();
```

### Cómo se usa `t()`

Todo texto visible en JSX, atributos accesibles (`aria-label`, `title`, `placeholder`, `alt`) o cadenas de mensaje debe provenir del catálogo mediante `t()`:

```tsx
import { t } from "@danil/ui/i18n";

export function MiComponente() {
  return (
    <div>
      {/* Clave directa del catálogo */}
      <h1>{t("inicio.bienvenida")}</h1>

      {/* Con interpolación de variables */}
      <p>{t("archivos.progreso", { actual: 1, total: 5 })}</p>

      {/* En atributos accesibles */}
      <input
        type="search"
        placeholder={t("comun.buscar")}
        aria-label={t("comun.buscar")}
      />
    </div>
  );
}
```

## Componentes y utilidades exportadas

Todos los componentes de interfaz se exportan a través del punto de entrada `src/index.ts`:

- **AnsiText**: `AnsiText`
- **Badge**: `Badge`, `badgeVariants`
- **Button**: `Button`, `buttonVariants`
- **ContextMenu**: `ContextMenuRoot`, `ContextMenuTrigger`, `ContextMenuPortal`, `ContextMenuContent`, `ContextMenuItem`, `ContextMenuSeparator`
- **Dialog**: `DialogRoot`, `DialogTrigger`, `DialogPortal`, `DialogOverlay`, `DialogContent`, `DialogHeader`, `DialogFooter`, `DialogTitle`, `DialogDescription`, `DialogCloseButton`
- **DropdownMenu**: `DropdownMenuRoot`, `DropdownMenuTrigger`, `DropdownMenuPortal`, `DropdownMenuContent`, `DropdownMenuItem`, `DropdownMenuSeparator`
- **EmptyState**: `EmptyState`
- **Failure**: `Failure`
- **IconAction**: `CancelButton`, `RemoveButton`
- **Input**: `Input`, `inputVariants`
- **KeyedList**: `KeyedList`
- **Panel**: `Panel`, `PanelHeader`, `PanelBody`
- **Popover**: `PopoverRoot`, `PopoverTrigger`, `PopoverAnchor`, `PopoverPortal`, `PopoverContent`, `PopoverCloseButton`, `PopoverTitle`, `PopoverDescription`
- **ProgressBar**: `ProgressBar`
- **SectionLabel**: `SectionLabel`
- **Select**: `Select`, `SelectTrigger`, `SelectValue`, `SelectContent`, `SelectItem`, `SelectHiddenSelect`
- **Shortcut**: `TeclaDeAtajo`, `Atajo`, `BotonConAtajo`
- **SignalDot**: `SignalDot`, `SignalTone`, `taskSignalTone`
- **Skeleton**: `Skeleton`
- **Spinner**: `Spinner`
- **Table**: `Table`, `TableHead`, `TableBody`, `TableRow`, `TableHeaderCell`, `TableCell`
- **Tabs**: `TabsRoot`, `TabsList`, `TabsTrigger`, `TabsContent`
- **Terminal**: `Terminal`, `TerminalName`, `TerminalBody`, `TerminalCursor`, `SUPERFICIE_DE_TERMINAL`, `BARRA_DE_TERMINAL`, `NOMBRE_DE_TERMINAL`, `CUERPO_DE_TERMINAL`
- **Textarea**: `Textarea`
- **Toast**: `Toast`, `ToastStack`, `ToastPortal`
- **Toggle**: `Toggle`
- **Tooltip**: `TooltipRoot`, `TooltipTrigger`, `TooltipPortal`, `TooltipContent`, `RETARDO_TOOLTIP`
- **icons**: `Close`, `Back`, `Next`, `Print`, `McpMark`, `GitHubMark`, `BitbucketMark`, `GitLabMark`, `FigmaMark`, `ExcalidrawMark`, `AtlassianMark`, `NotionMark`, `MarcaAgente`, `MarcaProveedor`, `MarcaGitHost`
- **marcas**: `MarcaServicio`
- **sidebar**: `Sidebar`, `SidebarHeader`, `SidebarContent`, `SidebarMenu`, `SidebarMenuItem`, `SidebarMenuButton`
- **layer**: `InsideDialog`, `insideDialog`
- **pointer-focus**: `pointerOpenFocus`, `withPointerFocus`
