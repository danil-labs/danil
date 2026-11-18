const LINKED_SETTINGS = ["cuenta-danil", "emails", "business", "fiscal"];

export function settingsLink(href: string, billingV2: boolean): { target: string | undefined; clean: string | null } {
  const url = new URL(href);
  const wanted = url.searchParams.get("settings");
  if (wanted === null) return { target: undefined, clean: null };
  url.searchParams.delete("settings");
  return { target: LINKED_SETTINGS.includes(wanted) || (billingV2 && wanted === "plan") ? wanted : undefined, clean: `${url.pathname}${url.search}${url.hash}` };
}

export function takeSettingsParam(billingV2: boolean): string | undefined {
  const result = settingsLink(window.location.href, billingV2);
  if (result.clean !== null) window.history.replaceState(null, "", result.clean);
  return result.target;
}
