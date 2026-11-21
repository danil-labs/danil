# apps/desk

Danil Desk con el front nuevo: monta el shell común con `createDeskSession(createTauriHost())` (varias sesiones en el motor, P1) y `setHost`.

- Compila el front con `pnpm -C apps/desk run build` (sale en `apps/desk/dist`).
- Envoltorio Tauri propio en `apps/desk/src-tauri` (`danil-desk`), usando `app_lib` de `apps/desktop/src-tauri`.
- Compilar la aplicación en Mac (Desk solo se prueba en macOS):
  ```bash
  pnpm -C apps/desk tauri:build
  ```
- **Publicación:** No se publica sin autorización explícita de la persona mantenedora (ver reglas de trabajo en `AGENTS.md`).

## Configuración de Tauri (SR2, N1)

`app_lib` (el crate de `apps/desktop/src-tauri`) expande `generate_context!()` con su propio `tauri.conf.json`. Por eso `tauri:dev` y `tauri:build` pasan `--config src-tauri/tauri.conf.json`: la CLI lo pone en `TAURI_CONFIG` y se mezcla encima del de desktop, así que manda la CSP de Desk (`connect-src` solo `ipc:` y `wss://connect.danil.ai`, sin hosts retirados), su `frontendDist` y su `devUrl`. Al compilar en la Mac, comprueba la CSP efectiva en el inspector (cabeceras del protocolo `tauri://`).
