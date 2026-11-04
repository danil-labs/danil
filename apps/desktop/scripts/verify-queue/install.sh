#!/bin/bash
# Instala o actualiza la cola en la máquina. Corre como root desde esta carpeta.
# Idempotente: una segunda vez solo copia archivos y reinicia los servicios.
set -euo pipefail
here=$(dirname "$(readlink -f "$0")")
state=/var/lib/verify-queue
rust=/opt/rust
toolchains="stable 1.97.1"

# Los usuarios de corrida salen de repos.json: sin shell de entrada, sin sudo, sin cron ni at.
# Están en `verify-runners` solo para leer los espejos; no pueden escribir nada de la cola.
mapfile -t runners < <(node -e 'const c = require(process.argv[1]); for (const p of Object.values(c.repos)) if (p.user) console.log(p.user)' "$here/repos.json" | sort -u)
getent group verify-runners >/dev/null || groupadd --system verify-runners
for user in "${runners[@]}"; do
  id -u "$user" >/dev/null 2>&1 || useradd --system --create-home --shell /usr/sbin/nologin "$user"
  usermod -aG verify-runners "$user"
  grep -q "\"$user\"" "$here/egress.nft" || { echo "egress.nft no limita a $user" >&2; exit 1; }
  for deny in /etc/cron.deny /etc/at.deny; do grep -qx "$user" "$deny" 2>/dev/null || echo "$user" >> "$deny"; done
done

# Una toolchain de root y de solo lectura: el HOME de verify es 0750, y una rama no puede envenenarla.
# El registro de cargo de cada carril vive en lanes/<n>/<repo>/cargo.
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
install -d -o verify -g verify -m 0711 "$state/lanes" "$state/lanes/0"
for repo in $(node -e 'const c = require(process.argv[1]); for (const [r, p] of Object.entries(c.repos)) if (p.user) console.log(`${r}:${p.user}`)' "$here/repos.json"); do
  name=${repo%%:*} user=${repo#*:}
  # El carril es del usuario de la corrida; verify lo lee (grupo) para copiar artefactos y nada más.
  install -d -o "$user" -g verify -m 2750 "$state/lanes/0/$name"
  if [ -d "$state/repos/$name" ]; then
    chgrp -R verify-runners "$state/repos/$name"
    find "$state/repos/$name" -type d -exec chmod g+rxs {} +
  fi
  # La target que compiló la cola cuando corría como verify pasa al carril. Cambian las rutas
  # absolutas de la dep-info: puede compilar en frío una vez, se mide en la primera corrida.
  if [ -d "$state/repos/$name/target" ] && [ ! -e "$state/lanes/0/$name/target" ]; then
    mv "$state/repos/$name/target" "$state/lanes/0/$name/target"
    chown -R "$user:verify" "$state/lanes/0/$name/target"
  fi
  # El checkout viejo era de verify y la rama podía escribirlo: no se reutiliza como espejo.
  rm -rf "$state/repos/$name/checkout"
done
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
systemctl restart verify-queue
