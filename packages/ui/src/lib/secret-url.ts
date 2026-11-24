/** Nombres de campo, parámetro o bandera que delatan que lo que sigue es un secreto. */
export const SENSITIVE_NAME = /(?:^|[_-])(?:token|key|secret|password|passwd|pwd|auth|authorization|bearer|credential|credentials|apikey|api-key|api_key|access-key|private)(?:$|[_-])/i;

/** Una URL con contraseña o con un parámetro de nombre sensible. */
export function urlWithCredentials(text: string): boolean {
  let url: URL;
  try {
    url = new URL(text.trim());
  } catch {
    return false;
  }
  if (url.password) return true;
  for (const [name, value] of url.searchParams) if (value && SENSITIVE_NAME.test(name)) return true;
  return false;
}
