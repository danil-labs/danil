const LINKED_SETTINGS = ["cuenta-danil", "emails"];

export function settingsLink(href: string): { target: string | undefined; clean: string | null } {
  const url = new URL(href);
  const wanted = url.searchParams.get("settings");
  if (wanted === null) return { target: undefined, clean: null };
  url.searchParams.delete("settings");
  const billingLink = ["plan", "business", "fiscal"].includes(wanted);
  return { target: billingLink ? "plan" : LINKED_SETTINGS.includes(wanted) ? wanted : undefined, clean: `${url.pathname}${url.search}${url.hash}` };
}

export function takeSettingsParam(): string | undefined {
  const result = settingsLink(window.location.href);
  if (result.clean !== null) window.history.replaceState(null, "", result.clean);
  return result.target;
}
