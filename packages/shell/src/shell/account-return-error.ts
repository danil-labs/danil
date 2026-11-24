/** Resuelve visibilidad, mensaje y reintento del aviso de error al agregar una cuenta de Danil. */

export function shouldShowAccountAddError(detail: string | undefined): boolean {
  return detail !== "cancelled";
}

export function canRetryAccountAddError(detail: string | undefined): boolean {
  return detail !== "too_many_contexts";
}

export function accountAddErrorBody(detail: string | undefined, translate: (key: string) => string): string {
  if (detail) {
    const key = `danil.error.${detail}`;
    const specific = translate(key);
    if (specific && specific !== key) return specific;
  }
  return translate("shell.workspaces.add_failed_body");
}
