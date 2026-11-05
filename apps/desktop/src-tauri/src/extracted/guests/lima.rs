//! Lima como canal de huéspedes en macOS: `limactl list --json`,
//! `limactl start` y `limactl shell --workdir / X sh -s` con el script por stdin.
//! La ventana abierta desde Finder no trae Homebrew en el PATH: `limactl` se
//! busca por ruta absoluta.
#![cfg_attr(not(target_os = "macos"), allow(dead_code))]

use super::{fail, Channel, ChannelKind, Failure, Guest, GuestState};
use serde::Deserialize;
use std::path::PathBuf;
use std::process::Command;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

/// Lo que se espera a `limactl start`: arrancar una VM tarda minutos la primera vez.
const START_WAIT: Duration = Duration::from_secs(5 * 60);
const LIST_WAIT: Duration = Duration::from_secs(20);
/// Cuánto vale una lectura de `limactl list`: todas las máquinas la comparten.
const LIST_FOR: Duration = Duration::from_secs(3);

pub struct Lima;

/// `limactl` en las rutas de Homebrew y de usuario, y si no, en el PATH.
pub fn limactl() -> Option<PathBuf> {
    let home = std::env::var_os("HOME").map(PathBuf::from);
    let mut found = vec![
        PathBuf::from("/opt/homebrew/bin/limactl"),
        PathBuf::from("/usr/local/bin/limactl"),
    ];
    if let Some(home) = &home {
        found.push(home.join(".local/bin/limactl"));
    }
    if let Some(path) = std::env::var_os("PATH") {
        found.extend(std::env::split_paths(&path).map(|dir| dir.join("limactl")));
    }
    found.into_iter().find(|p| p.is_file())
}

/// Quien lo corre le pone plazo (`run::run`, `run::stream`); solo `unpack`,
/// que copia una carpeta, dura lo que pese: proceso largo: a propósito.
fn command() -> Result<Command, Failure> {
    let program = limactl().ok_or_else(|| fail("lima_missing", "limactl"))?;
    let mut command = Command::new(program);
    crate::util::no_console_window(&mut command);
    Ok(command)
}

/// La carpeta de Lima de Colima: sus VMs son de Colima, nunca se ofrecen.
fn colima_home() -> Option<PathBuf> {
    std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".colima/_lima"))
}

#[derive(Debug, Deserialize)]
struct Listed {
    name: String,
    #[serde(default)]
    status: String,
    #[serde(default)]
    arch: Option<String>,
    #[serde(default, rename = "vmType")]
    vm_type: Option<String>,
}

/// `limactl list --json`: un objeto por línea. Lo que no se entiende se salta.
pub fn parse_list(text: &str, system: bool) -> Vec<Guest> {
    text.lines()
        .filter_map(|line| serde_json::from_str::<Listed>(line.trim()).ok())
        .filter(|vm| super::wsl_setup::valid_distro(&vm.name))
        .map(|vm| Guest {
            channel: ChannelKind::Lima,
            state: match vm.status.as_str() {
                "Running" => GuestState::Running,
                "Stopped" => GuestState::Stopped,
                _ => GuestState::Unknown,
            },
            label: vm.name.clone(),
            arch: vm.arch,
            detail: vm.vm_type,
            default: false,
            system,
            state_raw: vm.status,
            id: vm.name,
        })
        .collect()
}

fn list_in(home: Option<&PathBuf>, system: bool) -> Result<Vec<Guest>, Failure> {
    let mut command = command()?;
    command.args(["list", "--json"]);
    if let Some(home) = home {
        command.env("LIMA_HOME", home);
    }
    let ran = super::run::run(&mut command, None, LIST_WAIT).map_err(run_failure)?;
    if !ran.status.success() {
        return Err(fail(
            "lima_failed",
            String::from_utf8_lossy(&ran.stderr).trim().to_string(),
        ));
    }
    Ok(parse_list(&String::from_utf8_lossy(&ran.stdout), system))
}

