#!/bin/sh
# Instala el motor de Linux de Danil en este huésped, sin conectarlo a la nube.
# Uso: engine-install.sh <url del binario> <sha256> <versión> <install.sh>
set -eu
url=$1 sha=$2 ver=$3 installer=$4
case "$(uname -m)" in
  x86_64|amd64) t=x86_64-unknown-linux-gnu ;;
  aarch64|arm64) t=aarch64-unknown-linux-gnu ;;
  *) echo "✗ Arquitectura $(uname -m) sin motor publicado" >&2; exit 2;;
esac
w=$(mktemp -d); trap 'rm -rf "$w"' EXIT
mkdir -p "$w/pkg/seldon-host-$t" "$w/dist"
echo "PASO descargar"
curl -fL --retry 3 --progress-bar -o "$w/pkg/seldon-host-$t/seldon-runtime" "$url"
echo "PASO verificar"
echo "$sha  $w/pkg/seldon-host-$t/seldon-runtime" | sha256sum -c - >/dev/null
chmod 0755 "$w/pkg/seldon-host-$t/seldon-runtime"
printf '%s\n' "$ver" > "$w/pkg/seldon-host-$t/VERSION"
tar -C "$w/pkg" -czf "$w/dist/seldon-host-$t.tar.gz" "seldon-host-$t"
(cd "$w/dist" && sha256sum "seldon-host-$t.tar.gz" > "seldon-host-$t.tar.gz.sha256")
echo "PASO instalar"
SELDON_HOST_BASE_URL="file://$w/dist" sh "$installer" --no-connect
echo "PASO listo"
