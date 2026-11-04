//! Segundo plano: la ventana se oculta y un icono junto al reloj (barra de menús
//! en macOS) dice qué sigue trabajando y deja abrir, detener o salir. Los textos
//! llegan traducidos del front, que es quien tiene el catálogo.
use serde::Deserialize;
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager,
};

const ID: &str = "terminus-background";
/// El isotipo en una sola tinta (`icons/src/tray.svg`) a 22 pt @2x.
#[cfg(target_os = "macos")]
const MENU_BAR_ICON: &[u8] = include_bytes!("../../icons/tray@2x.png");
pub(super) static FRONT_READY: std::sync::atomic::AtomicBool =
    std::sync::atomic::AtomicBool::new(false);
/// Se ocultó desde pantalla completa: al volver la recupera.
#[cfg(target_os = "macos")]
static HID_FULLSCREEN: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
/// Cada `show_window` lo sube: una salida de pantalla completa pendiente ya no oculta.
#[cfg(target_os = "macos")]
static SHOWN: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
/// Lo que tarda macOS en la animación de salir de pantalla completa.
#[cfg(target_os = "macos")]
const LEAVE_FULLSCREEN: std::time::Duration = std::time::Duration::from_millis(900);

#[derive(Deserialize)]
pub(super) struct Labels {
    tooltip: String,
    header: String,
    open: String,
    stop_all: String,
    quit: String,
}

#[derive(Deserialize)]
pub(super) struct Item {
    title: String,
}

/// `get_window`: con Typst o un sitio abiertos la ventana tiene varias vistas y
/// `get_webview_window` ya no la devuelve.
pub(super) fn show_window(app: &AppHandle) {
    if let Some(window) = app.get_window("main") {
        #[cfg(target_os = "macos")]
        SHOWN.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        let _ = window.show();
        let _ = window.unminimize();
        #[cfg(target_os = "macos")]
        if HID_FULLSCREEN.swap(false, std::sync::atomic::Ordering::SeqCst) {
            let _ = window.set_fullscreen(true);
        }
        let _ = window.set_focus();
    }
}

fn menu(app: &AppHandle, labels: &Labels, items: &[Item]) -> tauri::Result<Menu<tauri::Wry>> {
    let menu = Menu::new(app)?;
    menu.append(&MenuItem::with_id(
        app,
        "tray-header",
        &labels.header,
        false,
        None::<&str>,
    )?)?;
    for (index, item) in items.iter().enumerate() {
        let id = format!("tray-item-{index}");
        menu.append(&MenuItem::with_id(
            app,
            id,
            &item.title,
            false,
            None::<&str>,
        )?)?;
    }
    menu.append(&PredefinedMenuItem::separator(app)?)?;
    menu.append(&MenuItem::with_id(
        app,
        "tray-open",
        &labels.open,
        true,
        None::<&str>,
    )?)?;
    menu.append(&MenuItem::with_id(
        app,
        "tray-stop-all",
        &labels.stop_all,
        !items.is_empty(),
        None::<&str>,
    )?)?;
    menu.append(&MenuItem::with_id(
        app,
        "tray-quit",
        &labels.quit,
        true,
        None::<&str>,
    )?)?;
    Ok(menu)
}

/// El icono existe antes del webview; el front después actualiza su idioma y estado.
pub(super) fn initialize(app: &AppHandle) -> Result<(), String> {
    use super::{startup::phrase, util::Frase};
    update(
        app,
        &Labels {
            tooltip: phrase(Frase::new("shell.tray.unknown")),
            header: phrase(Frase::new("shell.tray.unknown")),
            open: phrase(Frase::new("shell.tray.open")),
            stop_all: phrase(Frase::new("shell.tray.stop_all")),
            quit: phrase(Frase::new("shell.tray.quit")),
        },
        &[],
    )
}

