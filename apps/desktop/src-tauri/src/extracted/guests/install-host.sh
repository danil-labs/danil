#!/bin/sh
# Instala Seldon Host (el motor de Terminus) en esta máquina para el usuario
# que lo corre, como servicio suyo (systemd --user en Linux, launchd en macOS),
# y la conecta a su cuenta de Danil con un código. Sin sudo.
#
#   curl -fsSL <base>/install.sh | sh
#   curl -fsSL <base>/install.sh | sh -s -- --name "VPS Hetzner"
#
# Opciones: --name <nombre>  --no-connect  --no-service  --home <carpeta>
# Entorno: SELDON_HOST_BASE_URL (de dónde bajar el paquete), SELDON_HOME,
# DANIL_COMPUTERS_URL (plano de control; staging o pruebas).
# Deja `danil` y `dn` en ~/.local/bin y el perfil `host` en ~/.config/terminus/engine.json.
# Volver a correrlo actualiza el motor y reutiliza la misma computadora.
set -eu

# Los rellena el empaquetado (scripts/host-install/package.py) al publicar.
BASE_URL='@BASE_URL@'
VERSION='@VERSION@'
SHA_x86_64_unknown_linux_gnu='@SHA_x86_64_unknown_linux_gnu@'
SHA_aarch64_unknown_linux_gnu='@SHA_aarch64_unknown_linux_gnu@'
SHA_x86_64_apple_darwin='@SHA_x86_64_apple_darwin@'
SHA_aarch64_apple_darwin='@SHA_aarch64_apple_darwin@'

LABEL=ai.danil.seldon.host
UNIT=seldon-host
# Como environment/disk_space.rs: holgura de 1 GiB más tres veces lo que se baja.
SLACK_KB=1048576

say() { printf '%s\n' "$*"; }
fail() {
  # Tramo, causa y arreglo, como `danil machines connect`.
  printf '✗ %s\n  Tramo: %s\n  Arréglalo: %s\n' "$2" "$1" "$3" >&2
  exit 1
}

name='' connect=yes service=yes home=${SELDON_HOME:-}
while [ $# -gt 0 ]; do
  case "$1" in
    --name) [ $# -ge 2 ] || fail instalador "Falta el valor de --name." 'usa --name "Mi VPS".'; name=$2; shift 2;;
    --no-connect) connect=no; shift;;
    --no-service) service=no; shift;;
    --home) [ $# -ge 2 ] || fail instalador "Falta el valor de --home." 'usa --home /ruta/absoluta.'; home=$2; shift 2;;
    -h|--help) sed -n '2,13p' "$0" 2>/dev/null || true; exit 0;;
    *) fail instalador "Opción desconocida: $1" 'usa --name, --no-connect, --no-service o --home.';;
  esac
done

[ "$(id -u)" != 0 ] || fail instalador "No corras el instalador como root." \
  "córrelo con tu usuario: el motor, su bóveda y tus agentes son tuyos, no del sistema."
: "${HOME:?}"

# --- plataforma
os=$(uname -s) arch=$(uname -m)
case "$os/$arch" in
  Linux/x86_64|Linux/amd64) target=x86_64-unknown-linux-gnu;;
  Linux/aarch64|Linux/arm64) target=aarch64-unknown-linux-gnu;;
  Darwin/arm64) target=aarch64-apple-darwin;;
  Darwin/x86_64) target=x86_64-apple-darwin;;
  *) fail plataforma "No hay Seldon Host para $os $arch." "usa Linux (x86_64 o arm64) o macOS.";;
esac
if [ "$os" = Linux ] && { ldd --version 2>&1 || true; } | grep -qi musl; then
  fail plataforma "Esta distribución usa musl (Alpine) y el motor necesita glibc." \
    "usa una imagen con glibc 2.35 o más nueva (Debian 12, Ubuntu 22.04+, Fedora)."
fi
for tool in curl tar cmp; do
  command -v "$tool" >/dev/null || fail plataforma "Falta \`$tool\`." "instálalo con el gestor de paquetes del sistema y vuelve a correr esto."
