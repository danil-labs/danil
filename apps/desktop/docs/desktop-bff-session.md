# Sesión de Desk: retiro separado de la ventana web

En `beta-web`, los cuatro archivos nativos de sesión, créditos, registro y
proxy se conservan idénticos a `origin/dev`. Sus transportes heredados de
mensajería, concesiones `/v1/bff` y canje sellado todavía existen en Desk.
Su retiro pertenece a `beta-desk` y requiere cargo check, clippy y test;
`verify --no-cargo` no acredita esa migración. No se prepara aquí esa rama.

La entrada web solo consume identity y workspaces por el borde, con cookie y
CSRF. No instala la capacidad de mensajería ni usa los comandos nativos.
Las máquinas quedan no disponibles hasta el contrato `/v1/machines`.

El guard `messaging-isolation` escanea las fuentes y conserva hashes exactos
para el legado nativo pendiente y los módulos que todavía usa mobile.
Un consumidor nuevo o una modificación que conserve rutas prohibidas falla.
El guard `commands` explica los registros nativos de dev sin llamadores;
no se inventan llamadas desde el front para darlo por verde.

Los avisos en `features/shell/attention.ts` y las entregas entre tareas de
`features/chat/inboxRows.ts` pertenecen al motor y se conservan.
Perfil por cuenta y modelo organización→N workspaces por decidir en sus detalles.
