# @danil/feature-machines

Feature de máquinas: lista, ciclo de vida (encendido y apagado), conexión y selector para tareas.

## Qué hace

- **Listado completo («Tus máquinas», M1, M2):** La pantalla `MachinesScreen` lista todas las máquinas devueltas por la plataforma (`GET /v1/machines`) para la sesión actual, sin filtros propios del front y sin depender de si hay o no un workspace activo. Se proveen utilidades de orden determinista (`sortMachines`, personal primero y por organización) y de agrupación (`groupMachinesByOrg`).
- **Selector en compositor («Ejecutar en», M3):** El componente `RunOnPicker` recibe la lista de máquinas autorizadas para el workspace actual entregada por la plataforma y permite seleccionar la máquina destino de ejecución.
- **Detección de VMs nuevas (M7):** Sondeo automático periódico cada 15 segundos mediante `useMachines` para detectar VMs recién creadas tras compras sin necesidad de recargar la aplicación.
- **Ciclo de vida remoto (M6):** Encendido (`startMachine`) y apagado (`stopMachine`) con sondeo del estado de operación (`getOperation`) cada 1,5 s hasta su resolución.
- **Conexión y reactivación automática (M6b, 6.4, 6.5):** La conexión a través de `connectMachine` (@danil/engine-client) solicita un ticket temporal al borde; si la VM está suspendida o responde 409, dispara `startMachine` de respaldo y se reactiva automáticamente, mostrando el estado «encendiendo…» y reintentando sin intervención manual. El encendido ocurre ÚNICAMENTE por acción explícita de la persona.
- **Manejo de errores (M8):** Todo fallo de red o del borde se visualiza con su causa y ofrece botón de reintento, evitando listas vacías silenciosas.
- **Independencia de entorno (R5):** La lógica de negocio no ramifica entre local y remoto; la máquina local se expone uniformemente desde el motor/host, variando únicamente el ícono visual según el `kind`.
- **QA y especificación:** Registro de cumplimiento en [QA.md](QA.md).

## Qué consume

### OpenAPI (@danil/platform-client)
- `getMachines` (`GET /v1/machines`): listado de máquinas de la sesión.
- `startMachine` (`POST /v1/machines/{id}/start`): encendido de máquina remota.
- `stopMachine` (`POST /v1/machines/{id}/stop`): detención de máquina remota.
- `createMachineTicket` (`POST /v1/machines/{id}/tickets`): emisión de ticket de conexión para el transporte relay.
- `getOperation` (`GET /v1/operations/{id}`): consulta del progreso de operaciones asíncronas.

### Runtime y Motor (@danil/engine-client)
- `connectMachine`: multiplexación de comandos RPC1 mediante transporte local o relay.

### Sesión y Host (@danil/session, @danil/host)
- `Session`, `SessionSource`, `LocalHost`: resolución de credenciales, tokens temporales y CSRF.

## Pendientes

- Conexión del selector de máquinas a la persistencia de workspace activo: pendiente hasta que la shell conecte el compositor.
