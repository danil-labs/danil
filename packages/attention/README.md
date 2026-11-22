# @terminus/attention

## Qué hace
Cliente del BFF alfa para la bandeja y los canales de Appv2.
Rutas legadas:
- `/terminus/alpha-api`
- `/alpha-api`
Se mantiene congelado únicamente mientras `apps/mobile` lo utilice (corrección de CTO, 2026-11-21).
El front web y Desk no lo usan; está prohibido por la regla R8.

## Qué expone
No tiene `index.ts`; su punto de entrada configurado en `package.json` es `src/inbox.ts`:
- Tipos y funciones de bandeja: `createInbox`, `InboxSession`, `Conversation`, `Message`, `AccountPermissions`, `Account`, `ConversationCounts`, `Page`, `InboxFilter`, `INBOX_FILTERS`, `ConversationLabel`, `normalizeProvider`, `formatPhoneNumber`, `contactIdentifier`, `contactDisplayName`, `contactSubIdentifier`, `humanHasReplied`, `needsHuman`, `conversationLabels`, `matchesFilter`.
- Módulos adicionales alcanzables por ruta directa: `channels.ts`, `customization.ts`, `workspace-account.ts`.
- `messaging.ts`, `broadcasts.ts`, `broadcast-panel.ts`, `support-access.ts` y `service.ts` se borraron en 3.4b: el teléfono no los importa.

## Qué consume
- No consume `@danil/*` ni los clientes nuevos de plataforma o motor.
- Realiza peticiones directas de red contra el BFF alfa legado:
  - prefijo `/terminus/alpha-api`
  - prefijo `/alpha-api`

## Qué contratos toca
- Rutas `/v1` del borde: ninguna.
- Comandos RPC1 del motor: ninguno.
- Toca endpoints legados de Appv2:
  - `/terminus/alpha-api/auth/profile`

## Qué falta según la fase 2 del plan
- En la fase 2 no se mueve código a `packages/ui` ni a features por tratarse de arquitectura vieja prohibida (R8).
- Se mantiene aislado para mobile y se borra íntegramente en la fase 3 una vez migrado el cliente móvil.
- Fuente y detalle: [INVENTORY.md](./INVENTORY.md).
