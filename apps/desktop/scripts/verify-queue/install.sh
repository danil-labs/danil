#!/bin/bash
# Instala o actualiza la cola en la máquina. Corre como root desde esta carpeta.
# Idempotente: una segunda vez solo copia archivos y reinicia los servicios.
set -euo pipefail
here=$(dirname "$(readlink -f "$0")")
state=/var/lib/verify-queue
# Los carriles cuelgan de root: el motor solo corre un ejecutor si cada carpeta de su ruta es de root
# o del usuario que corre, sin escritura para nadie más. La ruta es corta por el tope de los sockets Unix.
lanes_root=/var/lib/vl
rust=/opt/rust
# 1.99.1 es la del perfil del motor (con su rustfmt está formateado dev); 1.97.1, la de sus builds de release.
toolchains="stable 1.97.1 1.99.1"
# Los CLIs de los proveedores que piden las E2E del motor: solo los binarios, sin credenciales.
agents=/opt/verify-agents
claude_version=2.1.316
codex_version=0.166.0

# Los usuarios de corrida salen de repos.json: uno por repo y carril (`<user>` en el carril 0,
# `<user>-<n>` en los demás), sin shell de entrada, sin sudo, sin cron ni at. Su grupo primario es
# `verify-runners`: con él leen los espejos y egress.nft los limita, sin listar nombres.
mapfile -t runners < <(node -e 'const c = require(process.argv[1]); for (const p of Object.values(c.repos)) if (p.user) for (let n = 0; n < (c.lanes ?? 1); n++) console.log(n ? `${p.user}-${n}` : p.user)' "$here/repos.json" | sort -u)
getent group verify-runners >/dev/null || groupadd --system verify-runners
for user in "${runners[@]}"; do
  id -u "$user" >/dev/null 2>&1 || useradd --system --create-home --shell /usr/sbin/nologin -g verify-runners "$user"
  usermod -g verify-runners "$user"
  for deny in /etc/cron.deny /etc/at.deny; do grep -qx "$user" "$deny" 2>/dev/null || echo "$user" >> "$deny"; done
done

# Nada puede escribir en los carriles mientras se instala: se para la cola y lo que corría con ella
# (KillMode=process deja vivos a los hijos de sudo). La cola vuelve a arrancar al salir, también si
# algo falla a la mitad; su recover() marca como interrumpido lo que se cortó.
systemctl stop verify-queue 2>/dev/null || true
trap 'systemctl daemon-reload; systemctl restart verify-queue' EXIT
for user in "${runners[@]}"; do
  for _ in $(seq 20); do
    pkill -KILL -u "$user" 2>/dev/null || true
    pgrep -u "$user" >/dev/null || break
    sleep 0.5
  done
done

# Una toolchain de root y de solo lectura: el HOME de verify es 0750, y una rama no puede envenenarla.
# El registro de cargo de cada carril vive en /var/lib/vl/<n>/<repo>/cargo.
if [ ! -x "$rust/cargo/bin/rustup" ]; then
  init=$(mktemp)
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs -o "$init"
  RUSTUP_HOME=$rust/rustup CARGO_HOME=$rust/cargo sh "$init" -y --no-modify-path --profile minimal --default-toolchain none
  rm -f "$init"
fi
for toolchain in $toolchains; do
  RUSTUP_HOME=$rust/rustup CARGO_HOME=$rust/cargo "$rust/cargo/bin/rustup" toolchain install "$toolchain" --profile minimal -c clippy,rustfmt
done
RUSTUP_HOME=$rust/rustup CARGO_HOME=$rust/cargo "$rust/cargo/bin/rustup" default stable
chmod -R a+rX,go-w "$rust"

# El llavero de laboratorio de las E2E (dbus-run-session + gnome-keyring-daemon).
if ! command -v gnome-keyring-daemon >/dev/null || ! command -v secret-tool >/dev/null; then
  DEBIAN_FRONTEND=noninteractive apt-get install -y -q gnome-keyring libsecret-tools dbus-user-session >/dev/null
fi
for spec in "claude:@anthropic-ai/claude-code:$claude_version" "codex:@openai/codex:$codex_version"; do
  IFS=: read -r cli package version <<<"$spec"
  dir=$agents/$cli/$version
  if [ ! -x "$dir/bin/$cli" ]; then
    npm install -g -q --no-fund --no-audit --prefix "$dir" "$package@$version" >/dev/null
  fi
  chmod -R a+rX,go-w "$agents"
