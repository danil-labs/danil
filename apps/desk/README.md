# apps/desk

Danil Desk con el front nuevo: monta el shell común con `createDeskSession(createTauriHost())` (varias sesiones en el motor, P1) y `setHost`.

- Compila el front con `pnpm -C apps/desk run build` (sale en `apps/desk/dist`).
- **Pendiente:** el envoltorio Tauri propio. Mientras tanto se usa el de `apps/desktop/src-tauri` (proxy de comandos al motor) apuntando `frontendDist` a `apps/desk/dist`, y se compila en la MacBook (regla 10: Desk solo se prueba en macOS). No se publica sin autorización.