done

if [ -z "$home" ]; then
  if [ "$os" = Darwin ]; then home="$HOME/Library/Application Support/$LABEL"
  else home="${XDG_DATA_HOME:-$HOME/.local/share}/seldon-host"; fi
fi
case "$home" in /*) ;; *) fail instalador "La carpeta debe ser absoluta: $home" "usa --home /ruta/absoluta.";; esac

# --- paquete
base=${SELDON_HOST_BASE_URL:-$BASE_URL}
case "$base" in @*|'') fail descarga "Este instalador no trae de dónde bajar el motor." \
  "usa el que publica Danil (alfa-app.danil.ai/install.sh) o pon SELDON_HOST_BASE_URL.";; esac
base=${base%/}
asset="seldon-host-$target.tar.gz"
case "$target" in
  x86_64-unknown-linux-gnu) sha=$SHA_x86_64_unknown_linux_gnu;;
  aarch64-unknown-linux-gnu) sha=$SHA_aarch64_unknown_linux_gnu;;
  x86_64-apple-darwin) sha=$SHA_x86_64_apple_darwin;;
  *) sha=$SHA_aarch64_apple_darwin;;
esac
case "$sha" in @*) sha='';; esac

mkdir -p "$home"
chmod 0700 "$home"
size_kb=$(curl -fsSIL "$base/$asset" 2>/dev/null | tr -d '\r' | awk 'tolower($1)=="content-length:"{n=$2} END{print int(n/1024)}')
[ -n "$size_kb" ] && [ "$size_kb" -gt 0 ] || size_kb=153600
need_kb=$((SLACK_KB + 3 * size_kb))
free_kb=$(df -Pk "$home" 2>/dev/null | awk 'NR==2{print $4}')
if [ -n "$free_kb" ] && [ "$free_kb" -lt "$need_kb" ]; then
  fail disco "No cabe en el disco: hacen falta $((need_kb / 1024)) MB libres en $home y hay $((free_kb / 1024)) MB." \
    "libera espacio o instala en otro volumen con --home."
fi

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
say "Bajando Seldon Host para ${target}…"
curl -fsSL --retry 3 -o "$tmp/$asset" "$base/$asset" \
  || fail descarga "No se pudo bajar $base/$asset." "revisa la salida HTTPS de esta máquina (proxy, firewall) y vuelve a correr esto."
if [ -z "$sha" ]; then
  sha=$(curl -fsSL --retry 3 "$base/$asset.sha256" | awk '{print $1}') \
    || fail descarga "No se pudo bajar la huella de $asset." "vuelve a correr esto en un momento."
fi
if command -v sha256sum >/dev/null; then got=$(sha256sum "$tmp/$asset" | awk '{print $1}')
else got=$(shasum -a 256 "$tmp/$asset" | awk '{print $1}'); fi
[ "$got" = "$sha" ] || fail descarga "El paquete bajado no coincide con su huella (SHA-256)." \
  "vuelve a correr esto; si se repite, avísale a Danil: alguien pudo cambiar el archivo en el camino."
tar -xzf "$tmp/$asset" -C "$tmp"
pkg="$tmp/seldon-host-$target"
[ -x "$pkg/seldon-runtime" ] || fail descarga "El paquete no trae el motor." "avísale a Danil; el paquete $asset está mal armado."
if [ ! -f "$pkg/resources/work-tools/$target/manifest.json" ]; then
  command -v git >/dev/null || say "Aviso: no hay git; los agentes lo necesitan para trabajar en repositorios."
fi
# El motor enlaza libdbus (llavero de Secret Service); una imagen mínima no la trae.
if [ "$os" = Linux ] && command -v ldd >/dev/null; then
  missing=$(ldd "$pkg/seldon-runtime" 2>/dev/null | awk '/not found/{print $1}' | tr '\n' ' ')
  if [ -n "$missing" ]; then
    case "$missing" in
      *libdbus*)
        if command -v apt-get >/dev/null; then fix="sudo apt-get install -y libdbus-1-3"
        elif command -v dnf >/dev/null; then fix="sudo dnf install -y dbus-libs"
        elif command -v pacman >/dev/null; then fix="sudo pacman -S dbus"
        else fix="instala la biblioteca de D-Bus (libdbus-1) con el gestor de paquetes"; fi;;
      *) fix="instala con el gestor de paquetes lo que da: $missing";;
    esac
    fail plataforma "Faltan bibliotecas del sistema: $missing" "$fix y vuelve a correr esto."
  fi
fi
release=$(cat "$pkg/VERSION" 2>/dev/null || printf %s "$VERSION")
case "$release" in *[!A-Za-z0-9._-]*|'') fail descarga "El paquete trae una versión inválida." "avísale a Danil.";; esac

# Preflight de ambos nombres: nunca reemplaza un archivo o enlace de otra herramienta.
for command_name in danil dn; do
  launcher="$HOME/.local/bin/$command_name"
  if [ -e "$launcher" ] || [ -L "$launcher" ]; then
    if [ ! -L "$launcher" ] || [ ! -e "$launcher" ] || [ "$(readlink "$launcher")" != "$home/current/seldon-runtime" ]; then
      fail instalador "Colisión en $launcher; no pertenece a esta instalación." "elige otra ruta o retira ese archivo por tu cuenta."
    fi
  fi
done

# --- instalación (la versión activa y la anterior; las demás se borran)
dest="$home/releases/$release"
# --- instalación inmutable: motor y recursos del mismo paquete.
# Conservamos releases: un motor o una herramienta anterior aún puede usarlas.
release_key="$release-$sha"
dest="$home/releases/$release_key"
if [ ! -x "$dest/seldon-runtime" ] || [ "$(cat "$dest/sha256" 2>/dev/null)" != "$sha" ]; then
  [ ! -e "$dest" ] || fail instalador "La release $release_key ya existe con contenido incompleto." "conserva esa carpeta para los procesos activos e instala una release nueva."
  rm -rf "$dest.new"
  mkdir -p "$dest.new"
  cp "$pkg/seldon-runtime" "$dest.new/seldon-runtime"
  mkdir -p "$dest.new/resources"
  [ ! -d "$pkg/resources" ] || cp -R "$pkg/resources/." "$dest.new/resources/"
  cp "$pkg"/THIRD-PARTY-NOTICES*.txt "$dest.new/" 2>/dev/null || true
  printf '%s\n' "$sha" > "$dest.new/sha256"
  chmod 0755 "$dest.new/seldon-runtime"
  # Gatekeeper no bloquea un binario bajado con curl; la marca se quita por si acaso.
  [ "$os" != Darwin ] || xattr -dr com.apple.quarantine "$dest.new" 2>/dev/null || true
  mv "$dest.new" "$dest"
fi
ln -sfn "releases/$release_key" "$home/current.new"
# Sin -T (GNU) o -h (BSD), mv entra en el directorio al que apunta `current`.
mv -fT "$home/current.new" "$home/current" 2>/dev/null || mv -fh "$home/current.new" "$home/current" 2>/dev/null \
  || { rm -f "$home/current"; mv "$home/current.new" "$home/current"; }

mkdir -p "$home/bin"
[ -d "$home/data" ] || mkdir -m 0700 "$home/data"
# La maestra de la bóveda: sin llavero en una máquina sin sesión gráfica, llega
# al motor por descriptor (--master-fd) desde este archivo solo del usuario.
if [ ! -s "$home/master" ]; then
  (umask 077; head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n' > "$home/master.new")
  mv "$home/master.new" "$home/master"
fi
chmod 0600 "$home/master"

# Quién lo supervisa, antes de escribir el lanzador: con systemd de usuario o
# launchd el motor queda residente (no se cierra sin clientes; el supervisor lo
# relanzaría con otro puerto y otro token). En segundo plano, sin supervisor,
# conserva el cierre por inactividad. No depende de --no-connect.
supervisor=none
if [ "$service" = yes ] && [ "$os" = Linux ]; then
  if systemctl --user show-environment >/dev/null 2>&1; then supervisor=systemd
  else say "Aviso: no hay systemd de usuario aquí (contenedor o WSL sin systemd); el motor corre en segundo plano hasta reiniciar."; fi
elif [ "$service" = yes ] && [ "$os" = Darwin ]; then
  supervisor=launchd
fi
resident=''
[ "$supervisor" = none ] || resident=' --resident'

cat > "$home/bin/seldon-host" <<EOF
#!/bin/sh
# Arranca el motor de este usuario (lo escribió install.sh; se reescribe al actualizar).
set -eu
exec 3<"$home/master"
exec "$dest/seldon-runtime" --data-dir "$home/data" --resource-dir "$dest/resources" --identity $LABEL --master-fd 3$resident
EOF
chmod 0755 "$home/bin/seldon-host"

# Retira sólo el wrapper histórico exacto de esta instalación; conserva ajenos.
mkdir -p "$HOME/.local/bin"
legacy_engine="$HOME/.local/bin/seldon-runtime"
if [ -f "$legacy_engine" ] && [ ! -L "$legacy_engine" ] && cmp -s "$legacy_engine" - <<EOF
#!/bin/sh
SELDON_HOME="$home" exec "$home/current/seldon-runtime" "\$@"
EOF
then
  rm "$legacy_engine"
fi
# Los dos nombres operativos usan el motor instalado y su engine.json.
for command_name in danil dn; do
  launcher="$HOME/.local/bin/$command_name"
  ln -sfn "$home/current/seldon-runtime" "$launcher"
done
# Sólo retira el alias antiguo si pertenece a esta instalación.
legacy="$HOME/.local/bin/terminus"
if [ -L "$legacy" ] && [ "$(readlink "$legacy")" = "$home/current/seldon-runtime" ]; then
  rm "$legacy"
fi

# --- servicio
extra=''
[ -z "${DANIL_COMPUTERS_URL:-}" ] || extra=$DANIL_COMPUTERS_URL
started=no
if [ "$supervisor" = systemd ]; then
  unitdir="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
  mkdir -p "$unitdir"
  {
    printf '[Unit]\nDescription=Seldon Host (motor de Terminus)\nAfter=network-online.target\n\n[Service]\n'
    printf 'Environment=SELDON_HOME=%s\nEnvironment=SELDON_HEADLESS=1\n' "$home"
    [ -z "$extra" ] || printf 'Environment=DANIL_COMPUTERS_URL=%s\n' "$extra"
    printf 'ExecStart=%s/bin/seldon-host\n' "$home"
    # Sin UMask el servicio hereda 0002 (Ubuntu) y el motor rechaza
    # `executor-releases/` con escritura de grupo.
    printf 'UMask=0077\n'
    # Residente: sale al relevarlo una versión nueva, con stop o si
    # falla; systemd lo relanza ya con `current`.
    printf 'Restart=always\nRestartSec=2\nKillMode=mixed\nOOMPolicy=continue\nTimeoutStopSec=30\n\n[Install]\nWantedBy=default.target\n'
  } > "$unitdir/$UNIT.service"
  systemctl --user daemon-reload
  systemctl --user enable "$UNIT" >/dev/null 2>&1
  systemctl --user restart "$UNIT"
  started=systemd
  if [ "$(loginctl show-user "$(id -un)" -p Linger --value 2>/dev/null || true)" != yes ] \
    && ! loginctl enable-linger "$(id -un)" >/dev/null 2>&1; then
    say "Aviso: el servicio se detiene al cerrar tu sesión. Para que siga tras salir o reiniciar: sudo loginctl enable-linger $(id -un)"
  fi
elif [ "$supervisor" = launchd ]; then
  plist="$HOME/Library/LaunchAgents/$LABEL.plist"
  mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
  {
    printf '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n'
    printf '<plist version="1.0"><dict>\n<key>Label</key><string>%s</string>\n' "$LABEL"
    printf '<key>ProgramArguments</key><array><string>%s/bin/seldon-host</string></array>\n' "$home"
    printf '<key>EnvironmentVariables</key><dict><key>SELDON_HOME</key><string>%s</string><key>SELDON_HEADLESS</key><string>1</string>' "$home"
    [ -z "$extra" ] || printf '<key>DANIL_COMPUTERS_URL</key><string>%s</string>' "$extra"
    printf '</dict>\n<key>RunAtLoad</key><true/>\n<key>KeepAlive</key><true/>\n<key>ThrottleInterval</key><integer>5</integer>\n'
    printf '<key>StandardErrorPath</key><string>%s/Library/Logs/seldon-host.log</string>\n</dict></plist>\n' "$HOME"
  } > "$plist"
  uid=$(id -u)
  domain="gui/$uid"
  launchctl print "$domain" >/dev/null 2>&1 || domain="user/$uid"
  launchctl bootout "$domain/$LABEL" >/dev/null 2>&1 || true
  launchctl bootstrap "$domain" "$plist" \
    || fail servicio "launchd no aceptó el servicio." "revisa \`launchctl print $domain/$LABEL\` y vuelve a correr esto."
  started=launchd
fi
if [ "$started" = no ]; then
  # Sin servicio: en segundo plano para este arranque (contenedores, pruebas).
  # El anterior suelta la carpeta de datos al cerrar (≤ 9 s con el relay).
  pattern="$home/(current|releases/[^/]+)/seldon-runtime --data-dir"
  pkill -f "$pattern" 2>/dev/null || true
  i=0
  while pgrep -f "$pattern" >/dev/null 2>&1 && [ $i -lt 30 ]; do sleep 1; i=$((i + 1)); done
  env SELDON_HOME="$home" SELDON_HEADLESS=1 nohup "$home/bin/seldon-host" >>"$home/seldon-host.out" 2>&1 &
  started=background
fi

# --- engine.json: el perfil `host` de `danil` (D2, D23). `managed` dice el
# comando del servicio: el CLI nunca arranca este motor, que necesita la maestra
# por descriptor (D3).
case "$started" in
  systemd) managed="systemctl --user start $UNIT";;
  launchd) managed="launchctl kickstart $domain/$LABEL";;
  *) managed="env SELDON_HOME='$home' SELDON_HEADLESS=1 nohup '$home/bin/seldon-host' >>'$home/seldon-host.out' 2>&1 &";;
esac
config_dir="$HOME/.config"
case "${XDG_CONFIG_HOME:-}" in /*) config_dir=$XDG_CONFIG_HOME;; esac
config_dir="$config_dir/terminus"
# La huella del ejecutable, no la del paquete (`$sha`).
if command -v sha256sum >/dev/null; then engine_sha=$(sha256sum "$dest/seldon-runtime" | awk '{print $1}')
else engine_sha=$(shasum -a 256 "$dest/seldon-runtime" | awk '{print $1}'); fi
export P_DIR="$config_dir" P_ENGINE="$dest/seldon-runtime" P_SHA="$engine_sha" P_DATA="$home/data" \
  P_RES="$dest/resources" P_ID="$LABEL" P_MANAGED="$managed"
mkdir -p "$config_dir/locks"
if command -v perl >/dev/null && perl -MJSON::PP -e 1 2>/dev/null; then
  # Como la ventana (W1): combina bajo locks/engine.json.lock, conserva los
  # perfiles y campos ajenos y reemplaza por renombrado. Un archivo de otra
  # versión o roto no se toca (sale con 3).
  rc=0
  perl -MJSON::PP -MFcntl=:flock -e '
    my %v = map { my $x = $ENV{"P_$_"}; utf8::decode($x); ($_ => $x) } qw(ENGINE SHA DATA RES ID MANAGED);
    my $dir = $ENV{P_DIR};
    open my $lock, ">>", "$dir/locks/engine.json.lock" or die "$!\n";
    my $until = time + 5;
    until (flock $lock, LOCK_EX | LOCK_NB) { last if time > $until; select undef, undef, undef, 0.2 }
    my $path = "$dir/engine.json";
    my $json = JSON::PP->new->utf8->pretty->canonical;
    my $root = {version => 1, profiles => {}};
    if (open my $in, "<", $path) { local $/; my $raw = <$in>; $root = eval { $json->decode($raw) } }
    exit 3 unless ref $root eq "HASH" && defined $root->{version} && !ref $root->{version} && $root->{version} eq "1";
    $root->{profiles} //= {};
    exit 3 unless ref $root->{profiles} eq "HASH";
    $root->{profiles}{host} = {engine => $v{ENGINE}, sha256 => $v{SHA}, data_dir => $v{DATA}, resource_dir => $v{RES},
      identity => $v{ID}, production => JSON::PP::false, managed => $v{MANAGED}};
    my $default = $root->{default};
    $root->{default} = "host" unless defined $default && !ref $default && exists $root->{profiles}{$default};
    umask 077;
    open my $out, ">", "$path.$$.tmp" or die "$!\n";
    print $out $json->encode($root);
    close $out or die "$!\n";
    rename "$path.$$.tmp", $path or die "$!\n";
  ' || rc=$?
  [ "$rc" = 0 ] || say "Aviso: no se escribió $config_dir/engine.json (código $rc); \`danil\` necesitará --profile o SELDON_HOME=$home."
elif [ ! -e "$config_dir/engine.json" ]; then
  # Sin JSON::PP (perl-base de una imagen mínima) solo se escribe un archivo nuevo.
  esc() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'; }
  mkdir -p "$config_dir"
  (umask 077
   printf '{"version":1,"default":"host","profiles":{"host":{"engine":"%s","sha256":"%s","data_dir":"%s","resource_dir":"%s","identity":"%s","production":false,"managed":"%s"}}}\n' \
     "$(esc "$P_ENGINE")" "$P_SHA" "$(esc "$P_DATA")" "$(esc "$P_RES")" "$P_ID" "$(esc "$P_MANAGED")" > "$config_dir/engine.json.$$.tmp")
  mv -f "$config_dir/engine.json.$$.tmp" "$config_dir/engine.json"
else
  say "Aviso: hay $config_dir/engine.json y falta perl con JSON::PP para combinarlo; el perfil host no se actualizó. Usa SELDON_HOME=$home danil …"
fi
unset P_DIR P_ENGINE P_SHA P_DATA P_RES P_ID P_MANAGED

# El motor escribe su descriptor al quedar listo; `danil machines status` sale con 0
# (conectada) o 3 (sin cuenta) cuando ya contesta.
engine_up() {
  [ -s "$home/data/seldon-endpoint.json" ] || return 1
  rc=0
  "$home/current/seldon-runtime" machines status --data "$home/data" --json >/dev/null 2>&1 || rc=$?
  [ "$rc" = 0 ] || [ "$rc" = 3 ]
}
deadline=$(($(date +%s) + 90))
until engine_up; do
  if [ "$(date +%s)" -gt "$deadline" ]; then
    case "$started" in
      systemd) fix="revisa \`journalctl --user -u $UNIT -n 50\`";;
      launchd) fix="revisa $HOME/Library/Logs/seldon-host.log";;
      *) fix="revisa $home/seldon-host.out";;
    esac
    fail "motor local" "El motor no arrancó en 90 s." "$fix y $home/data/host.log."
  fi
  sleep 1
done
say "✓ Seldon Host $release instalado en $home ($started)."
case ":$PATH:" in *":$HOME/.local/bin:"*) ;; *) say "Aviso: agrega ~/.local/bin a tu PATH para usar \`danil\` y \`dn\`.";; esac

[ "$connect" = yes ] || { say "Conéctala cuando quieras con: danil machines connect --data \"$home/data\""; exit 0; }
if [ -n "$name" ]; then
  exec "$home/current/seldon-runtime" machines connect --data "$home/data" --name "$name"
fi
exec "$home/current/seldon-runtime" machines connect --data "$home/data"
