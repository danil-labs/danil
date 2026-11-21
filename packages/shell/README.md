# @danil/shell

Shell de la aplicación Danil: router, arranque lineal, riel vertical y layout principal.

## Arquitectura

- **Arranque lineal (B-030, B-031)**:
  1. `session` (`useSession`): sin sesión muestra pantalla de entrada (enlace a `/login` en Web; botón que llama a `session.add` en Desk).
  2. Con sesión válida: monta el layout con riel + área principal. Sin estampida de 15 llamadas paralelas en el arranque; cada pantalla solicita sus datos cuando se monta.
- **Router de estados mínimo**:
  - Rutas soportadas: `"machines"`, `"workspace/:id"`, `"account"`.
  - Sin dependencias externas pesadas, basado en señales de SolidJS con sincronización de historial del navegador.
- **Riel vertical (DS1 v2)**:
  - Agrupado por organización: un «stack» por organización con su logo que se despliega hacia abajo.
  - De cara al cliente habla en nombres de plan («Personal», «Team», «Enterprise»), nunca la palabra «Organización» (B-008, B-009).
  - Botón «+» con solo «Agregar workspace».
  - Recibe sus datos vía props/slots desde las features.
- **ErrorBoundary por zona**:
  - `RailErrorBoundary`: protege la navegación lateral.
  - `MainErrorBoundary`: protege el área principal de contenido.
- **Composición de features (R3)**:
  - `src/routes.tsx` es el único archivo del shell que compone pantallas de `@danil/feature-*`.

## Piezas de features pendientes de implementación

- `@danil/feature-machines`: pantallas completas pendientes de implementación en su paquete.
- `@danil/feature-workspaces`: pantallas completas pendientes de implementación en su paquete.
- `@danil/feature-account`: pantallas completas pendientes de implementación en su paquete.
- `@danil/feature-projects`: pantallas completas pendientes de implementación en su paquete.
- `@danil/feature-chat`: pantallas completas pendientes de implementación en su paquete.
- `@danil/feature-terminal`: pantallas completas pendientes de implementación en su paquete.
- `@danil/feature-files`: pantallas completas pendientes de implementación en su paquete.
- `@danil/feature-ai-credentials`: pantallas completas pendientes de implementación en su paquete.
