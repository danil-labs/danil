# @danil/ui

## Qué hace
Biblioteca de primitivas y componentes visuales puros y reutilizables.
Construida con SolidJS, Tailwind CSS y Kobalte; sin lógica de dominio ni llamadas a clientes de red (regla R4).

## Qué expone
Exporta desde `src/` componentes y utilidades visuales:
- Componentes base: `Button`, `Input`, `Select`, `Dialog`, `Popover`, `DropdownMenu`, `ContextMenu`, `Badge`, `Spinner`, `Toast`, `Table`, `Tabs`, `Toggle`, `Textarea`.
- Visualización de datos y texto: `Markdown`, `Mermaid`, `FilePreview`, `EmptyState`, `ProgressBar`, `AnsiText`, `EnlargeableImage`.
- Iconos y tokens: catálogo de iconos (`icons.tsx`), marcas (`marcas.tsx`), y estilos globales.

## Qué consume
- SolidJS, Kobalte (`@kobalte/core`), Lucide (`lucide-solid`), Tailwind CSS.
- Prohibido importar paquetes de dominio `@danil/*` o `@terminus/*` (R4).

## Qué contratos toca
- Rutas `/v1` del borde: ninguna.
- Comandos RPC1 del motor: ninguno directo (5 llamadas residuales a `engine-client` en `FilePreview` y `preview_file` en proceso de extracción a `host`/`queries`).

## Qué falta según la fase 2 del plan
- Fase 2.1: recibir todos los componentes visuales reutilizables identificados en las features (`MachineIcon`, `FileIcon`, `SettingsLayout`, `Governed`, `ProgressRing`, etc.) según `ui-inventory.md`.
- Saneamiento completo de imports hacia `engine-client` para blindar R4.
