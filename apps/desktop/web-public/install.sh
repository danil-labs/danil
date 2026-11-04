#!/bin/sh
# Danil aún no publica este instalador. Sin este archivo, la ruta responde con
# la página de la app y `curl | sh` la ejecuta como si fuera un script. Al
# publicar se reemplaza por el de seldon-host (scripts/host-install/package.py render).
printf '%s\n' 'Danil todavía no publica el instalador para otras máquinas; no se instaló nada.' \
  "Danil's installer for other machines is not published yet; nothing was installed." >&2
exit 1
