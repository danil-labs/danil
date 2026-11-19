const LINKED_SETTINGS = ["cuenta-danil", "emails"];

export function settingsLink(href: string, billingV2: boolean): { target: string | undefined; clean: string | null } {
  const url = new URL(href);
  const wanted = url.searchParams.get("settings");
  if (wanted === null) return { target: undefined, clean: null };
  url.searchParams.delete("settings");
  const billingLink = ["plan", "business", "fiscal"].includes(wanted);
  return { target: billingV2 && billingLink ? "plan" : LINKED_SETTINGS.includes(wanted) ? wanted : undefined, clean: `${url.pathname}${url.search}${url.hash}` };
}

export function takeSettingsParam(billingV2 = false): string | undefined {
  const result = settingsLink(window.location.href, billingV2);
  if (result.clean !== null) window.history.replaceState(null, "", result.clean);
  return result.target;
}