fn run_failure(error: super::run::RunError) -> Failure {
    match error {
        super::run::RunError::Missing => fail("lima_missing", "limactl"),
        super::run::RunError::Timeout => fail("lima_timeout", "limactl"),
        super::run::RunError::Io(detail) => fail("io", detail),
    }
}

/// Las VMs de Lima y, aparte, las de Colima (`system`).
fn list_all() -> Result<Vec<Guest>, Failure> {
    let mut guests = list_in(None, false)?;
    if let Some(colima) = colima_home().filter(|p| p.is_dir()) {
        guests.extend(list_in(Some(&colima), true).unwrap_or_default());
    }
    Ok(guests)
}

/// La última lectura y cuándo se hizo.
type Listing = Option<(Instant, Vec<Guest>)>;

fn cache() -> &'static Mutex<Listing> {
    static C: OnceLock<Mutex<Listing>> = OnceLock::new();
    C.get_or_init(Default::default)
}

/// La lista compartida: una lectura de `limactl list` cada pocos segundos.
fn shared() -> Vec<Guest> {
    let mut c = cache().lock().unwrap_or_else(|p| p.into_inner());
    if let Some((at, list)) = c.as_ref() {
        if at.elapsed() < LIST_FOR {
            return list.clone();
        }
    }
    let list = list_all().unwrap_or_default();
    *c = Some((Instant::now(), list.clone()));
    list
}

fn forget_list() {
    *cache().lock().unwrap_or_else(|p| p.into_inner()) = None;
}

/// Encendida según la lista compartida. Leer nunca la enciende.
pub fn running(guest: &str) -> bool {
    shared()
        .iter()
        .any(|g| !g.system && g.id == guest && g.state == GuestState::Running)
}

fn checked(guest: &str) -> Result<(), Failure> {
    if super::wsl_setup::valid_distro(guest) {
        Ok(())
    } else {
        Err(fail("invalid_distro", guest))
    }
}

/// `limactl create` sin montajes ni containerd, y luego `start`.
pub fn create(name: &str, on_line: &mut dyn FnMut(&str)) -> Result<(), Failure> {
    checked(name)?;
    let mut command = command()?;
    command.args([
        "create",
        "--name",
        name,
        "--cpus",
        "4",
        "--memory",
        "4",
        "--mount-none",
        "--containerd=none",
        "--tty=false",
        "template:ubuntu-lts",
    ]);
    let ran = super::run::run(&mut command, None, START_WAIT).map_err(run_failure)?;
    for line in String::from_utf8_lossy(&ran.stderr).lines() {
        on_line(line);
    }
    if !ran.status.success() {
        return Err(fail("lima_failed", tail(&ran.stderr)));
    }
    forget_list();
    Lima.start_vm(name)
}

fn tail(bytes: &[u8]) -> String {
    let text = String::from_utf8_lossy(bytes);
    let lines: Vec<&str> = text.lines().filter(|l| !l.trim().is_empty()).collect();
    lines[lines.len().saturating_sub(6)..].join("\n")
}

impl Lima {
    fn start_vm(&self, guest: &str) -> Result<(), Failure> {
        checked(guest)?;
        let mut command = command()?;
        command.args(["start", "--tty=false", guest]);
        let ran = super::run::run(&mut command, None, START_WAIT).map_err(run_failure)?;
        forget_list();
        if ran.status.success() {
            Ok(())
        } else {
            Err(fail("lima_failed", tail(&ran.stderr)))
        }
    }
}

