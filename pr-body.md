Causa: la decisión 3 del 2026-11-11 retira calendario, embudos y métricas, pero la entrada seguía publicando R29–R31 y la SPA solicitaba sus datos y conservaba interfaces, demos y opciones inactivas.

Cambio: se eliminan las rutas /api/calendar/connections, /api/funnels y /api/funnels/:id/board. Desaparecen el calendario de conexiones y del detalle de agentes, los filtros y lectores de embudos/tableros, sus datos de demo y sus opciones en personalización. Se elimina el gráfico de embudo de campaña y su cálculo sin consumidores. Los contactos siguen cargando con sus filtros de actividad y etiquetas. Los tipos/lectores únicos viven en packages/attention: también se retiran allí, junto con las traducciones y la fila del fallback de escritorio que quedarían huérfanas. El número de archivos responde a estas eliminaciones, no a nuevas funcionalidades.

No existía una ruta o módulo independiente de métricas en esta SPA: /api/metrics y sus subrutas siguen cerradas y están cubiertas por la prueba de retiro. Se conservan los contadores operativos y /api/marketing/campaigns/:id/stats: la auditoría los clasifica como mensajería (R34/P14), y sirven para progreso y reconciliación de escrituras inciertas. Programar una campaña sigue permitido; el icono calendar-clock representa esa acción, no el calendario retirado.

Base: origin/dev 5868129a. PR P2 de S2-F paso 1, independiente de P0/P1. Toda API restante sigue en legacy; no se activa v1 ni se toca H1/H7.

Pruebas (Node v22.23.5, Linux):
- Rojo antes: `node --test --experimental-strip-types apps/desktop/alpha-entry/worker.test.mjs apps/desktop/tests/unit/alpha-entry-*.test.mjs apps/desktop/tests/unit/attention-service.test.ts packages/attention/test/broadcast-panel.test.ts packages/attention/test/customization.test.ts`: 91 pasan, 4 fallan de 95 (rutas, lector de calendario, API de embudos y opciones retiradas).
- Rojo del montaje nuevo en web-account.test.mjs: 0/1; las solicitudes observadas incluían /api/funnels y /api/calendar/connections.
- `node --test --experimental-strip-types apps/desktop/alpha-entry/worker.test.mjs apps/desktop/tests/unit/alpha-entry-*.test.mjs`: 69/69.
- `node --test --experimental-strip-types apps/desktop/tests/unit/attention-service.test.ts packages/attention/test/broadcast-panel.test.ts packages/attention/test/customization.test.ts`: 26/26.
- `node --test --test-force-exit apps/desktop/tests/unit/web-account.test.mjs`: 2/2. Compila con Vite y monta los componentes reales de conexiones y selección de contactos en jsdom: carga contactos y conexiones API sin solicitudes ni controles retirados. No es una prueba nativa.
- `node --test --test-force-exit --experimental-strip-types packages/attention/test/*.test.ts`: 60/60 (incluye parte de las 26 anteriores; no se suman).
- Recorrido directo de demoBroadcastSource: las tres lecturas /api/funnels, /api/funnels/1/board y /api/metrics dan 404; /api/contacts da 200.
- `pnpm verify --no-cargo`: salida 0; 266 pasos OK de 267 en 404 s, desde una instalación offline limpia (562 paquetes reutilizados, cero descargas y sin cambios de lockfile). Se omite el paso CLI que requiere Rust y sidecar. Cargo fmt/check/clippy/test y permisos nativos no comprobados; no es una verificación completa.
- `git diff --check`: sin errores. Búsqueda sin rutas retiradas en código de producto de alpha-entry, src/web y packages/attention.

Riesgo: enlaces o consumidores viejos de las rutas retiradas recibirán 404; es el retiro solicitado. No hay migración de preferencias porque esas opciones nunca fueron habilitables. Se actualizan las aserciones del calendario y se retira solo la aserción del cálculo del gráfico eliminado; las pruebas nuevas comprueban su retiro. No se ensayó la ventana nativa ni móvil. Los gates propuestos del meta-repo sin configuración en este repo (mutación, ESLint estricto) no se inventaron.

Sin push, PR remoto ni despliegue.
