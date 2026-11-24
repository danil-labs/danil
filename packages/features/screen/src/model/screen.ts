/** Nombre RFB anunciado por los motores que admiten entrada sin compartir el portapapeles. */
export const SCREEN_CONTROL_DESKTOP = "Terminus VM control v1";

/** Por qué se cerró el visor; `ended`, cuando ya se había visto la pantalla o por un cierre normal. */
export type ScreenEnd = "offline" | "unavailable" | "busy" | "ended";

export function screenEnd(code: number): ScreenEnd {
  if (code === 4010) return "offline";
  if (code === 4011) return "unavailable";
  if (code === 4013) return "busy";
  return "ended";
}
