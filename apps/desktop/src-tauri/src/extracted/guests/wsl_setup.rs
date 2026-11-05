//! Lo que solo existe en WSL para «Linux en esta PC»: `wsl.exe`, el catálogo
//! de distros de Microsoft, instalar una distro y crear su usuario, activar
//! WSL, el reinicio pendiente, mantener viva la distro y las rutas
//! `\\wsl.localhost`. Lo que no depende del canal está en `child.rs`.
#![cfg_attr(not(windows), allow(dead_code, unused_imports))]

use super::child::{
    classify, current, install_engine, job_paused, job_speed, load, progress, read_saved, start,
    status, update, write_saved, ChildInfo, Job, JobError, Resume,
};
use super::{exec_ok, fail, now_ms, ChannelKind, Failure};
use serde::Serialize;
use serde_json::Value;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

const CATALOG_URL: &str =
    "https://raw.githubusercontent.com/microsoft/WSL/master/distributions/DistributionInfo.json";

// ---------------------------------------------------------------- wsl.exe

/// Cada espera a `wsl()` lleva plazo: `exec` y `wait_wsl` lo cuentan. Sólo
/// `keep_alive` (vive con la ventana y nadie lo espera) y la copia de una
/// carpeta no lo llevan: proceso largo: a propósito.
pub(super) fn wsl() -> Command {
    let mut command = Command::new("wsl.exe");
    crate::util::no_console_window(&mut command);
    command.env("WSL_UTF8", "1");
    command
}

pub(super) fn valid_distro(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 64
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
}

/// Un `wsl.exe` corto con su salida; al vencer el plazo se mata.
fn wait_wsl(args: &[&str], timeout: Duration) -> std::io::Result<std::process::Output> {
    crate::util::captured_output_with_timeout(wsl().args(args), timeout)
}

/// La carpeta copiada entra a la distro por stdin: `tar` la desempaca en `dest`.
pub fn unpack(distro: &str, user: &str, dest: &str) -> Command {
    let mut command = wsl();
    command.args([
        "-d",
        distro,
        "-u",
        user,
        "--exec",
        "sh",
        "-c",
        "tar -x -f - -C \"$1\"",
        "sh",
        dest,
    ]);
    command
}

/// El usuario por omisión de la distro: `uid`, nombre y carpeta.
#[derive(Debug, Clone, Serialize)]
pub struct DistroUser {
    pub uid: u32,
    pub user: String,
    pub home: String,
}

pub fn distro_user(distro: &str) -> Result<DistroUser, Failure> {
    if !valid_distro(distro) {
        return Err(fail("invalid_distro", distro));
    }
    let mut lines = Vec::new();
    exec_ok(
        ChannelKind::Wsl,
        distro,
        None,
        "id -u; id -un; printf '%s\\n' \"$HOME\"\n",
        &[],
        Duration::from_secs(60),
        |l| lines.push(l.to_string()),
    )?;
    let uid = lines
        .first()
        .and_then(|l| l.trim().parse().ok())
        .ok_or_else(|| fail("wsl_failed", "id"))?;
    Ok(DistroUser {
        uid,
        user: lines.get(1).cloned().unwrap_or_default(),
        home: lines.get(2).cloned().unwrap_or_default(),
    })
}

// ---------------------------------------------------------------- mantener viva

/// WSL apaga una distro unos segundos después de que se cierra el último
/// `wsl.exe`, y con ella el motor. Mientras la ventana la use se queda abierto
/// un `wsl.exe` que espera en su stdin: al cerrarse la ventana, el pipe se
/// cierra, `cat` termina y WSL puede apagarla.
fn keepalive() -> &'static Mutex<HashMap<String, Child>> {
    static K: OnceLock<Mutex<HashMap<String, Child>>> = OnceLock::new();
    K.get_or_init(Default::default)
}

pub fn keep_alive(distro: &str) {
    let mut map = keepalive().lock().unwrap_or_else(|p| p.into_inner());
    if let Some(child) = map.get_mut(distro) {
        if matches!(child.try_wait(), Ok(None)) {
            return;
        }
    }
    let spawned = wsl()
        .args(["-d", distro, "--exec", "sh", "-c", "cat >/dev/null"])
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn();
    if let Ok(child) = spawned {
        map.insert(distro.to_string(), child);
    }
}

