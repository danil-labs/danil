# Contrato de danil

Este repo contiene los clientes Web y Desk de Danil.
La sesión, el catálogo y el control de máquinas pasan por el borde de plataforma.
El acceso al motor integra RPC1 local en Desk y canal de datos remoto por Relay.

## Contratos que consume

| Operación | Contrato y autenticación |
| --- | --- |
| Login web, sesión, cierre y elección de cuenta | [Identity](https://github.com/danil-labs/identity/blob/main/docs/API.md) por Edge, cookie de sesión y CSRF en escrituras. |
| Login y renovación en Desk | [Identity Desk](https://github.com/danil-labs/identity/blob/main/docs/mvp-edge-contract.md), OAuth con PKCE, portador Bearer tras el canje. |
| Catálogo, selección y administración de workspaces | [Workspaces](https://github.com/danil-labs/workspaces/blob/main/docs/API.md) por Edge. Selección: `POST /v1/workspaces/select` con `Idempotency-Key` y cuerpo `{"workspace":"12"}`. |
| Lista, energía, operación y ticket de máquina | [Relay](https://github.com/danil-labs/relay/blob/main/docs/API.md) por Edge mediante sesión. Canal WebSocket a `connect.danil.ai` con ticket de uso único. |
| Catálogo, compra de plan y créditos | [Treasury](https://github.com/danil-labs/treasury/blob/main/docs/API.md) por Edge, desde el navegador cuando la capacidad está activa. |

Los productores de cada ruta documentan el método, el esquema y el formato de sus errores. Por ejemplo, el ticket puede responder `409 urn:danil:problem:machine_unreachable`. El contrato de protocolo local vive en [packages/protocol](../packages/protocol); los adaptadores de cliente en [packages/computers](../packages/computers) y en [la entrada web](../apps/desktop/src/web). La tabla describe la integración de plataforma observada en [`dev` `4628f506`](https://github.com/danil-labs/danil/tree/4628f50670627e1ac3ab95b6ff1276bf65ed0112), en `packages/computers/src/edge.ts` y `apps/desktop/src/web/billing-v2-api.ts`. Las rutas web de navegador y el IPC local se registran en sus respectivos adaptadores.

## Eventos y dependencias

El cliente consume frames de sesión del motor por Relay y señales locales por IPC. Los eventos de negocio y sus recibos pertenecen a los servicios de plataforma. Edge resuelve el acceso a Identity, Workspaces, Relay y Treasury.

## Beta

Recibo web del 2026-11-20: Worker `danil-web-beta`, commit `1d759d31`, versión `120231e5-4162-4faa-b039-37608a22ed38`, rollback `c007fd04-7b9c-4ad0-94ea-0e64bf69499a`. El corte W1 anterior registró `VITE_DANIL_BILLING_V2` activa. El recibo web no incluye publicación de Desk. El binario distribuido y su rollback, y el estado posterior de las banderas, quedan sin verificar.

[Recibo de despliegue](https://github.com/danil-labs/terminus-workspace/blob/main/docs/release/2026-11-20-beta-selector-y-harness.md).

Código revisado en [danil-labs/danil `main` `17baee10`](https://github.com/danil-labs/danil/tree/17baee1060dd95088ba09cb7bae4dd433e8aaa17).
