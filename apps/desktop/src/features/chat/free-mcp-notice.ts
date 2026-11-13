type NoticeMessage = { role: string; meta?: string; text: string };

/** Las identidades son datos de la fila siguiente, nunca prosa del modelo. */
export function freeMcpNoticeAt(messages: readonly NoticeMessage[], index: number): { names: string[] | null } | null {
  const message = messages[index];
  if (message?.role !== "system" || message.meta !== "aviso" || message.text !== "chat.notice.free_router_mcp_unavailable") return null;
  const next = messages[index + 1];
  if (next?.role !== "system" || next.meta !== "aviso" || next.text.length > 32768) return { names: null };
  try {
    const names: unknown = JSON.parse(next.text);
    return {
      names: Array.isArray(names) && names.every((name) => typeof name === "string")
        ? names.slice(0, 32).map((name: string) => Array.from(name).slice(0, 480).join(""))
        : null,
    };
  } catch {
    return { names: null };
  }
}
