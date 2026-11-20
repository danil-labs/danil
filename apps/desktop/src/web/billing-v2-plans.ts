import type { billingV2, PlanChoice } from "./billing-v2-api.ts";

type Catalog = Awaited<ReturnType<ReturnType<typeof billingV2>["catalog"]>>;

type ListedPlan = { id: string; price: Catalog["plans"][number]["price"]; choice: PlanChoice | null; displayName?: string; pricePending?: boolean };

export function checkoutPlans(catalog: Catalog) {
  return catalog.plans.flatMap<ListedPlan>(plan => {
    const key = plan.plan_key;
    if (key === "enterprise") return [{ id: key, price: plan.price, choice: null }];
    if (key !== "pro" && key !== "team") return [];
    const choice: PlanChoice = { plan_key: key };
    const options: ListedPlan[] = [{ id: key, price: plan.price, pricePending: plan.price_pending, choice: plan.sellable && plan.price && !plan.price_pending ? choice : null }];
    if (key === "team") {
      for (const variant of plan.display_variants ?? []) {
        if (variant.plan_key !== key) continue;
        options.push({ id: variant.variant, displayName: variant.display_name, price: plan.price, pricePending: plan.price_pending,
          choice: plan.sellable && plan.price && !plan.price_pending ? { ...choice, variant: variant.variant } : null });
      }
    }
    return options;
  });
}
