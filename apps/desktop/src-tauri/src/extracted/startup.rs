//! Aviso nativo de un arranque fallido, antes de que exista el webview, y el
//! build del motor que muestra el título. Las frases salen del catálogo es/en
//! del front; sin workspace, la lengua es la del sistema, como en `src/lib/i18n.ts`.
//! El aviso sale solo si nadie lee stderr: un guion o una terminal reciben la clave.
use super::util::Frase;
use serde_json::Value;
use terminus_engine_protocol::Error;

const ES: &str = include_str!("../../../src/locales/es/shell.json");
const EN: &str = include_str!("../../../src/locales/en/shell.json");
/// La última versión con el motor dentro de la app; sus datos no se tocan.
const PREVIOUS_RELEASE: &str = "https://github.com/danil-labs/danil/releases/tag/v0.2.74";

pub(super) fn phrase(frase: Frase) -> String {
    let catalog: Value = serde_json::from_str(if system_language().starts_with("es") {
        ES
    } else {
        EN
    })
    .unwrap_or_default();
    catalog[frase.0].as_str().unwrap_or(frase.0).to_owned()
}

pub fn show(error: &Error) {
    if !nobody_reads_stderr() {
        return;
    }
    let key = match error.code.as_str() {
        "engine_missing" => Frase::new("shell.startup.engine_missing"),
        "engine_start_failed" | "service_busy" | "authority_incompatible" => {
            Frase::new("shell.startup.engine_start_failed")
        }
        "app_unavailable" => Frase::new("shell.startup.engine_down"),
        "invalid_token" => Frase::new("shell.startup.not_private"),
        "version_mismatch" => Frase::new("shell.service.version"),
        _ => Frase::new("shell.startup.invalid"),
    };
    rfd::MessageDialog::new()
        .set_level(rfd::MessageLevel::Error)
        .set_title(phrase(Frase::new("shell.startup.title")))
        .set_description(format!(
            "{}\n\n{}",
            phrase(key)
                .replace("{log}", error.detail.as_str().unwrap_or_default())
                .replace("{release}", PREVIOUS_RELEASE),
            error.code
        ))
        .set_buttons(rfd::MessageButtons::Ok)
        .show();
}

pub fn engine_build(status: &Value) -> String {
    let version = status["version"].as_str().unwrap_or_default();
    let build = status["build"].as_str().unwrap_or_default();
    format!("{version} {}", build.get(..7).unwrap_or(build))
        .trim()
        .to_owned()
}

#[cfg(windows)]
fn system_language() -> String {
    use windows_sys::Win32::Globalization::GetUserDefaultLocaleName;
    let mut name = [0u16; 85];
    let length = unsafe { GetUserDefaultLocaleName(name.as_mut_ptr(), name.len() as i32) };
    String::from_utf16_lossy(&name[..usize::try_from(length - 1).unwrap_or(0)])
}

#[cfg(not(windows))]
fn system_language() -> String {
    ["LC_ALL", "LC_MESSAGES", "LANG"]
        .iter()
        .find_map(|name| std::env::var(name).ok().filter(|value| !value.is_empty()))
        .unwrap_or_default()
}

#[cfg(windows)]
fn nobody_reads_stderr() -> bool {
    use windows_sys::Win32::{
        Foundation::INVALID_HANDLE_VALUE,
        Storage::FileSystem::{GetFileType, FILE_TYPE_UNKNOWN},
        System::Console::{GetStdHandle, STD_ERROR_HANDLE},
    };
    let handle = unsafe { GetStdHandle(STD_ERROR_HANDLE) };
    handle.is_null()
        || handle == INVALID_HANDLE_VALUE
        || unsafe { GetFileType(handle) } == FILE_TYPE_UNKNOWN
}

#[cfg(not(windows))]
fn nobody_reads_stderr() -> bool {
    use std::io::IsTerminal;
    use std::os::unix::fs::FileTypeExt;
    if std::io::stderr().is_terminal() {
        return false;
    }
    std::fs::metadata("/dev/fd/2")
        .map_or(true, |meta| !(meta.is_file() || meta.file_type().is_fifo()))
}
