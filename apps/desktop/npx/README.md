# @danil-labs/terminus

Instala **Danil** (la app de escritorio) con un solo comando:

```bash
npx @danil-labs/terminus
```

Es un canal de distribución para desarrolladores —que ya tienen Node— adicional
a los instaladores que se bajan a mano desde [danil.ai/download](https://danil.ai/download/).
Funciona en Windows, macOS (Apple Silicon e Intel) y Linux x86_64.

Este paquete instala la app; su único bin `danil-terminus` es el
instalador de escritorio. `danil` y `dn` se configuran por separado; consulta la
[guía del CLI](../docs/danil-cli.md). El nombre del paquete y las rutas de
descarga conservan compatibilidad con las instalaciones existentes.

## Qué hace

1. Detecta tu sistema operativo y arquitectura (`process.platform` / `process.arch`).
2. Lee `latest.json` de la última release pública de
   [`danil-labs/terminus`](https://github.com/danil-labs/terminus/releases/latest)
   (repo público, sin autenticación) y resuelve el instalador de tu plataforma.
3. Descarga el instalador a una carpeta temporal, con barra de progreso.
4. **Verifica su firma antes de ejecutar ni copiar nada.** Si la verificación
   falla, borra la descarga y sale con error — nunca ejecuta un binario no
   verificado.
5. En Windows lanza el instalador; en macOS descomprime la app y la deja en
   `/Applications`; en Linux deja el AppImage en
   `~/Applications/Terminus.AppImage`, ejecutable. A partir de ahí, la app se
   actualiza sola.

El comando selecciona Windows x64, Mac Apple Silicon, Mac Intel o Linux x86_64
según la entrada disponible en `latest.json`. El workflow universal asigna el
mismo archivo y firma a `darwin-aarch64` y `darwin-x86_64`. Si falta la entrada
de una plataforma —por ejemplo, una release anterior a la que trajo Linux—,
informa que no hay build y termina con error. No hace falta cambiar el comando.

**En Linux** no hay instalador que ejecutar: el AppImage es un ejecutable
portátil. Se copia a `~/Applications/Terminus.AppImage` (la misma ruta que usa
`prod:install` en el repo de la app), con permiso de ejecución, y se abre con:

```bash
~/Applications/Terminus.AppImage
```

o con doble clic desde el explorador de archivos. No pide administrador. Si ya
había una copia, la reemplaza; si estaba abierta, sigue con la versión vieja
hasta que se reinicie. Un AppImage necesita `libfuse2` (en Ubuntu:
`sudo apt install libfuse2`); sin él, se abre con
`~/Applications/Terminus.AppImage --appimage-extract-and-run`.

**En macOS este canal se salta el diálogo de «desarrollador no verificado».** La
cuarentena la pone quien descarga —el navegador—, no el archivo: bajado con
`fetch` y descomprimido con `tar`, el `.app` nace sin ese atributo. El `.dmg` de
la página sí lo lleva. No es un atajo de seguridad: la firma minisign se
comprueba igual, contra la misma llave que la app usa para actualizarse, y sin
ella no se llega a copiar nada.

## Opciones

| Opción | Efecto |
|---|---|
| `-n`, `--dry-run` | Descarga y verifica, pero **no** instala ni ejecuta nada. |
| `-h`, `--help` | Muestra la ayuda. |

## Verificación de integridad

El nivel logrado es **firma minisign completa**, no un simple SHA-256:

- El instalador está firmado con **minisign en modo hashed** (prehash
  BLAKE2b-512 + Ed25519) — la firma que genera el updater de Tauri. La clave
  pública está embebida en la app (`tauri.conf.json` → `plugins.updater.pubkey`)
  y se copia como constante en `bin.mjs`. Es pública por diseño.
- Se verifican **las dos firmas** del archivo minisign: la del **contenido**
  (prueba que los bytes descargados son los firmados) y la del **comentario de
  confianza** (autentica el nombre del archivo firmado).
- Además se comprueba que el `keyId` de la firma coincide con el de la clave, y
  que el nombre del archivo firmado es el esperado.
- Todo con el módulo `crypto` nativo de Node — **cero dependencias**. Node 18+
  trae `blake2b512` (vía OpenSSL) y verificación Ed25519 nativa.

Como transparencia se imprime también el SHA-256 del archivo, pero la garantía
fuerte es la firma minisign, no el hash.

## Idioma

Los mensajes salen en español si el sistema está en español y en inglés en
cualquier otro caso. Se decide por `LC_ALL`, `LC_MESSAGES` o `LANG` (el primero
que diga algo distinto de `C`/`POSIX`) y, si ninguno lo dice —lo normal en
Windows—, por el idioma que reporta `Intl`. Para forzarlo:
`LC_ALL=es_MX.UTF-8 npx @danil-labs/terminus` o `LC_ALL=en_US.UTF-8 …`.

## Requisitos

- **Node.js 18 o superior** (usa `fetch` y Web Streams nativos).
- Sin dependencias de terceros.

## Cómo se resuelve el asset

`latest.json` es la fuente de verdad: trae la versión, la URL exacta del
artefacto firmado y su firma embebida. Se descarga y verifica **ese** artefacto
—el que la firma cubre—, no el alias de nombre estable
`Danil-Windows-Setup.exe` (que es una copia byte a byte, pero no dependemos
de esa suposición: verificamos exactamente lo firmado).

En macOS lo que trae el manifiesto **no es el `.dmg`**: es el `.app` comprimido,
el mismo artefacto que la app usa para actualizarse sola. El `.dmg` existe para
quien baja de la página y no lleva firma minisign, así que este canal usa el que
sí la lleva. Por eso instalar aquí es descomprimir y copiar, no abrir un
instalador.

En Linux lo que trae el manifiesto es el `.AppImage` firmado, el mismo que usa
el updater de la app; es el archivo que se verifica y el que se deja en
`~/Applications`.

## Desarrollo / prueba local

```bash
node bin.mjs --dry-run   # descarga + verifica contra la release real, sin instalar
LC_ALL=es_MX.UTF-8 node bin.mjs --dry-run   # los mensajes en español
npm pack                 # genera el tarball para inspección
```
