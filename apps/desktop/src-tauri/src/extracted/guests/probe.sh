#!/bin/sh
# Lo que la ventana necesita saber de un huésped antes de conectarlo, en
# clave=valor. No imprime el token: solo el contrato del descriptor.
h="$HOME/.local/share/seldon-host"
echo "arch=$(uname -m)"
echo "user=$(id -un)"
echo "home=$HOME"
echo "systemd=$(systemctl --user is-system-running 2>/dev/null || true)"
need=''
for t in curl tar cmp; do command -v "$t" >/dev/null 2>&1 || need="$need $t"; done
ldconfig -p 2>/dev/null | grep -q 'libdbus-1.so.3' || need="$need libdbus"
echo "missing=$need"
if sudo -n true 2>/dev/null; then echo sudo=yes; else echo sudo=no; fi
if [ -x "$h/current/seldon-runtime" ]; then
  echo engine=yes
  # 0: conectado a una cuenta; 3: sin cuenta (como lo lee install.sh).
  rc=0
  "$h/current/seldon-runtime" machines status --data "$h/data" --json >/dev/null 2>&1 || rc=$?
  echo "enrolled_rc=$rc"
else
  echo engine=no
fi
d="$h/data/seldon-endpoint.json"
[ -f "$d" ] && echo "contract=$(sed -n 's/.*"contract"[[:space:]]*:[[:space:]]*"\([0-9a-f]*\)".*/\1/p' "$d" | head -n 1)"
m=$(grep -cE ' (virtiofs|9p|fuse\.sshfs|sshfs) ' /proc/mounts 2>/dev/null || true)
[ -d /mnt/c ] && m=$((${m:-0} + 1))
echo "mounts=${m:-0}"
