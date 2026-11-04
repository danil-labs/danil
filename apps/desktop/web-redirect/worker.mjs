// La web de Danil ya no vive en app.danil.ai/terminus: vive en la raíz de alfa-app.danil.ai.
// Appv2 reenvía `/terminus` y `/terminus/*` a este Worker (Service Binding TERMINUS_WEB) y aquí
// cada ruta responde 308 a la misma ruta de alfa sin el prefijo, con su query. El 308 conserva el
// método y el cuerpo. `no-store` evita que el navegador guarde la redirección para siempre:
// volver a servir la web aquí es un despliegue, sin cachés que limpiar.
const TARGET = "https://alfa-app.danil.ai";
const LEGACY = /^\/terminus(?=\/|$)/;

export function redirectTarget(requestUrl) {
  const url = new URL(requestUrl);
  // Las barras repetidas se juntan: el destino es siempre una ruta del mismo host.
  const path = url.pathname.replace(LEGACY, "").replace(/^\/+/, "/") || "/";
  return `${TARGET}${path.startsWith("/") ? path : `/${path}`}${url.search}`;
}

export default {
  fetch(request) {
    return new Response(null, {
      status: 308,
      headers: { Location: redirectTarget(request.url), "Cache-Control": "no-store" },
    });
  },
};
