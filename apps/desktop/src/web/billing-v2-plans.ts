import type { billingV2, PlanChoice } from "./billing-v2-api.ts";

type Catalog = Awaited<ReturnType<ReturnType<typeof billingV2>["catalog"]>>;

type ListedPlan = { id: string; price: Catalog["plans"][number]["price"]; choice: PlanChoice | null; displayName?: string };

export function checkoutPlans(catalog: Catalog) {
  return catalog.plans.flatMap<ListedPlan>(plan => {
    const key = plan.plan_key;
    if (key === "enterprise") return [{ id: key, price: plan.price, choice: null }];
    if (key !== "pro" && key !== "team") return [];
    const choice: PlanChoice = { plan_key: key };
    const options: ListedPlan[] = [{ id: key, price: plan.price, choice: plan.sellable && plan.price ? choice : null }];
    const business = key === "team" && plan.display_variants?.find(item => item.variant === "business" && item.plan_key === key && item.edition === "business");
    if (business) {
      options.push({ id: "business", displayName: business.display_name, price: plan.price, choice: plan.sellable && plan.price ? { ...choice, variant: "business" } : null });
    }
    return options;
  });
}
