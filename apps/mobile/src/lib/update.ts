/** La app nativa trae su código consigo; solo la web del teléfono se queda atrás de un deploy (`update.web.ts`). */
export function watchWebBuild(_show: () => void): () => void {
  return () => {};
}

export const reloadApp = () => {};
