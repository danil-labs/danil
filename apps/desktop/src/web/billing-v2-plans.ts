import type { billingV2, PlanChoice } from "./billing-v2-api.ts";

type Catalog = Awaited<ReturnType<ReturnType<typeof billingV2>["catalog"]>>;

export function checkoutPlans(catalog: Catalog) {
  return catalog.plans.flatMap(plan => {
    const key = plan.plan_key;
    if (key === "enterprise") return [{ id: key, price: plan.price, choice: null }];
    if (key !== "pro" && key !== "team") return [];
    const choice: PlanChoice = { plan_key: key };
    const options = [{ id: key, price: plan.price, choice: plan.sellable && plan.price ? choice : null }] as { id: string; price: typeof plan.price; choice: PlanChoice | null }[];
    if (key === "team" && catalog.display_variants?.some(item => item.variant === "business" && item.plan_key === key && item.edition === "business")) {
      options.push({ id: "business", price: null, choice: plan.sellable && plan.price ? { ...choice, variant: "business" } : null });
    }
    return options;
  });
}
