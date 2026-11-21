# @danil/engine-client

Cliente del motor con transportes local y relay; la UI no distingue cuál.

- Consume: WebSocket/RPC del motor.
- Contrato: el manifiesto RPC1 (se genera con `pnpm generate`).
- Entrada pública: `src/index.ts`.
- Reglas: R1 (red solo aquí y en session, host, clients), R3 y R4 de `03-structure.md`.
- Estado: esqueleto F1.1, sin lógica.
