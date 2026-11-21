/**
 * Destinos externos de la feature de cuenta. Las URLs viven en el único archivo
 * de configuración (`@danil/platform-client`, src/config.ts); se abren con host.openExternal.
 */
import { BILLING_URL, HARNESS_URL } from "@danil/platform-client";

export { BILLING_URL, HARNESS_URL };
export const getBillingUrl = (): string => BILLING_URL;
export const getHarnessUrl = (): string => HARNESS_URL;
