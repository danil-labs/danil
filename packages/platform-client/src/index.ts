/**
 * Entrada pública de `@danil/platform-client`: clasificación común de respuestas
 * del borde `/v1` para que las features no comparen códigos de ausencia a mano (R10).
 */

/** El borde indica que una ruta o capacidad todavía no existe o no está habilitada (regla 10). */
export function isNotAvailableStatus(status: number): boolean {
  return status === 404 || status === 501;
}
