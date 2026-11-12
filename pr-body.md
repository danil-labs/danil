## Qué cambia y por qué

S2-H corrige H2 de S2-C: el código de Desk estaba sellado y limitado a 120 segundos, pero cada canje volvía a abrir una sesión GoTrue. El replay secuencial y el concurrente devolvían 200 dos veces.

Cada aprobación incorpora un identificador aleatorio dentro del sello. Tras comprobar PKCE, WorkOS y acceso, el canje consume ese identificador en una transacción de `DesktopCodeStore` **antes** de abrir GoTrue. Solo el primer consumo confirmado continúa; los siguientes responden `401 {"error":"invalid_code"}`. El plazo del binding termina con la vigencia del código. Una alarma elimina el registro al caducar.

### Mecanismo y reutilización

Se reutilizan el sello AES-GCM, el generador aleatorio, PKCE, la caducidad y las comprobaciones existentes. No había un registro consumible ni bindings de KV/D1/DO en esta entrada. Se añade un Durable Object SQLite del propio Worker, con binding y migración declarados para alfa y staging. La transacción proporciona consumo durable y atómico; KV no ofrece aquí un compare-and-set. Supabase existe, pero sus migraciones pertenecen a `danil-workspace`: usar una tabla nueva exigiría cambiar otro repositorio y el contrato de sus RPC.

La elección sigue la [semántica de transacciones de Durable Objects](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/#transaction). El estado solo contiene una marca de consumo; no guarda códigos, identidad ni tokens. No se modifica H1 (`service_role`), el refresh, el logout ni la sesión del navegador.

## Cómo se comprobó

Linux, Node v22.23.5, base local `origin/dev` (`e8ba65858ecb18bc53673c53d2a97702b677618e`). Sin push ni despliegue.

| Comando o comprobación | Resultado |
|---|---|
| Suite original: `node --test apps/desktop/alpha-entry/worker.test.mjs apps/desktop/tests/unit/alpha-entry*.test.mjs` | 61 pruebas, 61 correctas, 0 fallos |
| Primero, pruebas nuevas sin el fix: `node --test apps/desktop/tests/unit/alpha-entry-session.test.mjs` | 23 pruebas: 21 correctas, 2 fallos. Replay: 200 en vez de 401; concurrencia: [200,200] en vez de [200,401] |
| Misma suite de alpha-entry después del fix | 68 pruebas, 68 correctas, 0 fallos, 0 omitidas |
| Pruebas de sesión con el fake sustituido temporalmente por un namespace real de Miniflare/workerd | 26 pruebas, 26 correctas, 0 fallos, 0 omitidas |
| Consumo directo en workerd con SQLite y persistencia en disco | Primer consumo 204, replay 401; 20 consumos simultáneos: 1 aceptado y 19 rechazados; caducado 401; replay tras reiniciar el runtime 401 |
| `pnpm verify --no-cargo` | Salida 0, Linux, 407 s: 266 pasos ejecutados correctamente de 267; 1 omitido (CLI con motor/Rust). La propia cadena advierte que no es una verificación completa |
| `node --check` sobre los módulos modificados y `git diff --check` | Correctos |

Las siete regresiones añadidas cubren primer canje 200, replay 401 sin abrir otra sesión, concurrencia con una sola sesión nueva, expiración al segundo 120, almacenamiento ausente/caído, pérdida del acuse después del consumo y fallo de GoTrue con el código ya gastado. Cada petición del fake crea una instancia nueva del objeto y conserva únicamente su almacenamiento.

## Riesgo y límites

- **Seguridad ante fallos parciales:** si el consumo se confirma y después falla el binding, GoTrue o la respuesta, el código queda gastado. Se requiere una aprobación nueva; no hay rollback ni reintento que pueda duplicar sesiones. Sin binding o ante fallo de almacenamiento, responde 503 sin abrir GoTrue.
- **Publicación pendiente:** habrá que aplicar la migración del namespace al desplegar el Worker. No se ejecutó ningún despliegue. Debe conservarse ese namespace y su almacenamiento en futuras actualizaciones; no se puede volver a una versión que ignore el consumo.
- **Transición:** los códigos emitidos por la versión anterior carecen de identificador y serán rechazados; su vigencia máxima era de 120 segundos. Sesiones ya emitidas conservan su comportamiento.
- **Runtime local:** Miniflare 4.20260730.0 admite hasta `2026-08-06`; la prueba local usó esa fecha. Los TOML conservan `2026-10-01`. No se verificó el Worker publicado ni un login con proveedores reales.
- Rust, el CLI con el motor y la ventana nativa no se verifican en esta entrega del Worker. El repo no configura un gate de mutación para esta zona.

Rama: `fix/alpha-entry-one-time-code`; destino: `dev`. El orquestador publicará la rama y abrirá el PR para revisión de cambio y seguridad.
