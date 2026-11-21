const MESSAGES: Record<string, string> = {
  "shell.rail.attention_stale": "Atención sin actualizar",
  "shell.rail.stack_label": "{org}, {n} workspaces",
  "shell.rail.pin_named": "Fijar {name} en la barra",
  "shell.rail.pin": "Fijar en la barra",
  "shell.rail.unpin": "Dejar de fijar",
  "shell.rail.move_org_up": "Subir organización",
  "shell.rail.move_org_down": "Bajar organización",
  "shell.rail.pinned_suffix": ", fijada",
  "shell.rail.tip_account": "{org} · {email}",
  "shell.rail.tip_balance": "Saldo: {amount} en Danil Credits",
  "shell.rail.tip_balance_loading": "Saldo: …",
  "shell.rail.tip_balance_unavailable": "Saldo: No disponible",
  "shell.rail.open": "Abrir",
  "chat.credits.amount": "{count}",
  "settings.workspaces.manage": "Administrar",
  "shell.workspaces.hide": "Ocultar",
  "shell.workspaces.close_org": "Cerrar sesión de {name}",
  "shell.workspaces.close_email": "Cerrar sesión de {email}",
  "shell.workspaces.sessions_failed": "Error al cerrar sesión",
  "shell.workspaces.choose_organization": "Elegir organización",
  "shell.workspaces.web_organization_required": "Se requiere organización",
};

export function t(key: string, data?: Record<string, string | number>): string {
  let text = MESSAGES[key] ?? key;
  if (data) {
    for (const [k, v] of Object.entries(data)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
    }
  }
  return text;
}
