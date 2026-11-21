# @danil/platform-client

Cliente del borde /v1 con reintento ante 404/501 (R10) y la URL base única.

- Consume: fetch del borde.
- Contrato: el OpenAPI del borde (danil-contracts).
- Entrada pública: `src/index.ts`.
- Reglas: R1 (red solo aquí y en session, host, clients), R3 y R4 de `03-structure.md`.
- Estado: esqueleto F1.1, sin lógica.
