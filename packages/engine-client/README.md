# @danil/engine-client

Cliente tipado del contrato RPC1 del motor (`src/generated`, generado) y sus transportes.

- `transports/local.ts`: Desk; usa `host.invoke`/`host.listen` inyectados (el IPC de Tauri vive en `packages/host`).
- `transports/relay.ts`: WebSocket al relay con ticket de un solo uso (`requestTicket` inyectado), correlación por id, cursor de eventos al reconectar, backoff exponencial con jitter y estado `waking` mientras la máquina despierta. Sin lista blanca de comandos.
- `connect.ts`: `connectMachine({sessionKey, machine, host?, platform})` elige transporte (único lugar que distingue local de relay), cachea por `(sessionKey, machine_id)` y expone `status()` como señal.

Protocolo de trama del relay (JSON): petición `{id, method, params}`, respuesta `{id, result}` o `{id, error:{code,message}}`, evento `{event, payload, cursor}`; al reconectar el cliente envía `{resume:{cursor}}`.
