# @danil/feature-machines

Feature: lista, encendido y conexión de máquinas.

- Consume: el borde /v1 (platform-client), más ui, session y host.
- Contrato: tipos generados por los clientes; `src/model.ts` solo deriva tipos de vista.
- `src/queries.ts` es el único lugar donde se llama a la red.
- `src/components/` y `src/screens/` las monta solo el shell (R3: no importa otras features).
- Entrada pública: `src/index.ts`.
- Estado: esqueleto F1.1.
