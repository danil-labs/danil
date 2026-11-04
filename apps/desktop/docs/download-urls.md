# Descargas del escritorio: qué sirve danil.ai/download/

Desde la 0.3.0 la app se llama Danil. Las descargas viven en
`https://danil.ai/download/` (decisión del 2026-11-02). La landing es de la
persona; este documento dice qué rutas debe servir. `publish.yml` publica los
archivos en GitHub y el README y npx enlazan a estas rutas.

## Lo que publica cada release

`publish.yml` sube a `github.com/danil-labs/danil/releases/download/v<versión>/`:

| Archivo estable | Para quién |
|---|---|
| `Danil-Windows-Setup.exe` | Windows 10/11, 64 bits |
| `Danil-macOS.dmg` | macOS (DMG universal) |
| `Danil-macOS-Intel.dmg` | La misma copia, para quien busca «Intel» |
| `Danil-Linux-x86_64.AppImage` | Linux x86_64 |

También sube los versionados (`Danil_<v>_x64-setup.exe`,
`Danil_<v>_universal.dmg`, `Danil_<v>_amd64.AppImage`, `Danil.app.tar.gz` con
sus `.sig`) y `latest.json`. Durante la transición sube además
`Terminus-Windows-Setup.exe`, `Terminus-macOS.dmg`, `Terminus-macOS-Intel.dmg`
y `Terminus-Linux-x86_64.AppImage`, que son copias byte a byte de los `Danil-*`.

`releases/latest/download/<archivo>` resuelve siempre a la última release
publicada. Una pre-release no aparece ahí.

## Rutas que sirve danil.ai

| Ruta | Respuesta |
|---|---|
| `https://danil.ai/download/` | Página de descarga con los cuatro botones de abajo |
| `https://danil.ai/download/Danil-Windows-Setup.exe` | `302` → `https://github.com/danil-labs/danil/releases/latest/download/Danil-Windows-Setup.exe` |
| `https://danil.ai/download/Danil-macOS.dmg` | `302` → `…/releases/latest/download/Danil-macOS.dmg` |
| `https://danil.ai/download/Danil-macOS-Intel.dmg` | `302` → `…/releases/latest/download/Danil-macOS-Intel.dmg` |
| `https://danil.ai/download/Danil-Linux-x86_64.AppImage` | `302` → `…/releases/latest/download/Danil-Linux-x86_64.AppImage` |

Usa `302` y no `301` para los archivos: el destino cambia con cada release, y
un `301` lo guarda el navegador en caché.

## Orden

`releases/latest` ignora las pre-releases. Mientras la última release normal sea
una 0.2.x, `releases/latest/download/Danil-*` da 404. Por eso:

1. Se publica la 0.3.0 como release normal, o se promueve la pre-release ya
   probada, con los archivos `Danil-*`.
2. Se comprueba que las cuatro URL `releases/latest/download/Danil-*` y las
   cuatro `Terminus-*` responden 200.
3. Solo entonces `danil.ai/download/` empieza a redirigir a `Danil-*` y se
   ponen las redirecciones de abajo. Hasta ese momento, la página puede
   seguir enlazando los `Terminus-*`, que existen en todas las releases.

## Redirecciones de las direcciones viejas

| Ruta vieja | Respuesta |
|---|---|
| `https://terminus.danil.ai/` y cualquier página | `301` → `https://danil.ai/download/` |
| `https://terminus.danil.ai/Terminus-Windows-Setup.exe` | `302` → `https://danil.ai/download/Danil-Windows-Setup.exe` |
| `https://terminus.danil.ai/Terminus-macOS.dmg` | `302` → `https://danil.ai/download/Danil-macOS.dmg` |
| `https://terminus.danil.ai/Terminus-macOS-Intel.dmg` | `302` → `https://danil.ai/download/Danil-macOS-Intel.dmg` |
| `https://terminus.danil.ai/Terminus-Linux-x86_64.AppImage` | `302` → `https://danil.ai/download/Danil-Linux-x86_64.AppImage` |
| `https://danil.ai/terminus/` y `https://danil.ai/terminus/*` | `301` → `https://danil.ai/download/` |

Regla general para cualquier archivo viejo: `Terminus-<resto>` →
`/download/Danil-<resto>`.

## Lo que no pasa por aquí

- **El updater de la app instalada** lee
  `github.com/danil-labs/danil/releases/latest/download/latest.json`, que está
  fijado dentro de cada binario. No usa danil.ai, y renombrar el repositorio en
  GitHub solo funciona mientras GitHub mantenga la redirección del nombre viejo.
- **npx** (`npx @danil-labs/terminus`) también resuelve por `latest.json`. Enlaza
  a `https://danil.ai/download/` solo como descarga manual.
- **La web** (`app.danil.ai/terminus` → `alfa-app.danil.ai`) es otra cosa; sus
  redirecciones están en `web-redirect/`.

## Comprobación tras publicar

```sh
for f in Danil-Windows-Setup.exe Danil-macOS.dmg Danil-macOS-Intel.dmg Danil-Linux-x86_64.AppImage; do
  curl -fsSIL -o /dev/null -w "%{http_code} %{url_effective}\n" "https://danil.ai/download/$f"
done
curl -sI https://terminus.danil.ai/Terminus-Windows-Setup.exe | grep -i '^location'
```

Cada línea debe terminar en `200` con una URL de `objects.githubusercontent.com`
(o `release-assets.githubusercontent.com`). La última debe dar `location:
https://danil.ai/download/Danil-Windows-Setup.exe`.
