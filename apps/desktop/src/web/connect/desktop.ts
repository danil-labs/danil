/**
 * The desktop window's sign-in riding on the device page (docs/desktop-bff-session.md):
 * with these three parameters, approving the device also hands the window its session.
 */
export type DesktopHandoff = { challenge: string; state: string; port: string };

/** The window's PKCE fields from the page URL, or null if any is missing or malformed. */
export function desktopHandoff(search: string): DesktopHandoff | null {
  const query = new URLSearchParams(search);
  const challenge = query.get("challenge") ?? "";
  const state = query.get("state") ?? "";
  const port = query.get("port") ?? "";
  const number = Number(port);
  if (!/^[A-Za-z0-9_-]{43}$/.test(challenge) || !/^[A-Za-z0-9_-]{16,128}$/.test(state) || !/^\d{4,5}$/.test(port) || number < 1024 || number > 65535) return null;
  return { challenge, state, port };
}

/** Only after the device was approved: the entry seals a one-time code and answers where to take it. */
export async function finishDesktop(handoff: DesktopHandoff, origin: string, f: typeof fetch = fetch): Promise<string | null> {
  try {
    const response = await f(`${origin}/auth/desktop/approve`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(handoff),
    });
    if (!response.ok) return null;
    const location = (await response.json())?.location;
    if (typeof location !== "string") return null;
    const url = new URL(location);
    return url.protocol === "http:" && url.hostname === "127.0.0.1" && url.port === handoff.port && url.pathname === "/callback" ? url.href : null;
  } catch {
    return null;
  }
}
