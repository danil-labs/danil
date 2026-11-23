# Descargas del escritorio: qué sirve danil.ai/download/

Desde la 0.3.0 la app se llama Danil. Las descargas viven en
`https://danil.ai/download/` (decisión del 2026-11-02). La landing es de la
persona; este documento dice qué rutas debe servir. `publish.yml` publica los
archivos en GitHub y el README y npx enlazan a estas rutas.

## Lo que publica cada release

`publish.yml` sube a `github.com/danil-labs/danil/releases/download/v<versión>/`
(siempre en staging como prerelease, uno o los tres SO a la vez):

| Archivo estable | Para quién | Manifiesto por SO |
|---|---|---|
| `Danil-Windows-Setup.exe` | Windows 10/11, 64 bits | `latest-windows.json` |
| `Danil-macOS.dmg` | macOS (Apple Silicon) | `latest-darwin.json` |
| `Danil-Linux-x86_64.AppImage` | Linux x86_64 | `latest-linux.json` |

También sube los versionados (`Danil_<v>_x64-setup.exe`,
`Danil_<v>_aarch64.dmg`, `Danil_<v>_amd64.AppImage`, `Danil.app.tar.gz` con
sus `.sig`) y, cuando se construyen las tres plataformas juntas, `latest.json`
combinado para compatibilidad con copias anteriores a `updater-stable`. Durante
la transición sube además `Terminus-Windows-Setup.exe`, `Terminus-macOS.dmg` y
`Terminus-Linux-x86_64.AppImage`, copias byte a byte de los `Danil-*`.

## Puntero por SO (`updater-stable`)

La promoción y el rollback se hacen por SO con
`.github/workflows/promote-update.yml` hacia la release fija `updater-stable`
(`--latest=false`). Cada SO mantiene en `updater-stable`:

- Su manifiesto (`latest-darwin.json`, `latest-windows.json`, `latest-linux.json`),
  que apunta al binario firmado e inmutable dentro de `releases/download/v<versión>/`.
- Sus alias de descarga sin versión (`Danil-*` y `Terminus-*`).

Promover macOS a una versión nueva actualiza únicamente `latest-darwin.json`,
`Danil-macOS.dmg` y `Terminus-macOS.dmg` en `updater-stable`, sin tocar Windows
ni Linux.

## Rutas que sirve danil.ai

| Ruta | Respuesta |
|---|---|
| `https://danil.ai/download/` | Página de descarga con los tres botones de abajo |
| `https://danil.ai/download/Danil-Windows-Setup.exe` | `302` → `https://github.com/danil-labs/danil/releases/download/updater-stable/Danil-Windows-Setup.exe` (transición desde `releases/latest/download/...`) |
| `https://danil.ai/download/Danil-macOS.dmg` | `302` → `…/releases/download/updater-stable/Danil-macOS.dmg` |
| `https://danil.ai/download/Danil-Linux-x86_64.AppImage` | `302` → `…/releases/download/updater-stable/Danil-Linux-x86_64.AppImage` |

Usa `302` y no `301` para los archivos: el destino cambia con cada promoción, y
un `301` lo guarda el navegador en caché.

## Redirecciones de las direcciones viejas

| Ruta vieja | Respuesta |
|---|---|
| `https://terminus.danil.ai/` y cualquier página | `301` → `https://danil.ai/download/` |
| `https://terminus.danil.ai/Terminus-Windows-Setup.exe` | `302` → `https://danil.ai/download/Danil-Windows-Setup.exe` |
| `https://terminus.danil.ai/Terminus-macOS.dmg` | `302` → `https://danil.ai/download/Danil-macOS.dmg` |
| `https://terminus.danil.ai/Terminus-Linux-x86_64.AppImage` | `302` → `https://danil.ai/download/Danil-Linux-x86_64.AppImage` |
| `https://danil.ai/terminus/` y `https://danil.ai/terminus/*` | `301` → `https://danil.ai/download/` |

Regla general para cualquier archivo viejo: `Terminus-<resto>` →
`/download/Danil-<resto>`.

## Lo que no pasa por aquí

- **El updater de la app instalada** lee
  `github.com/danil-labs/danil/releases/download/updater-stable/latest-{{target}}.json`,
  que está fijado dentro de cada binario (`tauri.conf.json`). Las copias
  instaladas en `0.3.2` siguen leyendo `releases/latest/download/latest.json`
  hasta instalar una versión con el endpoint nuevo.
- **npx** (`npx @danil-labs/terminus`) también resuelve por
  `updater-stable/latest-<target>.json`. Enlaza a `https://danil.ai/download/`
  solo como descarga manual.
- **La web** (`app.danil.ai/terminus` → `alfa-app.danil.ai`) es otra cosa; sus
  redirecciones están en `web-redirect/`.

## Comprobación tras promover

```sh
for f in Danil-Windows-Setup.exe Danil-macOS.dmg Danil-Linux-x86_64.AppImage; do
  curl -fsSIL -o /dev/null -w "%{http_code} %{url_effective}\n" "https://danil.ai/download/$f"
done
for target in darwin windows linux; do
  curl -fsSL "https://github.com/danil-labs/danil/releases/download/updater-stable/latest-${target}.json" | jq -r '"'"$target"': \(.version)"'
done
curl -sI https://terminus.danil.ai/Terminus-Windows-Setup.exe | grep -i '^location'
```

Cada archivo debe terminar en `200` con una URL de `objects.githubusercontent.com`
(o `release-assets.githubusercontent.com`). La última debe dar `location:
https://danil.ai/download/Danil-Windows-Setup.exe`.
