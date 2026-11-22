# @terminus/carry

## Qué hace
Lógica de transporte de trabajo y carpetas entre máquinas.
Calcula qué archivos viajan, empaqueta el contenido en partes y define la base sobre la que arranca la tarea en la máquina destino.

## Qué expone
Exporta desde `src/index.ts`:
- Tipos de transporte: `CarryEngine`, `ExportArgs`, `Exported`, `ImportArgs`, `Imported`, `Part`, `SizedPath`, `WorkStatus`.
- Funciones de planificación y ejecución: `bytesPerSecond`, `checkBring`, `checkCarry`, `createsProject`, `dropCarry`, `ignoredAllowed`, `jobFor`, `partSize`, `planCarry`, `runCarry`, `stopCarry`, `trustKey`.

## Qué consume
- Paquete de utilidad pura; no importa paquetes `@danil/*` ni clientes de red.

## Qué contratos toca
- Rutas `/v1` del borde: ninguna directa.
- Comandos RPC1 del motor: ninguno directo; define las interfaces que implementan los comandos de carry en `packages/features/machines`.

## Qué falta según la fase 2 del plan
- Fase 2.4: sus funciones y tipos se integran en `packages/features/machines` (`queries/carry.ts`, `model/carryPlan.ts`, `queries/carryRun.ts`).
- Las pantallas `CarryProgress.tsx` y `CarrySheet.tsx` pasan a la feature `machines`. El paquete se retira en la fase 3.
- Fuente y detalle: [INVENTORY.md](./INVENTORY.md).
