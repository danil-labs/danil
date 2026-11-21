# @danil/ui

Biblioteca de componentes de interfaz de usuario de Danil (SolidJS + Tailwind CSS + Kobalte).

## Qué hace

Provee los componentes visuales puros, primitivas y controles reutilizables para las aplicaciones de Danil:
- Botones, inputs, selects, toggles, textareas.
- Diálogos, popovers, menús contextuales, dropdowns y tooltips.
- Paneles, tabs, tablas, barras de progreso y terminal.
- Avisos (Toast), badges, skeletons, spinners y estados vacíos o de fallo.
- Atajos de teclado (`Shortcut`), marcas (`MarcaServicio`), marcas de agentes/proveedores e íconos.
- Renderizado de texto ANSI (`AnsiText`).
- Riel de navegación lateral (`Sidebar`).

## Qué no consume

- **Nada de dominio**: no tiene conocimiento del motor (`danil-engine`), tareas, agentes, workspaces ni modelos.
- **Nada de red**: no realiza llamadas HTTP, WebSocket, IPC de Tauri ni invoca endpoints remotos.
- **Sin dependencias circulares**: no importa `@terminus/*` ni `@danil/*`.

## Componentes y utilidades exportadas

Todos los componentes se exportan a través del punto de entrada `src/index.ts`:

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
