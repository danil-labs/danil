/**
 * La aritmética de una imagen con zoom y desplazamiento. Pura para poder
 * probarla: el gesto que la usa vive en `ImageViewer.tsx`.
 */

export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 8;
export const ZOOM_STEP = 1.25;

/** El zoom dentro de sus topes. Sin tope, la rueda deja la imagen en un punto. */
export function clampZoom(z: number): number {
  if (!Number.isFinite(z)) return 1;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
}

/** El desplazamiento que deja el punto bajo el cursor quieto al cambiar de zoom. */
export function offsetOnZoom(
  current: { x: number; y: number },
  point: { x: number; y: number },
  before: number,
  after: number,
): { x: number; y: number } {
  const ratio = after / before;
  return {
    x: point.x - (point.x - current.x) * ratio,
    y: point.y - (point.y - current.y) * ratio,
  };
}
