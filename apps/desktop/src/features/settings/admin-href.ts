/** El enlace a `/admin` con el workspace activo: así resuelve su organización, no una fija. */
export function adminHref(base: string, workspace: string | null | undefined): string {
  const key = workspace?.trim();
  if (!key) return base;
  const absolute = /^[a-z][a-z0-9+.-]*:\/\//i.test(base);
  const url = new URL(base, "https://admin.invalid");
  url.searchParams.set("workspace", key);
  return absolute ? url.toString() : `${url.pathname}${url.search}${url.hash}`;
}
