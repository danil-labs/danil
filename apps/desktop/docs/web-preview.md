# Servidores de tareas en la web

La pestaña de sitio usa `features/sites/WebSite.tsx` en la web y conserva el
visor nativo en Desk. El navegador de la persona dibuja el iframe; la máquina
de la tarea no necesita escritorio gráfico.

Los enlaces HTTP a `localhost`, `127.0.0.1` y `[::1]` conservan puerto, ruta,
query y fragmento. El cliente `packages/computers/src/previews.ts` pide la vista
por el borde, con la máquina y el workspace del motor de la tarea. Requiere
`GET machines/:id` con `preview.available: true`; un servidor antiguo se vuelve
a consultar cada 30 segundos mientras la pestaña siga abierta.

El relay entrega una capacidad temporal y un identificador público separados.
La URL se construye con `DEFAULT_PREVIEW_DOMAIN`; no se acepta una URL arbitraria
de la respuesta. Solo el iframe recibe esa URL. La barra sigue mostrando la
dirección local de la tarea, y el token no se guarda en preferencias.

`preview-session.ts` posee la apertura, renovación, caducidad y cierre. Renovar
no cambia el `src` ni remonta el iframe. Cambiar de contexto o desmontar la
pestaña cancela el intento y libera su arriendo; una respuesta tardía se cierra.
El plazo usa `lease_ttl_ms` contado sobre el reloj monotónico del navegador,
sin comparar su hora con la del servidor. Una renovación que falla por red o
por un error temporal se reintenta con backoff y jitter hasta ese plazo. Los
rechazos de autorización cierran la vista. Si cargar tarda más que los 30 s
del plazo de HEAD, se muestra un aviso y se conserva el arriendo.
Si no se puede enviar DELETE, el arriendo caduca sin renovaciones. El contenido
del iframe nunca se interpreta como un mensaje de confianza de Danil.

La CSP web admite solo `self` y `https://*.daizero.com` para marcos; la política
nativa no cambia. El iframe permite scripts, formularios y su propio origen,
sin navegación superior, popups ni descargas. No usa cookies de terceros para
la autorización de la vista. Las cookies de la aplicación de la tarea siguen
sujetas a las políticas del navegador.
`daizero.com` debe alojar únicamente vistas: CSP permite todo el subdominio y
no puede expresar el prefijo `prv-`. El botón de salida deja la URL temporal
en el historial del navegador; su autorización sigue caducando sin renovación.

La primera versión admite HTTP en el servidor local. HTTPS local, historial
del iframe y sitios externos dentro de la pestaña quedan fuera. El botón de
salida usa la vista remota y nunca el localhost del navegador. El arriendo
sigue dependiendo de que la pestaña de Danil permanezca abierta.

## Comprobaciones

`tests/unit/preview-session.test.ts` comprueba cancelación tardía, renovación,
caducidad y compatibilidad. `packages/computers/test/previews.test.ts` comprueba
el transporte y los destinos. Ambos están registrados en `scripts/verify.mjs`.

El laboratorio `tests/security/preview/` compila los componentes reales de sitio
y Markdown con la CSP de `web.html`, y usa el mock binario de
`danil-contracts/preview-v1`. No usa credenciales ni datos de la plataforma.
Se necesita un certificado TLS local de prueba y Playwright Chromium.

1. Compilar con `PREVIEW_LAB_OUT=<salida> vite build --config tests/security/preview/vite.config.ts`.
2. Ejecutar `node tests/security/preview/server.mjs --contracts <clon-contracts> --dist <salida> --key <key.pem> --cert <cert.pem> --port 18443`.
3. Ejecutar `python tests/security/preview/check.py --port 18443 --output <evidencia>`.

La prueba remapea los hosts solo dentro de Chromium. Comprueba CSS, JS por ruta
absoluta, fetch, WS, clic simple/Ctrl/Meta, ausencia de popover, estabilidad del
iframe tras renovar y 410 al cerrar. No acredita DNS público, Safari ni el
conector desplegado. Para eso hace falta el E2E con el relay y el conector reales.

Para ese E2E, el mismo laboratorio acepta `--lab-control http://127.0.0.1:<puerto>`
y `--fixture-dir <directorio-temporal>` en lugar de `--contracts`. El control
pertenece a `relay/scripts/preview-lab.mjs`, arrancado con el conector Rust real
y una identidad sintética que corresponda al login Linux de prueba. Configurar
el relay con `PREVIEW_HOST_SUFFIX=daizero.com` y `WEB_ORIGINS=https://beta.danil.ai`.
El adaptador `real-backend.mjs` simula únicamente el borde firmante y crea un
Vite real en otro proceso que el conector. `check.py` añade una modificación de
archivo y comprueba HMR a través del túnel, sin remontar el iframe. La salida
identifica expresamente cuál de los dos backends se probó.
