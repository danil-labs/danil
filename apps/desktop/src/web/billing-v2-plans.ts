import type { billingV2 } from "../../../../packages/platform-client/src/treasury.ts";
import type { PlanChoice } from "../../../../packages/platform-client/src/treasury-config.ts";

type Catalog = Awaited<ReturnType<ReturnType<typeof billingV2>["catalog"]>>;

type ListedPlan = { id: string; price: Catalog["plans"][number]["price"]; choice: PlanChoice | null; pricePending?: boolean };

export function checkoutPlans(catalog: Catalog) {
  return catalog.plans.flatMap<ListedPlan>(plan => {
    const key = plan.plan_key;
    if (key === "free" || key === "enterprise") return [{ id: key, price: plan.price, choice: null }];
    if (key !== "pro" && key !== "team") return [];
    const choice: PlanChoice | null = plan.sellable && plan.price && !plan.price_pending ? { plan_key: key } : null;
    return [{ id: key, price: plan.price, pricePending: plan.price_pending, choice }];
  });
}
