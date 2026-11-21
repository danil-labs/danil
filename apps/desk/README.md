# apps/desk

Danil Desk con el front nuevo: monta el shell común con `createDeskSession(createTauriHost())` (varias sesiones en el motor, P1) y `setHost`.

- Compila el front con `pnpm -C apps/desk run build` (sale en `apps/desk/dist`).
- Envoltorio Tauri propio en `apps/desk/src-tauri` (`danil-desk`), usando `app_lib` de `apps/desktop/src-tauri`.
- Compilar la aplicación en Mac (Desk solo se prueba en macOS):
  ```bash
  pnpm -C apps/desk tauri:build
  ```
- **Publicación:** No se publica sin autorización explícita de la persona mantenedora (ver reglas de trabajo en `AGENTS.md`).
