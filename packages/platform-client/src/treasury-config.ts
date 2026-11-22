/**
 * Lo que entra y sale de treasury sin ser una respuesta del borde: el sobre de una lectura por contexto
 * (`GroupReply`) y la elección de plan del checkout (`PlanChoice`, del cuerpo `CheckoutUpgradeCreate`).
 * Las respuestas (`Catalog`, `OrganizationBilling`, `Balance`, `Checkout`…) salen del OpenAPI de billing-v2
 * en `generated/billing.ts`.
 */
import type { CheckoutUpgradeCreate } from "./generated/billing.ts";

/** La respuesta de una lectura por contexto (saldo o promoción de un grupo). */
export type GroupReply = { status: number; body?: unknown; retry_after_ms?: number };

/** El plan que se compra: `plan_key` y `variant` del cuerpo del checkout. */
export type PlanChoice = Pick<CheckoutUpgradeCreate, "plan_key" | "variant">;
