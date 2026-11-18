export type BillingScope = "billing.read" | "billing.manage" | "billing.subscription.cancel" | "credits.read" | "credits.purchase";

export function billingScopes(role: string): BillingScope[] {
  switch (role) {
    case "owner": return ["billing.read", "billing.manage", "billing.subscription.cancel", "credits.read", "credits.purchase"];
    case "admin": return ["billing.read", "billing.manage", "credits.read", "credits.purchase"];
    case "member": return ["credits.read"];
    default: return [];
  }
}
