import type { CliCommand, SlashMenu } from "./skills";

/**
 * La pregunta de un `/<comando> <pregunta>` que el agente contesta al margen
 * (`agents::AlMargen`), o `null`: sin comando declarado el mensaje va al turno
 * como hoy.
 */
export function preguntaAlMargen(texto: string, comando: string | null): string | null {
  if (!comando) return null;
  const prefijo = `/${comando}`;
  if (texto.slice(0, prefijo.length).toLowerCase() !== prefijo.toLowerCase()) return null;
  const resto = texto.slice(prefijo.length);
  if (!/^\s/.test(resto)) return null;
  return resto.trim() || null;
}

/**
 * Los comandos del menú con la pregunta al margen delante. La descripción es
 * del catálogo: el CLI no lo publica en `-p`, y si lo publica no se repite.
 */
export function comandosConAlMargen(menu: SlashMenu, descripcion: string): CliCommand[] {
  const comando = menu.side_question;
  if (!comando) return menu.commands;
  return [{ name: comando, description: descripcion }, ...menu.commands.filter((c) => c.name !== comando)];
}

/**
 * El borrador con la pregunta y la respuesta detrás. Un texto que empiece por
 * `/` o `!` saldría como comando al mandarlo, y la persona solo quería el texto.
 */
export function alHilo(borrador: string, texto: string): string {
  const seguro = /^[/!]/.test(texto) ? ` ${texto}` : texto;
  return borrador.trim() ? `${borrador}\n\n${seguro}` : seguro;
}
