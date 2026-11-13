# Sesión de Desk: limpieza y canje pendiente

La mensajería es un satélite separado. Desk y web no montan inbox, campañas,
canales ni agentes de atención. Se retiran el transporte de la ventana, su
proxy nativo, las concesiones de UI que dependían de él y el piloto de créditos
que llamaba a esa superficie. El guard `scripts/guards/messaging-isolation.mjs`
impide reintroducir esos montajes o consumidores.

Se conservan los avisos del motor en `src/features/shell/attention.ts`:
`list_workspace_attention` y `mark_task_seen`. También se conservan las filas
de entregas entre tareas en `src/features/chat/inboxRows.ts`. No son mensajes
de contactos ni consumen servicios de mensajería.

El canje heredado de Desk en `src-tauri/src/extracted/agents_session.rs` sigue
pendiente de L2 y del contrato de identity. Solo quedan los comandos nativos
que todavía usa el inicio/cierre de sesión de la ventana; no se expone un proxy
HTTP genérico. Esta limpieza no implementa una sesión nueva, perfiles ni
sincronización local↔nube. La migración de ese canje y de sus concesiones
heredadas requiere la parte de sesión nativa; no se restaura el BFF.

Los lectores del prototipo de uso, organización y directorio se retiran.
`src/features/settings/HarnessInsights.tsx` muestra un estado no disponible
sin red. No se reemplazan por otra URL ni por datos fabricados.

La web mantiene su sesión por cookie en `src/web/platform-session.ts` y las
rutas existentes de identity y workspaces del borde. El adaptador compute
anterior queda pendiente de Sprint 0: esta parte no amplía ni decide su contrato.
