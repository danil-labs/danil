//! Máquinas locales por canal: un huésped Linux en esta computadora (hoy, una
//! distro de WSL) con su propio motor, al que la ventana le habla por
//! loopback. `child.rs` tiene lo común; cada canal trae su forma de listar,
//! encender y correr un script dentro (`docs/wsl-local-machine.md`).
#![cfg_attr(not(windows), allow(dead_code))]

pub mod child;
mod run;
pub mod wsl;
pub mod wsl_setup;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

/// Una falla con la forma que espera la pantalla: `{ code, detail }`.
pub type Failure = Value;

pub fn fail(code: &str, detail: impl Into<String>) -> Failure {
    json!({ "code": code, "detail": detail.into() })
}

pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Por dónde se llega al huésped. Se guarda y se manda como texto (`"wsl"`);
/// sus fallas se llaman `<canal>_missing`, `<canal>_timeout` y `<canal>_failed`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ChannelKind {
    Wsl,
}

impl ChannelKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Wsl => "wsl",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum GuestState {
    Running,
    Stopped,
    Installing,
    Unknown,
}

/// Un huésped tal como lo ve su canal, tenga o no motor de Danil.
#[derive(Debug, Clone, Serialize)]
pub struct Guest {
    pub channel: ChannelKind,
    /// El nombre del huésped en su canal (la distro de WSL).
    pub id: String,
    pub label: String,
    pub state: GuestState,
    /// El estado tal como lo escribió el canal; `wsl.exe` lo localiza.
    pub state_raw: String,
    pub arch: Option<String>,
    /// WSL: la versión (`1` o `2`).
    pub detail: Option<String>,
    pub default: bool,
    /// De otra aplicación (Docker, Rancher): nunca se ofrece.
    pub system: bool,
}

pub trait Channel: Sync {
    fn kind(&self) -> ChannelKind;
    /// El canal existe en este sistema; puede faltar activarlo.
    fn available(&self) -> bool;
    fn list(&self) -> Result<Vec<Guest>, Failure>;
    /// Enciende el huésped o lo mantiene encendido.
    fn start(&self, guest: &str) -> Result<(), Failure>;
    /// Corre `stdin` con `sh -s -- args` dentro del huésped, como `user` o el
    /// usuario por omisión, y pasa cada línea de la salida a `on_line`.
    /// Devuelve el código de salida y lo último de stderr.
    fn exec(
        &self,
        guest: &str,
        user: Option<&str>,
        stdin: &str,
        args: &[&str],
        deadline: Duration,
        on_line: &mut dyn FnMut(&str),
    ) -> Result<(i32, String), Failure>;
}

pub fn channel(kind: ChannelKind) -> &'static dyn Channel {
    match kind {
        ChannelKind::Wsl => &wsl::Wsl,
    }
}

/// Los canales que este equipo ofrece.
pub fn channels() -> Vec<ChannelKind> {
    [ChannelKind::Wsl]
        .into_iter()
        .filter(|kind| channel(*kind).available())
        .collect()
}

/// `exec` que falla con `<canal>_failed` y lo último de stderr si el script
/// no sale con 0.
pub fn exec_ok(
    kind: ChannelKind,
    guest: &str,
    user: Option<&str>,
    body: &str,
    args: &[&str],
    timeout: Duration,
    mut on_line: impl FnMut(&str),
) -> Result<(), Failure> {
    let (code, tail) = channel(kind).exec(guest, user, body, args, timeout, &mut on_line)?;
    if code == 0 {
        Ok(())
    } else {
        Err(fail(&format!("{}_failed", kind.as_str()), tail))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_channel_travels_as_text() {
        assert_eq!(
            serde_json::to_value(ChannelKind::Wsl).unwrap(),
            json!("wsl")
        );
        assert_eq!(
            serde_json::from_value::<ChannelKind>(json!("wsl")).unwrap(),
            ChannelKind::Wsl
        );
    }

    #[cfg(not(windows))]
    #[test]
    fn no_channel_off_windows() {
        assert!(channels().is_empty());
    }
}
