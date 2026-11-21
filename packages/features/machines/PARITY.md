# Paridad Visual de Máquinas y Cuenta (VP1b / R13)

Este documento registra la paridad visual de los componentes de Máquinas y Cuenta portados desde `apps/desktop` hacia el front rebuild (`@danil/feature-machines` y `@danil/feature-account`).

## Componentes portados

### 1. `MachineIcon`
- **Origen:** `apps/desktop/src/features/machines/MachineIcon.tsx`
- **Destino:** `packages/features/machines/src/components/MachineIcon.tsx`
- **Paridad:** Mismo renderizado SVG de Lucide (Laptop para estaciones/computadoras y Server para VMs con `wakes`), atributos `data-machine-form` y gestión de tamaño (`props.size ?? 12`).

### 2. `MachineChip`
- **Origen:** `apps/desktop/src/features/machines/MachineChip.tsx`
- **Destino:** `packages/features/machines/src/components/MachineChip.tsx`
- **Paridad:** Chip compacto con icono `MachineIcon`, etiqueta descriptiva ("Corre en {name}", atenuada si está apagada con `opacity-60`), atributos `data-machine` y `data-machine-on`. Desacoplado de stores globales pasando datos por props.

### 3. `RunOnPicker`
- **Origen:** `apps/desktop/src/features/machines/MachinePicker.tsx`
- **Destino:** `packages/features/machines/src/components/RunOnPicker.tsx`
- **Paridad:** Apariencia idéntica usando `Popover`, `PopoverTrigger`, `PopoverContent`, `ITEM_DE_MENU` y `SignalDot` de `@danil/ui`. Preserva la interfaz de props `RunOnPickerProps` (`machines`, `selectedId`, `onSelect`, etc.).

### 4. `MachinesScreen`
- **Origen:** `apps/desktop/src/features/machines/AccountMachines.tsx`
- **Destino:** `packages/features/machines/src/screens/MachinesScreen.tsx`
- **Paridad:** Estructura de lista con chips por máquina (`border-border`, `py-0.5 pr-0.5 pl-1.5`, `data-account-machine`, `SignalDot`), estado de confirmación `asking()` para encender/apagar, botón para conectar y gestión reactiva desacoplada mediante `useMachines`.

### 5. `AccountCard` y `AccountIdentity`
- **Origen:** `apps/desktop/src/features/settings/AccountCard.tsx` y `AccountIdentity.tsx`
- **Destino:** `packages/features/account/src/components/AccountCard.tsx`, `packages/features/account/src/components/AccountIdentity.tsx` y usados en `packages/features/account/src/screens/AccountScreen.tsx`
- **Paridad:**
  - `AccountIdentityBlock`: Avatar con iniciales o foto (`data-account-identity`, `data-account-avatar`), nombre y correo con tipografía exacta del sistema visual.
  - `AccountCard`: Tarjeta/fila de cuenta (`variant="row"`, `data-account-card`), `StatusTag` con tonos de estado ("Activa", "Conectada"), barras de límite con `ProgressBar`, e integración con `BillingLink` y `HarnessLink`.

## Componentes UI
Todos los componentes visuales requeridos (`Badge`, `ProgressBar`, `Spinner`, `Button`, `Popover`, `SignalDot`, `Close`) ya están presentes y exportados en `@danil/ui`. No fue necesario copiar componentes nuevos a `packages/ui/src/`.

## Verificación
- `pnpm --filter @danil/feature-machines run typecheck` (tsc --noEmit): Código 0.
- `pnpm --filter @danil/feature-account run typecheck` (tsc --noEmit): Código 0.
- `node scripts/verify-front.mjs`: 249 archivos, 0 violaciones (R1 a R10 pasan).
