//! Actualizar sin cerrar la ventana. En Windows el plugin sale del proceso al
//! instalar; aquí el instalador aparta los `.exe` en uso a `old_*` (`windows/hooks.nsh`).
use std::path::{Path, PathBuf};
use tauri_plugin_updater::UpdaterExt;

// El instalador silencioso tarda segundos; uno que no termina no deja la pantalla en «instalando».
#[cfg(windows)]
const INSTALL_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(600);

#[tauri::command]
pub(super) async fn update_install(app: tauri::AppHandle) -> Result<(), String> {
    let updater = app.updater().map_err(|error| error.to_string())?;
    let Some(update) = updater.check().await.map_err(|error| error.to_string())? else {
        return Err("no_update".into());
    };
    // `download` comprueba la firma contra la llave pública de `tauri.conf.json`.
    let bytes = update
        .download(|_, _| {}, || {})
        .await
        .map_err(|error| error.to_string())?;
    install(&update, bytes).await
}

#[cfg(windows)]
async fn install(update: &tauri_plugin_updater::Update, bytes: Vec<u8>) -> Result<(), String> {
    let folder = std::env::temp_dir().join(format!("terminus-update-{}", update.version));
    std::fs::create_dir_all(&folder).map_err(|error| error.to_string())?;
    let setup = folder.join(format!("Danil_{}_x64-setup.exe", update.version));
    std::fs::write(&setup, bytes).map_err(|error| error.to_string())?;
    log::info!("[update] installing {}", update.version);
    // Sin `/R`: el instalador no relanza la app; reiniciar lo decide la persona.
    let status = tauri::async_runtime::spawn_blocking(move || {
        let mut command = std::process::Command::new(&setup);
        crate::util::no_console_window(&mut command).args(["/S", "/UPDATE"]);
        crate::util::output_with_timeout(&mut command, INSTALL_TIMEOUT)
    })
    .await
    .map_err(|error| error.to_string())?
    .map_err(|error| error.to_string())?;
    let _ = std::fs::remove_dir_all(&folder);
    if status.success() {
        Ok(())
    } else {
        Err(format!("installer_exit_{}", status.code().unwrap_or(-1)))
    }
}

/// macOS y Linux reemplazan el bundle o el AppImage sin salir del proceso.
#[cfg(not(windows))]
async fn install(update: &tauri_plugin_updater::Update, bytes: Vec<u8>) -> Result<(), String> {
    update.install(bytes).map_err(|error| error.to_string())
}

/// Hay otra versión instalada sobre esta ventana, desde la app o con el instalador a mano.
#[tauri::command]
pub(super) fn update_pending() -> bool {
    // Desinstalar antes de instalar aparta el ejecutable antes de escribir el nuevo en su ruta.
    super::legacy::set_aside(std::process::id())
        && std::env::current_exe().is_ok_and(|exe| exe.is_file())
}

/// Lo que dejó apartado una instalación anterior; lo que sigue abierto no se deja borrar.
#[cfg(windows)]
pub fn sweep() {
    let Some(dir) = std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(|dir| dir.to_path_buf()))
    else {
        return;
    };
    // La ventana que se reinicia tarda unos segundos en soltar su ejecutable.
    let _ = std::thread::Builder::new()
        .name("sweep".into())
        .spawn(move || {
            for _ in 0..10 {
                if remove_set_aside(&dir) {
                    return;
                }
                std::thread::sleep(std::time::Duration::from_secs(3));
            }
        });
}
#[cfg(not(windows))]
pub fn sweep() {}

#[cfg(windows)]
fn remove_set_aside(dir: &Path) -> bool {
    clear_set_aside(dir, |path| std::fs::remove_file(path).is_ok())
}

const ENGINE: &str = "seldon-runtime.exe";

/// Primero los motores: mientras uno apartado siga vivo, su ventana apartada se queda
/// para poder volver a abrirla (`previous_window`).
#[cfg_attr(not(windows), allow(dead_code))]
fn clear_set_aside(dir: &Path, mut remove: impl FnMut(&Path) -> bool) -> bool {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return true;
    };
    let (engines, others): (Vec<PathBuf>, Vec<PathBuf>) = entries
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| {
            path.file_name()
                .map(|name| name.to_string_lossy().to_lowercase())
                .is_some_and(|name| name.starts_with("old_") && name.ends_with(".exe"))
        })
        .partition(|path| {
            path.file_name()
                .is_some_and(|name| name.to_string_lossy().to_lowercase().ends_with(ENGINE))
        });
    let engines_left = engines.iter().filter(|path| !remove(path)).count();
    if engines_left > 0 {
        return false;
    }
    let mut clean = true;
    for path in &others {
        if !remove(path) {
            clean = false;
        }
    }
    clean
}