pub fn let_sleep(distro: &str) {
    let mut map = keepalive().lock().unwrap_or_else(|p| p.into_inner());
    if let Some(mut child) = map.remove(distro) {
        drop(child.stdin.take());
        let _ = child.kill();
        let _ = child.wait();
    }
}

/// `\\wsl.localhost\<distro>\home\...` para una ruta de Linux.
pub(super) fn unc(distro: &str, linux: &str) -> PathBuf {
    PathBuf::from(format!(
        r"\\wsl.localhost\{distro}{}",
        linux.replace('/', "\\")
    ))
}

pub(super) fn running_distros() -> Vec<String> {
    let Ok(out) = wait_wsl(&["--list", "--running", "--quiet"], Duration::from_secs(15)) else {
        return Vec::new();
    };
    super::wsl::decode(&out.stdout)
        .lines()
        .map(|l| l.replace('\0', "").trim().to_string())
        .filter(|l| !l.is_empty())
        .collect()
}

// ---------------------------------------------------------------- catálogo

#[derive(Debug, Clone, Serialize)]
pub struct CatalogItem {
    pub name: String,
    pub label: String,
    pub url: String,
    pub sha256: String,
    pub default: bool,
    pub size: Option<u64>,
    /// Danil sabe instalar lo que necesita el motor (apt o dnf).
    pub supported: bool,
}

fn supported_family(name: &str) -> bool {
    let n = name.to_lowercase();
    [
        "ubuntu",
        "debian",
        "kali",
        "fedora",
        "almalinux",
        "oraclelinux",
        "oracle",
    ]
    .iter()
    .any(|f| n.starts_with(f))
}

pub fn catalog() -> Result<Vec<CatalogItem>, Failure> {
    let body: Value = ureq::get(CATALOG_URL)
        .call()
        .map_err(|e| fail("network", e.to_string()))?
        .body_mut()
        .read_json()
        .map_err(|e| fail("network", e.to_string()))?;
    let mut out = Vec::new();
    if let Some(families) = body["ModernDistributions"].as_object() {
        for list in families.values() {
            for d in list.as_array().into_iter().flatten() {
                let name = d["Name"].as_str().unwrap_or_default();
                let url = d["Amd64Url"]["Url"].as_str().unwrap_or_default();
                let sha = d["Amd64Url"]["Sha256"].as_str().unwrap_or_default();
                if name.is_empty()
                    || url.is_empty()
                    || sha.len() != 64
                    || !url.starts_with("https://")
                    || !valid_distro(name)
                {
                    continue;
                }
                out.push(CatalogItem {
                    name: name.to_string(),
                    label: d["FriendlyName"].as_str().unwrap_or(name).to_string(),
                    url: url.to_string(),
                    sha256: sha.to_ascii_lowercase(),
                    default: d["Default"].as_bool().unwrap_or(false),
                    size: None,
                    supported: supported_family(name),
                });
            }
        }
    }
    // El tamaño de cada imagen, en paralelo: una sola lista no debe tardar.
    let handles: Vec<_> = out
        .iter()
        .map(|i| {
            let url = i.url.clone();
            std::thread::spawn(move || {
                ureq::head(&url)
                    .config()
                    .timeout_global(Some(Duration::from_secs(6)))
                    .build()
                    .call()
                    .ok()
                    .and_then(|r| {
                        r.headers()
                            .get("content-length")
                            .and_then(|v| v.to_str().ok())
                            .and_then(|v| v.parse::<u64>().ok())
                    })
            })
        })
        .collect();
    for (item, h) in out.iter_mut().zip(handles) {
        item.size = h.join().ok().flatten();
    }
    Ok(out)
}

// ---------------------------------------------------------------- instalar distro

