# Íconos de la app y de los instaladores

Las fuentes versionadas son los SVG de `src/`. Hay varios íconos, y no se mezclan:

| Fuente | Qué es | Dónde se ve |
|---|---|---|
| `src/app.svg` | La app: el isotipo «ai» plano (navy `#0a0d23`, sin cursor) en un botón blanco de esquina continua, en la grilla de Apple (824 de 1024 px) | Dock, Launchpad, barra de tareas, menú Inicio, AppImage, teléfono |
| `src/tray.svg` | El isotipo en una sola tinta (negro, fondo transparente) en 22 pt: `tray.png` y `tray@2x.png` | Barra de menús de macOS, como imagen plantilla (`extracted/tray.rs`); Windows y Linux usan el ícono de la app |
| `src/favicon.svg` | El isotipo solo; tinta navy o blanca según `prefers-color-scheme` | Pestaña del navegador (`../../web-public/`, con `favicon.png` y `apple-touch-icon.png`) |
| `src/mcp-light.svg`, `src/mcp-dark.svg` | El isotipo sin botón, para fondo claro y oscuro | Lista de conexiones de Claude; ver [MCP.md](MCP.md) |
| `src/installer-macos.svg` | El disco del `.dmg`: una placa clara con una flecha de descarga | Escritorio y Finder mientras el disco está montado (`../macos/volume.icns`) |
| `src/installer-windows.svg` | El `setup.exe`: el ícono de la app con una insignia de instalar | Descargas de Windows (`../windows/installer.ico`) |
| `src/dmg-background.svg` | La ventana del `.dmg` (660×400): «Arrastra Danil a Aplicaciones» | Al abrir el `.dmg` (`../macos/dmg-background*.png`) |
| `src/nsis-sidebar.svg`, `src/nsis-header.svg` | La barra lateral (164×314) y el encabezado (150×57) del asistente de NSIS | Instalador de Windows (`../windows/nsis-*.bmp`, BMP de 24 bits) |
| `src/phone-*.svg`, `src/android-*.svg` | La app a sangre (iOS y la PWA recortan la forma) y las capas del ícono adaptativo de Android | `apps/mobile/assets` y `apps/mobile/public/icons` |

El instalador se dibuja distinto de la app a propósito: si el disco montado se
ve igual que la app, la gente abre la app desde el disco en vez de copiarlo.

## Regenerar

Los SVG se rasterizan con Chrome sin ventana (transparente):

```bash
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
render() { "$CHROME" --headless=new --hide-scrollbars --default-background-color=00000000 \
  --force-device-scale-factor="${4:-1}" --window-size="$2" --screenshot="$3" "file://$PWD/src/$1.svg"; }
render app 1024,1024 source-1024.png
render installer-macos 1024,1024 /tmp/volume-1024.png
render installer-windows 1024,1024 /tmp/installer-1024.png
render dmg-background 660,400 ../macos/dmg-background.png
render dmg-background 660,400 ../macos/dmg-background@2x.png 2
```

La app, desde `apps/desktop`; retira `android/` e `ios/`, que la app de
teléfono tiene sus propios íconos en `apps/mobile/assets` y `apps/mobile/public/icons`:

```bash
pnpm tauri icon src-tauri/icons/source-1024.png
```

Lo que no es la app, a su tamaño: `tray.png` (22 px) y `tray@2x.png` (44 px) desde
`src/tray.svg`; en `apps/desktop/web-public/`, `favicon.svg` (copia de
`src/favicon.svg`), `favicon.png` (64 px), `apple-touch-icon.png` (180 px, de
`phone-icon.svg`) y `mcp/` (los dos SVG de MCP y su PNG de 256 px). Cuando el SVG no
es cuadrado de 1024, mételo en un `<img width=N height=N>` y captura esa página.

Los instaladores (las imágenes de NSIS se rasterizan igual y se pasan a BMP con
`magick <png> -background white -alpha remove -type TrueColor BMP3:<bmp>`):

```bash
mkdir /tmp/volume.iconset
for s in 16 32 128 256 512; do
  sips -z $s $s /tmp/volume-1024.png --out /tmp/volume.iconset/icon_${s}x${s}.png
  sips -z $((s*2)) $((s*2)) /tmp/volume-1024.png --out /tmp/volume.iconset/icon_${s}x${s}@2x.png
done
iconutil -c icns /tmp/volume.iconset -o ../macos/volume.icns
for s in 16 24 32 48 64 256; do magick /tmp/installer-1024.png -resize ${s}x${s} /tmp/w$s.png; done
magick /tmp/w16.png /tmp/w24.png /tmp/w32.png /tmp/w48.png /tmp/w64.png /tmp/w256.png ../windows/installer.ico
```

El `.dmg` publicado lo arma `dmgbuild` con `../macos/dmg-settings.py` en
`.github/workflows/publish.yml`; las posiciones de los íconos coinciden con la
flecha del fondo.