pub(super) fn hide_window(app: &AppHandle) -> Result<(), String> {
    if app.tray_by_id(ID).is_none() {
        initialize(app)?;
    }
    if let Some(window) = app.get_window("main") {
        // Oculta dentro de pantalla completa, macOS deja su espacio en negro hasta salir
        // desde el Dock: primero sale y, terminada la animación, se oculta.
        #[cfg(target_os = "macos")]
        if window.is_fullscreen().unwrap_or(false) {
            use std::sync::atomic::Ordering;
            window
                .set_fullscreen(false)
                .map_err(|error| error.to_string())?;
            HID_FULLSCREEN.store(true, Ordering::SeqCst);
            let shown = SHOWN.load(Ordering::SeqCst);
            std::thread::spawn(move || {
                std::thread::sleep(LEAVE_FULLSCREEN);
                if SHOWN.load(Ordering::SeqCst) == shown {
                    let _ = window.hide();
                }
            });
            return Ok(());
        }
        window.hide().map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn update(app: &AppHandle, labels: &Labels, items: &[Item]) -> Result<(), String> {
    let menu = menu(app, labels, items).map_err(|error| error.to_string())?;
    if let Some(tray) = app.tray_by_id(ID) {
        tray.set_menu(Some(menu))
            .map_err(|error| error.to_string())?;
        tray.set_tooltip(Some(&labels.tooltip))
            .map_err(|error| error.to_string())?;
    } else {
        let mut builder = TrayIconBuilder::with_id(ID)
            .menu(&menu)
            .tooltip(&labels.tooltip)
            .show_menu_on_left_click(true)
            .on_menu_event(|app, event| match event.id().as_ref() {
                "tray-open" => show_window(app),
                "tray-stop-all" => {
                    show_window(app);
                    let _ = app.emit("tray-stop-all", ());
                }
                "tray-quit" => super::desktop::request_quit(app),
                _ => {}
            });
        // macOS tiñe la imagen plantilla según el tema, como a los demás iconos de la barra.
        #[cfg(target_os = "macos")]
        {
            builder = builder
                .icon(
                    tauri::image::Image::from_bytes(MENU_BAR_ICON)
                        .map_err(|error| error.to_string())?,
                )
                .icon_as_template(true);
        }
        #[cfg(not(target_os = "macos"))]
        if let Some(icon) = app.default_window_icon() {
            builder = builder.icon(icon.clone());
        }
        builder.build(app).map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub(super) fn window_to_background(
    app: AppHandle,
    labels: Labels,
    items: Vec<Item>,
) -> Result<(), String> {
    update(&app, &labels, &items)?;
    hide_window(&app)
}

#[tauri::command]
pub(super) fn tray_update(app: AppHandle, labels: Labels, items: Vec<Item>) -> Result<(), String> {
    FRONT_READY.store(true, std::sync::atomic::Ordering::SeqCst);
    update(&app, &labels, &items)
}

/// Sale el cliente; el motor conserva su propia política de cierre y su trabajo.
#[tauri::command]
pub(super) fn quit_completely(app: AppHandle) {
    super::instance::exiting();
    app.exit(0);
}

/// Reinicio de la app: la ventana que sale deja de contestar a la que la reemplaza.
#[tauri::command]
pub(super) fn restart_app(app: AppHandle) {
    super::instance::exiting();
    // La ventana anterior que se abrió desde `old_*` reiniciaría en sí misma: abre la instalada.
    if super::legacy::set_aside(std::process::id()) {
        let opened = super::update::installed_window()
            .and_then(|window| super::launcher::open_window(&window));
        if opened.is_some() {
            app.exit(0);
            return;
        }
    }
    app.restart();
}

/// Una tarea terminó o necesita a la persona. Con la ventana fuera de la pantalla
/// sale un aviso del sistema; a la vista solo parpadea, y solo si la necesita. Con
/// foco responde `focused` y el aviso lo pinta la ventana.
#[tauri::command]
pub(super) fn tray_notify(
    app: AppHandle,
    title: String,
    body: String,
    needs_you: bool,
    key: String,
) -> Result<&'static str, String> {
    #[cfg(not(windows))]
    use tauri_plugin_notification::NotificationExt;
    // El foco lo dice la ventana nativa: el del documento no ve el de las vistas hijas.
    if let Some(window) = app.get_window("main") {
        let on_screen =
            window.is_visible().unwrap_or(false) && !window.is_minimized().unwrap_or(false);
        let focused = in_front(&window);
        log::info!("[aviso] needs_you={needs_you} on_screen={on_screen} focused={focused}");
        if on_screen && focused {
            return Ok("focused");
        }
        if on_screen {
            if needs_you {
                let _ =
                    window.request_user_attention(Some(tauri::UserAttentionType::Informational));
                return Ok("flash");
            }
            return Ok("none");
        }
    }
    #[cfg(windows)]
    {
        windows_toast(&app, &title, &body, &key);
        Ok("system")
    }
    #[cfg(not(windows))]
    {
        // Fuera de Windows el plugin no avisa del clic.
        let _ = key;
        app.notification()
            .builder()
            .title(title)
            .body(body)
            .show()
            .map(|()| "system")
            .map_err(|error| error.to_string())
    }
}

/// En Windows `is_focused` dice que no cuando el foco está dentro del WebView2;
/// la ventana del frente sí lo sabe.
fn in_front(window: &tauri::Window) -> bool {
    #[cfg(windows)]
    {
        use windows_sys::Win32::UI::WindowsAndMessaging::{
            GetAncestor, GetForegroundWindow, GA_ROOT,
        };
        if let Ok(hwnd) = window.hwnd() {
            let front = unsafe { GetAncestor(GetForegroundWindow(), GA_ROOT) };
            return !front.is_null() && front == hwnd.0;
        }
    }
    window.is_focused().unwrap_or(false)
}

/// Esquema con el que Windows abre `terminus.exe` al pulsar un aviso, aunque ya
/// esté en el centro de notificaciones; la ventana abierta recibe la tarea.
pub(super) const NOTICE_SCHEME: &str = "terminus-notice";

/// Cualquier enlace del aviso, aunque su clave no se entienda: nunca es una selección de motor.
pub(super) fn is_notice(arg: &std::ffi::OsStr) -> bool {
    arg.to_str()
        .and_then(|arg| arg.strip_prefix(NOTICE_SCHEME))
        .is_some_and(|rest| rest.starts_with(':'))
}

/// La clave del aviso en `terminus-notice://open?key=<espacio>/<tarea>`; Windows
/// normaliza el enlace antes de lanzarlo y llega como `open/?key=`.
pub(super) fn notice_key(arg: &std::ffi::OsStr) -> Option<String> {
    let rest = arg
        .to_str()?
        .strip_prefix(NOTICE_SCHEME)?
        .strip_prefix("://open")?;
    let key = rest
        .strip_prefix('/')
        .unwrap_or(rest)
        .strip_prefix("?key=")?
        .trim_end_matches('/');
    let valid = !key.is_empty()
        && key.len() <= 200
        && key
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || "-_/".contains(c));
    valid.then(|| key.to_owned())
}

#[cfg(windows)]
fn installed() -> bool {
    tauri::utils::platform::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(|dir| dir.to_path_buf()))
        .is_some_and(|dir| !dir.ends_with("target/debug") && !dir.ends_with("target/release"))
}

/// Solo la copia instalada: una de desarrollo no se queda con los enlaces.
#[cfg(windows)]
pub(super) fn register_notice_scheme() {
    use windows_sys::Win32::System::Registry::{RegSetKeyValueW, HKEY_CURRENT_USER, REG_SZ};
    let Ok(exe) = std::env::current_exe() else {
        return;
    };
    if !installed() {
        return;
    }
    let wide = |text: &str| text.encode_utf16().chain(Some(0)).collect::<Vec<u16>>();
    let set = |key: &str, name: Option<&str>, value: &str| {
        let (key, value) = (wide(key), wide(value));
        let name = name.map(wide);
        let name = name.as_ref().map_or(std::ptr::null(), |name| name.as_ptr());
        let size = (value.len() * 2) as u32;
        unsafe {
            RegSetKeyValueW(
                HKEY_CURRENT_USER,
                key.as_ptr(),
                name,
                REG_SZ,
                value.as_ptr().cast(),
                size,
            )
        };
    };
    let base = format!(r"Software\Classes\{NOTICE_SCHEME}");
    set(&base, None, "URL:Terminus");
    set(&base, Some("URL Protocol"), "");
    let command = format!("\"{}\" \"%1\"", exe.display());
    set(&format!(r"{base}\shell\open\command"), None, &command);
}

#[cfg(windows)]
fn windows_toast(app: &AppHandle, title: &str, body: &str, key: &str) {
    let escape = |text: &str| {
        text.replace('&', "&amp;")
            .replace('<', "&lt;")
            .replace('>', "&gt;")
            .replace('"', "&quot;")
    };
    // Sin instalar no hay AppUserModelID ni esquema registrados: avisa sin abrir nada.
    let (app_id, launch) = if installed() {
        let link = format!("{NOTICE_SCHEME}://open?key={key}");
        let launch = format!(r#" activationType="protocol" launch="{}""#, escape(&link));
        (app.config().identifier.clone(), launch)
    } else {
        (POWERSHELL_APP_ID.to_owned(), String::new())
    };
    let xml = format!(
        r#"<toast{launch}><visual><binding template="ToastGeneric"><text>{}</text><text>{}</text></binding></visual></toast>"#,
        escape(title),
        escape(body)
    );
    // Como el plugin: WinRT fuera del hilo de la ventana, que no publica el aviso.
    std::thread::spawn(move || match show_toast(&app_id, &xml) {
        Ok(()) => log::info!("[aviso] mostrado app_id={app_id}"),
        Err(error) => log::warn!("[aviso] no se pudo mostrar app_id={app_id}: {error}"),
    });
}

#[cfg(windows)]
const POWERSHELL_APP_ID: &str =
    "{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe";

#[cfg(windows)]
fn show_toast(app_id: &str, xml: &str) -> windows::core::Result<()> {
    use windows::{
        core::HSTRING,
        Data::Xml::Dom::XmlDocument,
        UI::Notifications::{ToastNotification, ToastNotificationManager},
    };
    let document = XmlDocument::new()?;
    document.LoadXml(&HSTRING::from(xml))?;
    let toast = ToastNotification::CreateToastNotification(&document)?;
    ToastNotificationManager::CreateToastNotifierWithId(&HSTRING::from(app_id))?.Show(&toast)
}

#[cfg(test)]
mod tests {
    use super::{is_notice, notice_key};
    use std::ffi::OsStr;

    #[test]
    fn notice_link_keeps_its_key_after_windows_normalizes_it() {
        let key = |link: &str| notice_key(OsStr::new(link));
        let expected = Some("x647g4vc/880mmwzk".to_owned());
        assert_eq!(
            key("terminus-notice://open?key=x647g4vc/880mmwzk"),
            expected
        );
        assert_eq!(
            key("terminus-notice://open/?key=x647g4vc/880mmwzk"),
            expected
        );
        assert_eq!(
            key("terminus-notice://open/?key=x647g4vc/880mmwzk/"),
            expected
        );
        assert_eq!(key("terminus-notice://open/?key=a%20b"), None);
        assert!(is_notice(OsStr::new("terminus-notice://otra")));
        assert!(!is_notice(OsStr::new("--external-host")));
    }
}