fn valid_user(user: &str) -> bool {
    let mut chars = user.chars();
    matches!(chars.next(), Some(c) if c.is_ascii_lowercase())
        && user.len() <= 32
        && chars.all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-' || c == '_')
        && !matches!(
            user,
            "root"
                | "daemon"
                | "bin"
                | "sys"
                | "sync"
                | "games"
                | "man"
                | "nobody"
                | "admin"
                | "ubuntu"
                | "messagebus"
                | "systemd-network"
        )
}

/// Baja la imagen con avance, la verifica y la registra en WSL. `wsl
/// --install -d` se quedó colgado dos veces sin decir nada; así se ve el avance
/// y se puede reintentar desde donde quedó.
fn download(app: &AppHandle, target: &str, url: &str, sha: &str) -> Result<PathBuf, Failure> {
    use sha2::{Digest, Sha256};
    let dir = std::env::temp_dir().join("danil-wsl");
    std::fs::create_dir_all(&dir).map_err(|e| fail("io", e.to_string()))?;
    let path = dir.join(format!("{target}.wsl"));
    if verified(&path, sha) {
        progress(app, target, "verify", None, None);
        return Ok(path);
    }
    let mut attempts = 0;
    loop {
        attempts += 1;
        let have = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
        let mut request = ureq::get(url);
        if have > 0 {
            request = request.header("Range", &format!("bytes={have}-"));
        }
        let result = (|| -> Result<(), String> {
            let mut response = request.call().map_err(|e| e.to_string())?;
            let partial = response.status().as_u16() == 206;
            let length: Option<u64> = response
                .headers()
                .get("content-length")
                .and_then(|v| v.to_str().ok())
                .and_then(|v| v.parse().ok());
            let start = if partial { have } else { 0 };
            let total = length.map(|l| l + start);
            let mut file = std::fs::OpenOptions::new()
                .create(true)
                .write(true)
                .append(partial)
                .truncate(!partial)
                .open(&path)
                .map_err(|e| e.to_string())?;
            let mut reader = response.body_mut().as_reader();
            let mut buf = vec![0u8; 1 << 16];
            let mut done = start;
            let mut last = Instant::now();
            let mut window = (Instant::now(), done);
            loop {
                while job_paused() {
                    std::thread::sleep(Duration::from_millis(300));
                }
                let n = reader.read(&mut buf).map_err(|e| e.to_string())?;
                if n == 0 {
                    break;
                }
                file.write_all(&buf[..n]).map_err(|e| e.to_string())?;
                done += n as u64;
                if window.0.elapsed() >= Duration::from_secs(1) {
                    let secs = window.0.elapsed().as_secs_f64().max(0.001);
                    job_speed(((done - window.1) as f64 / secs) as u64);
                    window = (Instant::now(), done);
                }
                if last.elapsed() > Duration::from_millis(250) {
                    progress(app, target, "download", Some(done), total);
                    last = Instant::now();
                }
            }
            progress(app, target, "download", Some(done), total);
            Ok(())
        })();
        if result.is_ok() {
            break;
        }
        if attempts >= 6 {
            return Err(fail("network", result.err().unwrap_or_default()));
        }
        std::thread::sleep(Duration::from_secs(3));
    }
    progress(app, target, "verify", None, None);
    let mut hasher = Sha256::new();
    let mut file = std::fs::File::open(&path).map_err(|e| fail("io", e.to_string()))?;
    std::io::copy(&mut file, &mut hasher).map_err(|e| fail("io", e.to_string()))?;
    let got = format!("{:x}", hasher.finalize());
    if got != sha {
        let _ = std::fs::remove_file(&path);
        return Err(fail("checksum", got));
    }
    Ok(path)
}

fn verified(path: &std::path::Path, sha: &str) -> bool {
    use sha2::{Digest, Sha256};
    let Ok(mut file) = std::fs::File::open(path) else {
        return false;
    };
    let mut hasher = Sha256::new();
    std::io::copy(&mut file, &mut hasher).is_ok() && format!("{:x}", hasher.finalize()) == sha
}

