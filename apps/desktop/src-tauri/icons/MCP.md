# Icono en la lista de conexiones (servidor MCP)

El icono que Claude muestra junto a un conector lo declara el propio servidor en
`serverInfo.icons` de la respuesta a `initialize`. Este repositorio sólo guarda la
marca; el servicio `MCP` de `danil-labs/machines` es quien la devuelve.

## Marca

| Fuente | Fondo del cliente | Tinta |
|---|---|---|
| `src/mcp-light.svg` | claro | navy `#0a0d23` |
| `src/mcp-dark.svg` | oscuro | blanco |

Es el isotipo «ai» sin botón, con fondo transparente en un lienzo de 1024 × 1024:
el cliente pone su propio fondo. Los mismos archivos, y un PNG de 256 px de cada
uno, salen con la web en `apps/desktop/web-public/mcp/`.

## Lo que debe devolver el servidor

```json
"serverInfo": {
  "name": "danil-mcp",
  "title": "Danil",
  "version": "…",
  "icons": [
    { "src": "https://alfa-app.danil.ai/mcp/mcp-light.svg", "mimeType": "image/svg+xml", "sizes": ["any"], "theme": "light" },
    { "src": "https://alfa-app.danil.ai/mcp/mcp-dark.svg",  "mimeType": "image/svg+xml", "sizes": ["any"], "theme": "dark" },
    { "src": "https://alfa-app.danil.ai/mcp/mcp-light-256.png", "mimeType": "image/png", "sizes": ["256x256"], "theme": "light" },
    { "src": "https://alfa-app.danil.ai/mcp/mcp-dark-256.png",  "mimeType": "image/png", "sizes": ["256x256"], "theme": "dark" }
  ]
}
```

- `theme` dice sobre qué fondo se usa el icono: `light` para fondo claro.
- La especificación obliga a los clientes a aceptar PNG y JPEG, y sólo recomienda
  SVG; por eso van los dos formatos.
- Las URL son públicas, con HTTPS y del mismo dominio que el servidor o de uno
  de confianza; sin sesión. Salen de la web de Terminus (base `/terminus/`) en
  cuanto se despliegue; si el servidor prefiere servirlas él, basta copiar
  los archivos y cambiar el prefijo.