/// El nombre instalado de un ejecutable apartado: sin `old_` ni `old_<tick>_`.
#[cfg_attr(not(windows), allow(dead_code))]
fn installed_name(name: &str) -> String {
    let name = name.to_lowercase();
    let Some(rest) = name.strip_prefix("old_") else {
        return name;
    };
    match rest.split_once('_') {
        Some((tick, tail)) if !tick.is_empty() && tick.bytes().all(|b| b.is_ascii_digit()) => {
            tail.to_owned()
        }
        _ => rest.to_owned(),
    }
}

/// La ventana que el instalador apartó con el mismo prefijo que el motor `engine`.
#[cfg_attr(not(windows), allow(dead_code))]
fn window_beside(engine: &Path, window: &str) -> Option<PathBuf> {
    let name = engine.file_name()?.to_string_lossy().to_lowercase();
    let prefix = name.strip_suffix(ENGINE)?;
    prefix
        .starts_with("old_")
        .then(|| engine.with_file_name(format!("{prefix}{}", installed_name(window))))
}

/// La ventana apartada que habla el contrato del motor `pid`, si sigue en disco.
pub(super) fn previous_window(pid: u32) -> Option<PathBuf> {
    let engine = super::legacy::image_path(pid)?;
    let own = std::env::current_exe().ok()?;
    window_beside(&engine, &own.file_name()?.to_string_lossy()).filter(|window| window.is_file())
}

/// La ventana instalada junto a esta, aunque esta corra apartada.
pub(super) fn installed_window() -> Option<PathBuf> {
    let own = std::env::current_exe().ok()?;
    let name = installed_name(&own.file_name()?.to_string_lossy());
    Some(own.with_file_name(name)).filter(|window| window.is_file())
}

#[cfg(test)]
mod tests {
    use super::{clear_set_aside, installed_name, window_beside};
    use std::path::{Path, PathBuf};

    #[test]
    fn the_set_aside_window_is_the_one_with_the_engine_prefix() {
        let dir = Path::new("c:/terminus");
        assert_eq!(
            window_beside(&dir.join("old_seldon-runtime.exe"), "terminus.exe"),
            Some(dir.join("old_terminus.exe"))
        );
        assert_eq!(
            window_beside(&dir.join("old_81234_seldon-runtime.exe"), "Terminus.exe"),
            Some(dir.join("old_81234_terminus.exe"))
        );
        // Una ventana que ya corre apartada busca por su nombre instalado.
        assert_eq!(
            window_beside(&dir.join("old_seldon-runtime.exe"), "old_5_terminus.exe"),
            Some(dir.join("old_terminus.exe"))
        );
        assert_eq!(
            window_beside(&dir.join("seldon-runtime.exe"), "terminus.exe"),
            None
        );
        assert_eq!(
            window_beside(&dir.join("old_terminus.exe"), "terminus.exe"),
            None
        );
    }

    #[test]
    fn a_set_aside_name_goes_back_to_the_installed_one() {
        assert_eq!(installed_name("old_terminus.exe"), "terminus.exe");
        assert_eq!(installed_name("old_81234_terminus.exe"), "terminus.exe");
        assert_eq!(installed_name("Terminus.exe"), "terminus.exe");
        assert_eq!(
            installed_name("old_seldon-runtime.exe"),
            "seldon-runtime.exe"
        );
    }

    fn folder(names: &[&str]) -> tempfile::TempDir {
        let folder = tempfile::tempdir().unwrap();
        for name in names {
            std::fs::write(folder.path().join(name), b"").unwrap();
        }
        folder
    }

    fn names(paths: &[PathBuf]) -> Vec<String> {
        let mut names: Vec<String> = paths
            .iter()
            .map(|path| path.file_name().unwrap().to_string_lossy().into_owned())
            .collect();
        names.sort();
        names
    }

    #[test]
    fn a_running_set_aside_engine_keeps_its_window_on_disk() {
        let folder = folder(&["old_terminus.exe", "old_seldon-runtime.exe", "terminus.exe"]);
        let mut asked = Vec::new();
        let clean = clear_set_aside(folder.path(), |path| {
            asked.push(path.to_path_buf());
            !path.ends_with("old_seldon-runtime.exe")
        });
        assert!(!clean);
        assert_eq!(names(&asked), ["old_seldon-runtime.exe"]);
    }

    #[test]
    fn without_set_aside_engines_every_old_file_goes() {
        let folder = folder(&[
            "old_terminus.exe",
            "old_9_seldon-runtime.exe",
            "terminus.exe",
        ]);
        let mut asked = Vec::new();
        let clean = clear_set_aside(folder.path(), |path| {
            asked.push(path.to_path_buf());
            true
        });
        assert!(clean);
        assert_eq!(
            names(&asked),
            ["old_9_seldon-runtime.exe", "old_terminus.exe"]
        );
    }

    #[test]
    fn an_open_window_does_not_stop_the_rest() {
        let folder = folder(&["old_terminus.exe", "old_1_terminus.exe"]);
        let mut asked = Vec::new();
        let clean = clear_set_aside(folder.path(), |path| {
            asked.push(path.to_path_buf());
            false
        });
        assert!(!clean);
        assert_eq!(names(&asked), ["old_1_terminus.exe", "old_terminus.exe"]);
    }
}