/// Crea el usuario como lo pide Ubuntu al abrirse la primera vez: nombre y
/// contraseña (la de `sudo`). La contraseña viaja por stdin, codificada, y no
/// se guarda en ningún lado.
pub(super) fn create_user(distro: &str, user: &str, password: &str) -> Result<(), Failure> {
    use base64::Engine as _;
    if !valid_user(user) {
        return Err(fail("invalid_user", user));
    }
    if password.is_empty() || password.contains('\n') {
        return Err(fail("invalid_password", ""));
    }
    let secret = base64::engine::general_purpose::STANDARD.encode(format!("{user}:{password}"));
    let body = format!(
        r#"set -eu
u='{user}'
if ! id -u "$u" >/dev/null 2>&1; then
  useradd -m -s /bin/bash "$u"
fi
for g in sudo adm; do getent group "$g" >/dev/null && usermod -aG "$g" "$u"; done
printf '%s' '{secret}' | base64 -d | chpasswd
touch /etc/wsl.conf
if grep -q '^\[user\]' /etc/wsl.conf; then
  sed -i '/^\[user\]/,/^\[/{{s/^default=.*/default='"$u"'/}}' /etc/wsl.conf
  grep -q '^default=' /etc/wsl.conf || sed -i '/^\[user\]/a default='"$u" /etc/wsl.conf
else
  printf '\n[user]\ndefault=%s\n' "$u" >> /etc/wsl.conf
fi
grep -q '^\[boot\]' /etc/wsl.conf || printf '\n[boot]\nsystemd=true\n' >> /etc/wsl.conf
"#
    );
    exec_ok(
        ChannelKind::Wsl,
        distro,
        Some("root"),
        &body,
        &[],
        Duration::from_secs(120),
        |_| {},
    )?;
    // El usuario por omisión y systemd se leen al arrancar la distro.
    let _ = wait_wsl(&["--terminate", distro], Duration::from_secs(60));
    Ok(())
}

pub fn install_distro(
    app: &AppHandle,
    name: &str,
    url: &str,
    sha: &str,
    user: &str,
    password: &str,
) -> Result<(), Failure> {
    if !valid_distro(name) {
        return Err(fail("invalid_distro", name));
    }
    if !valid_user(user) {
        return Err(fail("invalid_user", user));
    }
    if !url.starts_with("https://") || sha.len() != 64 {
        return Err(fail("invalid_request", "url"));
    }
    progress(app, name, "download", Some(0), None);
    let file = download(app, name, url, &sha.to_ascii_lowercase())?;
    progress(app, name, "register", None, None);
    // Registrar la imagen la descomprime en el disco virtual: minutos, no horas.
    let output = crate::util::captured_output_with_timeout(
        wsl()
            .args(["--install", "--from-file"])
            .arg(&file)
            .args(["--name", name, "--no-launch"]),
        Duration::from_secs(20 * 60),
    )
    .map_err(|e| match e.kind() {
        std::io::ErrorKind::TimedOut => fail("wsl_timeout", "install"),
        _ => fail("io", e.to_string()),
    })?;
    if !output.status.success() {
        // La imagen se queda en la carpeta temporal: después del reinicio se reutiliza.
        let text = super::wsl::decode(&output.stdout) + &super::wsl::decode(&output.stderr);
        return Err(fail("wsl_failed", text.trim().to_string()));
    }
    let _ = std::fs::remove_file(&file);
    progress(app, name, "user", None, None);
    create_user(name, user, password)?;
    Ok(())
}