/// El descriptor y el token del motor con un solo `limactl shell`. Lo leído
/// se queda en memoria: no pasa por `on_line`, un trabajo ni un error.
pub fn read_endpoint(guest: &str) -> Result<(Vec<u8>, String), Failure> {
    checked(guest)?;
    const SCRIPT: &str = r#"d="$HOME/.local/share/seldon-host/data/seldon-endpoint.json"
[ -f "$d" ] || exit 4
cat "$d"
printf '\n%s\n' DANIL_TOKEN
t=$(sed -n 's/.*"token_file"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$d" | head -n 1)
[ -n "$t" ] && cat "$t"
"#;
    let mut lines = Vec::new();
    let (code, _) = Lima
        .exec(guest, None, SCRIPT, &[], LIST_WAIT, &mut |l| {
            lines.push(l.to_string())
        })
        .map_err(|_| fail("app_unavailable", "descriptor"))?;
    if code != 0 {
        return Err(fail("app_unavailable", "descriptor"));
    }
    let split = lines
        .iter()
        .position(|l| l == "DANIL_TOKEN")
        .ok_or_else(|| fail("app_unavailable", "descriptor"))?;
    let descriptor = lines[..split].join("\n").into_bytes();
    let token = lines[split + 1..].join("").trim().to_string();
    if token.is_empty() {
        return Err(fail("app_unavailable", "token"));
    }
    Ok((descriptor, token))
}

impl super::Channel for Lima {
    fn kind(&self) -> ChannelKind {
        ChannelKind::Lima
    }

    /// En macOS siempre: sin `limactl`, «Linux en esta Mac» dice cómo instalarlo.
    fn available(&self) -> bool {
        cfg!(target_os = "macos")
    }

    fn list(&self) -> Result<Vec<Guest>, Failure> {
        forget_list();
        let list = list_all()?;
        *cache().lock().unwrap_or_else(|p| p.into_inner()) = Some((Instant::now(), list.clone()));
        Ok(list)
    }

    fn start(&self, guest: &str) -> Result<(), Failure> {
        if running(guest) {
            return Ok(());
        }
        self.start_vm(guest)
    }

    /// `user` solo cambia algo si es `root`: entonces corre con `sudo -n`, que
    /// falla en vez de pedir una contraseña escondida.
    fn exec(
        &self,
        guest: &str,
        user: Option<&str>,
        stdin: &str,
        args: &[&str],
        deadline: Duration,
        on_line: &mut dyn FnMut(&str),
    ) -> Result<(i32, String), Failure> {
        checked(guest)?;
        let mut command = command()?;
        command.args(["shell", "--workdir", "/", guest]);
        if user == Some("root") {
            command.args(["sudo", "-n"]);
        }
        command.args(["sh", "-s", "--"]).args(args);
        super::run::stream(ChannelKind::Lima, command, stdin, deadline, on_line)
    }

    fn unpack(&self, guest: &str, _user: &str, dest: &str) -> Result<Command, Failure> {
        checked(guest)?;
        let mut command = command()?;
        command.args([
            "shell",
            "--workdir",
            "/",
            guest,
            "sh",
            "-c",
            "tar -x -f - -C \"$1\"",
            "sh",
            dest,
        ]);
        Ok(command)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// `limactl list --json` de limactl 2.2.1 en una Mac, recortado.
    const LISTED: &str = include_str!("fixtures/limactl-list.jsonl");

    #[test]
    fn reads_the_measured_list() {
        let guests = parse_list(LISTED, false);
        assert_eq!(guests.len(), 2);
        assert_eq!(guests[0].id, "danil-test");
        assert_eq!(guests[0].state, GuestState::Running);
        assert_eq!(guests[0].arch.as_deref(), Some("aarch64"));
        assert_eq!(guests[0].detail.as_deref(), Some("vz"));
        assert_eq!(guests[1].state, GuestState::Stopped);
        assert!(!guests[1].system);
        assert!(parse_list(LISTED, true).iter().all(|g| g.system));
    }

    #[test]
    fn skips_lines_it_does_not_understand_and_unsafe_names() {
        let text = "basura\n{\"name\":\"x;rm\",\"status\":\"Running\"}\n{\"name\":\"ok\",\"status\":\"Broken\"}\n";
        let guests = parse_list(text, false);
        assert_eq!(guests.len(), 1);
        assert_eq!(guests[0].state, GuestState::Unknown);
        assert_eq!(guests[0].state_raw, "Broken");
    }
}
