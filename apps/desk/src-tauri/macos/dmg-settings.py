# Ventana del .dmg para dmgbuild; escribe el .DS_Store sin abrir Finder.
# dmgbuild -s dmg-settings.py -D app=<Danil.app> -D assets=<esta carpeta> "Instalar Danil" <salida.dmg>
import os.path

app = defines["app"]
assets = defines["assets"]
name = os.path.basename(app)

format = "UDZO"
filesystem = "HFS+"
files = [app]
symlinks = {"Applications": "/Applications"}
icon = os.path.join(assets, "volume.icns")
background = os.path.join(assets, "dmg-background.png")

# Las posiciones coinciden con la flecha de dmg-background.svg.
window_rect = ((200, 160), (660, 400))
icon_size = 128
text_size = 13
icon_locations = {name: (180, 190), "Applications": (480, 190)}
hide_extensions = [name]
default_view = "icon-view"
show_status_bar = False
show_tab_view = False
show_toolbar = False
show_pathbar = False
show_sidebar = False