/// Activa WSL con permiso de administrador (el aviso de Windows). Pide
/// reiniciar: hasta entonces la distro no arranca.
pub fn enable() -> Result<(), Failure> {
    // Espera a que la persona conteste el aviso de UAC y a que WSL se active
    // (proceso largo: a propósito): no hay plazo que no la corte a la mitad.
    let mut command = Command::new("powershell.exe");
    crate::util::no_console_window(&mut command);
    let status = command
        .args([
            "-NoProfile",
            "-Command",
            "Start-Process -FilePath wsl.exe -ArgumentList '--install','--no-distribution' -Verb RunAs -Wait -WindowStyle Hidden",
        ])
        .status()
        .map_err(|e| fail("io", e.to_string()))?;
    if status.success() {
        Ok(())
    } else {
        Err(fail("elevation_refused", ""))
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct DistroRow {
    pub name: String,
    pub state: String,
    pub version: Option<u8>,
    pub default: bool,
    pub system: bool,
    pub child: Option<ChildInfo>,
}

#[derive(Debug, Clone, Serialize)]
pub struct LinuxState {
    /// `ready` · `missing` · `reboot` · `virtualization` · `unsupported` · `unknown`.
    pub wsl: String,
    pub distros: Vec<DistroRow>,
    pub job: Option<Job>,
    pub resume: Option<Resume>,
    pub detail: Option<String>,
}

pub fn start_enable(app: &AppHandle) -> Result<Job, Job> {
    start(app, "enable", "wsl", "Linux", None, |app| {
        enable()?;
        let mut saved = read_saved(app);
        saved.enabled_at = Some(now_ms());
        write_saved(app, &saved);
        Ok(())
    })
}

pub struct InstallRequest {
    pub name: String,
    pub label: String,
    pub url: String,
    pub sha256: String,
    pub user: String,
    pub password: String,
    pub workspace: Option<(String, String)>,
}

pub fn start_install(app: &AppHandle, req: InstallRequest) -> Result<Job, Job> {
    let (name, label, user) = (req.name.clone(), req.label.clone(), req.user.clone());
    start(app, "install", &name, &label, Some(&user), move |app| {
        let resume = Resume {
            name: req.name.clone(),
            label: req.label.clone(),
            url: req.url.clone(),
            sha256: req.sha256.clone(),
            user: req.user.clone(),
        };
        let result = install_distro(
            app,
            &req.name,
            &req.url,
            &req.sha256,
            &req.user,
            &req.password,
        );
        let mut saved = read_saved(app);
        match &result {
            Err(e) if classify(e).code == "reboot_required" => saved.resume = Some(resume),
            Ok(()) => saved.resume = None,
            Err(_) => {}
        }
        write_saved(app, &saved);
        result?;
        let ws = req
            .workspace
            .as_ref()
            .map(|(i, n)| (i.as_str(), n.as_str()));
        install_engine(app, &req.name, None, None, &req.label, ws).map(|_| ())
    })
}

#[cfg(windows)]
fn boot_time_ms() -> u64 {
    #[link(name = "kernel32")]
    extern "system" {
        fn GetTickCount64() -> u64;
    }
    now_ms().saturating_sub(unsafe { GetTickCount64() })
}

#[cfg(not(windows))]
fn boot_time_ms() -> u64 {
    0
}

/// Windows dice que hay un reinicio pendiente de mantenimiento (activar componentes).
fn reboot_pending() -> bool {
    let mut command = Command::new("reg.exe");
    crate::util::no_console_window(&mut command);
    command.args([
        "query",
        r"HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing\RebootPending",
    ]);
    crate::util::output_with_timeout(&mut command, Duration::from_secs(10))
        .is_ok_and(|s| s.success())
}

fn virtualization_off() -> bool {
    let Ok(out) = wait_wsl(&["--status"], Duration::from_secs(15)) else {
        return false;
    };
    let text = (super::wsl::decode(&out.stdout) + &super::wsl::decode(&out.stderr)).to_lowercase();
    text.contains("virtualización no está habilitada")
        || text.contains("virtualizacion no esta habilitada")
        || text.contains("virtualization is not enabled")
        || text.contains("wsl2 no se puede iniciar")
        || text.contains("wsl2 is unable to start")
}

/// Todo lo que muestra «Linux en esta PC», de una vez. La pantalla lo pide al
/// abrir y vuelve a pedirlo cuando un trabajo termina.
pub fn state(app: &AppHandle) -> LinuxState {
    let saved = read_saved(app);
    {
        let mut c = current().lock().unwrap_or_else(|p| p.into_inner());
        c.app.get_or_insert_with(|| app.clone());
        if c.job.is_none() {
            // Un trabajo guardado que nadie corre: la app se cerró a la mitad.
            if let Some(mut job) = saved.job.clone() {
                if !job.finished {
                    job.finished = true;
                    if job.kind != "enable" {
                        job.error = Some(JobError {
                            code: "interrupted".into(),
                            detail: String::new(),
                        });
                    } else {
                        job.step = "done".into();
                    }
                }
                c.job = Some(job);
            }
        }
    }
    let job = current()
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .job
        .clone();
    let enabled_since_boot = saved.enabled_at.is_some_and(|t| t > boot_time_ms());
    let mut out = LinuxState {
        wsl: "unknown".into(),
        distros: Vec::new(),
        job,
        resume: saved.resume.clone(),
        detail: None,
    };
    match super::wsl::detect() {
        Err(super::wsl::WslError::Unsupported) => out.wsl = "unsupported".into(),
        Err(super::wsl::WslError::NotInstalled) => {
            out.wsl = if enabled_since_boot || reboot_pending() {
                "reboot"
            } else {
                "missing"
            }
            .into();
        }
        Err(e) => {
            out.detail = Some(e.to_string());
        }
        Ok(found) => {
            // Las que ya corren se leen de su disco (no se enciende nada); las demás,
            // solo por el puerto que ya se conocía.
            let running: Vec<String> = found
                .distros
                .iter()
                .filter(|d| d.running())
                .map(|d| d.name.clone())
                .collect();
            // Una distribución borrada por fuera de Danil deja de ser máquina.
            let mut entries = load(app);
            let before = entries.len();
            entries.retain(|e| found.distros.iter().any(|d| d.name == e.distro));
            if entries.len() != before {
                let _ = update(app, |saved| {
                    saved.retain(|e| found.distros.iter().any(|d| d.name == e.distro))
                });
                let _ = app.emit("guest-state-changed", ());
            }
            let children: Vec<ChildInfo> = entries
                .iter()
                .map(|e| status(e, running.contains(&e.distro)))
                .collect();
            out.distros = found
                .distros
                .into_iter()
                .map(|d| DistroRow {
                    system: is_system_distro(&d.name),
                    child: children.iter().find(|c| c.distro == d.name).cloned(),
                    name: d.name,
                    state: d.state,
                    version: d.version,
                    default: d.default,
                })
                .collect();
            out.wsl = if virtualization_off() {
                if enabled_since_boot || reboot_pending() {
                    "reboot"
                } else {
                    "virtualization"
                }
            } else {
                "ready"
            }
            .into();
        }
    }
    out
}

pub(super) fn is_system_distro(name: &str) -> bool {
    let n = name.to_lowercase();
    ["docker-desktop", "rancher-desktop", "podman-machine"]
        .iter()
        .any(|p| n.starts_with(p))
}

/// Reinicia Windows en unos segundos, a pedido de la persona.
pub fn reboot() -> Result<(), Failure> {
    let mut command = Command::new("shutdown.exe");
    crate::util::no_console_window(&mut command);
    command.args([
        "/r",
        "/t",
        "5",
        "/c",
        "Danil: reinicio para terminar de activar Linux",
    ]);
    let status = crate::util::output_with_timeout(&mut command, Duration::from_secs(15))
        .map_err(|e| fail("io", e.to_string()))?;
    if status.success() {
        Ok(())
    } else {
        Err(fail("io", "shutdown"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn users_follow_the_ubuntu_rules() {
        assert!(valid_user("mau"));
        assert!(valid_user("mauricio_c-2"));
        assert!(!valid_user("Mau"));
        assert!(!valid_user("2mau"));
        assert!(!valid_user("root"));
        assert!(!valid_user("mi usuario"));
        assert!(!valid_user(&"a".repeat(33)));
    }

    #[test]
    fn distro_names_are_plain() {
        assert!(valid_distro("Ubuntu-24.04"));
        assert!(!valid_distro("Mi Ubuntu"));
        assert!(!valid_distro("x;rm"));
    }

    #[test]
    fn unc_paths_point_into_the_distro() {
        assert_eq!(
            unc("Ubuntu", "/home/mau/x"),
            PathBuf::from(r"\\wsl.localhost\Ubuntu\home\mau\x")
        );
    }
}