done

# La cola solo puede volverse los usuarios de corrida, y nada más.
sudoers=$(mktemp)
printf 'verify ALL=(%s) NOPASSWD: ALL\n' "$(IFS=,; echo "${runners[*]}")" > "$sudoers"
visudo -cqf "$sudoers"
install -m 0440 "$sudoers" /etc/sudoers.d/verify-queue
rm -f "$sudoers"

# home 0711: los usuarios de corrida lo atraviesan hacia su carril y los espejos, pero no listan ni leen runs/ ni incoming/.
install -d -o verify -g verify -m 0711 "$state"
install -d -o verify -g verify -m 0700 "$state/runs" "$state/incoming"
install -d -o verify -g verify-runners -m 2750 "$state/repos"
install -d -o root -g root -m 0711 "$lanes_root"
lanes=$(node -e 'console.log(require(process.argv[1]).lanes ?? 1)' "$here/repos.json")
for repo in $(node -e 'const c = require(process.argv[1]); for (const [r, p] of Object.entries(c.repos)) if (p.user) console.log(`${r}:${p.user}`)' "$here/repos.json"); do
  name=${repo%%:*} base=${repo#*:}
  # El git del carril lee el espejo, que es de verify. La cola ya pasa safe.directory en su config
  # global; esta entrada del sistema cubre cualquier otro git de los usuarios de corrida.
  mirror="$state/repos/$name/mirror"
  git config --system --get-all safe.directory 2>/dev/null | grep -qxF "$mirror" || git config --system --add safe.directory "$mirror"
  if [ -d "$state/repos/$name" ]; then
    chgrp -R verify-runners "$state/repos/$name"
    find "$state/repos/$name" -type d -exec chmod g+rxs {} +
  fi
  for n in $(seq 0 $((lanes - 1))); do
    user=$base; [ "$n" = 0 ] || user=$base-$n
    install -d -o root -g root -m 0711 "$lanes_root/$n"
    # Un carril de antes (bajo $state/lanes, que es de verify) se muda con su checkout y su target calientes.
    if [ -d "$state/lanes/$n/$name" ] && [ ! -e "$lanes_root/$n/$name" ]; then
      mv "$state/lanes/$n/$name" "$lanes_root/$n/$name"
    fi
    # El carril es del usuario de la corrida; verify lo lee (grupo) para copiar artefactos y nada más.
    install -d -o "$user" -g verify -m 2750 "$lanes_root/$n/$name"
  done
  # La target que compiló la cola cuando corría como verify pasa al carril 0.
  if [ -d "$state/repos/$name/target" ] && [ ! -e "$lanes_root/0/$name/target" ]; then
    mv "$state/repos/$name/target" "$lanes_root/0/$name/target"
    chown -R "$base:verify" "$lanes_root/0/$name/target"
  fi
  # El checkout viejo era de verify y la rama podía escribirlo: no se reutiliza como espejo.
  rm -rf "$state/repos/$name/checkout"
done
# Lo que quede bajo la raíz vieja de carriles es de carriles que ya no existen.
rm -rf "$state/lanes"
# Los bundles a medio subir vivían en la raíz.
rm -f "$state"/incoming-*.bundle

install -d /opt/verify-queue /etc/verify-queue /etc/systemd/system/tailscaled.service.d
install -m 0644 "$here/server.mjs" /opt/verify-queue/server.mjs
install -m 0644 "$here/repos.json" /etc/verify-queue/repos.json
install -m 0644 "$here/egress.nft" /etc/verify-queue/egress.nft
install -m 0755 "$here/verify-idle-stop" /usr/local/bin/verify-idle-stop
install -m 0644 "$here/verify-idle-stop.cron" /etc/cron.d/verify-idle-stop
install -m 0644 "$here/verify-egress.service" /etc/systemd/system/verify-egress.service
install -m 0644 "$here/verify-queue.service" /etc/systemd/system/verify-queue.service
install -m 0644 "$here/tailscaled-socket.conf" /etc/systemd/system/tailscaled.service.d/verify-socket.conf
nft -c -f /etc/verify-queue/egress.nft
systemctl daemon-reload
chmod 0660 /run/tailscale/tailscaled.sock
systemctl enable verify-egress verify-queue >/dev/null 2>&1
systemctl restart verify-egress
# verify-queue arranca en el trap de salida.
