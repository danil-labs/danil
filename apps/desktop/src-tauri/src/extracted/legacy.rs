//! Lo que el lanzador lee de una raíz de 0.2.74 sin escribir en ella: si ya se
//! adoptó, qué servicios siguen vivos, si su ventana sigue abierta y si Git trabaja.
use serde_json::{json, Value};
use std::{
    net::SocketAddr,
    path::{Path, PathBuf},
    time::Duration,
};

const OWN: [&str; 3] = ["seldon-runtime.lock", "host.log", "host.log.1"];

#[derive(PartialEq, Clone, Copy)]
pub enum Root {
    Fresh,
    Adopted,
    Legacy,
}

/// La misma regla que la autoridad del motor: fuera de lo suyo, todo es dominio que adoptar.
pub fn classify(data: &Path) -> Root {
    if data.join("seldon-authority.json").exists() {
        return Root::Adopted;
    }
    let Ok(entries) = std::fs::read_dir(data) else {
        return Root::Fresh;
    };
    let foreign = entries
        .flatten()
        .any(|entry| !OWN.iter().any(|own| entry.file_name() == *own));
    if foreign {
        Root::Legacy
    } else {
        Root::Fresh
    }
}

pub struct Lane {
    pub pid: u32,
    address: SocketAddr,
    token: String,
    status: Value,
}

/// Los servicios de 0.2.74 que contestan sobre esta raíz; el motor no cuenta.
pub fn lanes(data: &Path) -> Vec<Lane> {
    let Ok(families) = std::fs::read_dir(data.join("services")) else {
        return Vec::new();
    };
    families
        .flatten()
        .filter_map(|family| std::fs::read_dir(family.path()).ok())
        .flatten()
        .flatten()
        .filter_map(|lane| answering(&lane.path().join("endpoint.json")))
        .collect()
}

fn answering(path: &PathBuf) -> Option<Lane> {
    let endpoint: Value = serde_json::from_slice(&std::fs::read(path).ok()?).ok()?;
    // 0.2.74 deja su endpoint en disco al morir, y en Windows conectar a un puerto cerrado tarda segundos.
    if !alive(u32::try_from(endpoint["pid"].as_u64()?).ok()?) {
        return None;
    }
    let address: SocketAddr = endpoint["address"].as_str()?.parse().ok()?;
    let token = endpoint["token"].as_str()?.to_owned();
    let status =
        terminus_engine_client::call(address, &token, "status", json!({}), Duration::from_secs(2))
            .ok()?;
    if status["product"] == terminus_engine_protocol::PRODUCT {
        return None;
    }
    Some(Lane {
        pid: status["pid"]
            .as_u64()
            .or(endpoint["pid"].as_u64())
            .and_then(|pid| u32::try_from(pid).ok())?,
        address,
        token,
        status,
    })
}

/// Turnos vivos según su `status`, si lo dice.
pub fn busy(lane: &Lane) -> Option<u64> {
    turns(&lane.status["busy"])
}

fn turns(busy: &Value) -> Option<u64> {
    let operations = busy["operations"].as_array().map_or(0, |o| o.len() as u64);
    match &busy["turns"] {
        Value::Null if busy.is_object() => Some(operations),
        value => value.as_u64().map(|turns| turns + operations),
    }
}

pub enum Stop {
    Stopping,
    Busy(Option<u64>),
}

/// `service stop` se niega con `task_busy` mientras haya trabajo: pedirlo no corta nada.
pub fn stop(lane: &Lane) -> Stop {
    match terminus_engine_client::call(
        lane.address,
        &lane.token,
        "service stop",
        json!({}),
        Duration::from_secs(3),
    ) {
        Ok(_) => Stop::Stopping,
        Err(error) if error.code == "task_busy" => Stop::Busy(turns(&error.detail)),
        Err(_) => Stop::Busy(None),
    }
}

/// Una ventana de 0.2.74 sin su servicio repite `app_unavailable` en su log cada
/// pocos segundos: con el motor vivo, eso es una 0.2.74 abierta y en blanco.
pub fn blank_window(data: &Path) -> bool {
    let log = data.join("logs").join("Terminus.log");
    let recent = std::fs::metadata(&log)
        .and_then(|m| m.modified())
        .is_ok_and(|at| at.elapsed().is_ok_and(|age| age < Duration::from_secs(60)));
    recent
        && std::fs::read(&log).is_ok_and(|bytes| {
            let tail = &bytes[bytes.len().saturating_sub(4096)..];
            String::from_utf8_lossy(tail).contains("app_unavailable")
        })
}

/// El `git gc` o el empaquetado que la autoridad del motor también espera.
pub fn git_busy(data: &Path) -> bool {
    let Ok(workspaces) = std::fs::read_dir(data.join("workspaces")) else {
        return false;
    };
    workspaces
        .flatten()
        .filter_map(|workspace| std::fs::read_dir(workspace.path().join("repos")).ok())
        .flatten()
        .flatten()
        .map(|repo| repo.path().join("git/.git"))
        .any(|git| {
            git.join("gc.pid").exists()
                || std::fs::read_dir(git.join("objects/pack")).is_ok_and(|pack| {
                    pack.flatten()
                        .any(|entry| entry.file_name().to_string_lossy().starts_with("tmp_pack_"))
                })
        })
}

#[cfg(windows)]
pub fn alive(pid: u32) -> bool {
    windows::alive(pid)
}
#[cfg(unix)]
pub fn alive(pid: u32) -> bool {
    pid > 0
        && i32::try_from(pid).is_ok_and(|pid| unsafe { libc::kill(pid, 0) } == 0 || std::io::Error::last_os_error().raw_os_error() == Some(libc::EPERM))
}

/// Termina un motor que no aceptó pararse; sus turnos mueren con él, como en el instalador.
#[cfg(windows)]
pub fn terminate(pid: u32) {
    windows::terminate(pid);
}
#[cfg(unix)]
pub fn terminate(pid: u32) {
    let Ok(pid) = i32::try_from(pid) else {
        return;
    };
    if pid <= 0 {
        return;
    }
    // SAFETY: solo envía una señal a un pid concreto.
    unsafe { libc::kill(pid, libc::SIGTERM) };
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(10);
    while std::time::Instant::now() < deadline {
        if !alive(pid as u32) {
            return;
        }
        std::thread::sleep(std::time::Duration::from_millis(200));
    }
    // SAFETY: igual que arriba.
    unsafe { libc::kill(pid, libc::SIGKILL) };
}

/// La ventana de 0.2.74 es la madre de su servicio: viva y con su mismo ejecutable, sigue abierta.
#[cfg(windows)]
pub fn window_open(service: u32) -> Option<bool> {
    let parent = windows::parent(service)?;
    let (image, created) = windows::image(service)?;
    Some(windows::image(parent).is_some_and(|(theirs, born)| theirs == image && born <= created))
}

#[cfg(target_os = "linux")]
pub fn window_open(service: u32) -> Option<bool> {
    let stat = std::fs::read_to_string(format!("/proc/{service}/stat")).ok()?;
    let parent: u32 = stat
        .rsplit_once(')')?
        .1
        .split_whitespace()
        .nth(1)?
        .parse()
        .ok()?;
    let image = std::fs::read_link(format!("/proc/{service}/exe")).ok()?;
    Some(parent > 1 && std::fs::read_link(format!("/proc/{parent}/exe")).ok() == Some(image))
}

#[cfg(not(any(windows, target_os = "linux")))]
pub fn window_open(_service: u32) -> Option<bool> {
    None
}

/// El instalador aparta a `old_*` el ejecutable en uso; el sistema da la ruta actual, no la de arranque.
#[cfg(windows)]
pub fn set_aside(pid: u32) -> bool {
    windows::image(pid).is_some_and(|(image, _)| {
        Path::new(&image)
            .file_name()
            .is_some_and(|name| name.to_string_lossy().starts_with("old_"))
    })
}
#[cfg(not(windows))]
pub fn set_aside(_pid: u32) -> bool {
    false
}

/// La ruta de hoy del ejecutable de un proceso, en minúsculas: la que dejó el instalador.
#[cfg(windows)]
pub fn image_path(pid: u32) -> Option<PathBuf> {
    windows::image(pid).map(|(image, _)| PathBuf::from(image))
}
#[cfg(not(windows))]
pub fn image_path(_pid: u32) -> Option<PathBuf> {
    None
}

/// El motor junto a `exe`: `danil-engine` en macOS; `seldon-runtime` en Windows, Linux
/// y versiones anteriores.
pub fn sibling_engine(exe: &Path) -> PathBuf {
    let named = |name: &str| exe.with_file_name(format!("{name}{}", std::env::consts::EXE_SUFFIX));
    let current = named("danil-engine");
    if current.is_file() {
        current
    } else {
        named("seldon-runtime")
    }
}

/// El motor vivo corre de un binario que ya no es el instalado. `deep` compara
/// además el contenido de la copia del AppImage, que solo cambia al arrancar.
#[cfg(windows)]
pub fn engine_replaced(pid: u32, _deep: bool) -> bool {
    set_aside(pid)
}
#[cfg(target_os = "linux")]
pub fn engine_replaced(pid: u32, deep: bool) -> bool {
    let Ok(running) = std::fs::read_link(format!("/proc/{pid}/exe")) else {
        return false;
    };
    if running.to_string_lossy().ends_with(" (deleted)") {
        return true;
    }
    let bundled = std::env::current_exe().map(|exe| sibling_engine(&exe));
    deep && std::env::var_os("APPIMAGE").is_some()
        && bundled.is_ok_and(|bundled| {
            bundled != running && std::fs::read(&bundled).ok() != std::fs::read(&running).ok()
        })
}
#[cfg(target_os = "macos")]
pub fn engine_replaced(pid: u32, _deep: bool) -> bool {
    let Ok(pid) = i32::try_from(pid) else {
        return false;
    };
    let mut path = vec![0u8; 4096];
    // SAFETY: el búfer es nuestro y se le pasa su tamaño.
    let length = unsafe { libc::proc_pidpath(pid, path.as_mut_ptr().cast(), path.len() as u32) };
    let bundled = std::env::current_exe().map(|exe| sibling_engine(&exe));
    let Ok(bundled) = bundled else {
        return false;
    };
    if length <= 0 {
        return false;
    }
    let running = PathBuf::from(String::from_utf8_lossy(&path[..length as usize]).into_owned());
    running != bundled && running.canonicalize().ok() != bundled.canonicalize().ok()
}

/// Dentro de un AppImage el motor vive en un montaje que desaparece con la ventana:
/// se copia a una ruta fija fuera de la raíz.
#[cfg(target_os = "linux")]
pub fn stable_engine(bundled: &Path, window: &Path) -> std::io::Result<PathBuf> {
    use std::os::unix::fs::PermissionsExt;
    if std::env::var_os("APPIMAGE").is_none() {
        return Ok(bundled.to_path_buf());
    }
    let folder = window.join("engine");
    let target = folder.join("seldon-runtime");
    let bundled = std::fs::read(bundled)?;
    if std::fs::read(&target).is_ok_and(|current| current == bundled) {
        return Ok(target);
    }
    std::fs::create_dir_all(&folder)?;
    let staged = folder.join("seldon-runtime.next");
    std::fs::write(&staged, &bundled)?;
    std::fs::set_permissions(&staged, std::fs::Permissions::from_mode(0o700))?;
    std::fs::rename(&staged, &target)?;
    Ok(target)
}

/// Copia los recursos del montaje a `target`, entera y de una vez.
#[cfg(target_os = "linux")]
pub fn mirror(source: &Path, target: &Path) -> std::io::Result<()> {
    fn copy(from: &Path, to: &Path) -> std::io::Result<()> {
        std::fs::create_dir_all(to)?;
        for entry in std::fs::read_dir(from)? {
            let entry = entry?;
            let path = to.join(entry.file_name());
            if entry.file_type()?.is_dir() {
                copy(&entry.path(), &path)?;
            } else {
                std::fs::copy(entry.path(), path)?;
            }
        }
        Ok(())
    }
    // Otra ventana pudo dejar la copia con un motor vivo leyéndola: solo se rehace si cambió.
    fn same(from: &Path, to: &Path) -> bool {
        let Ok(entries) = std::fs::read_dir(from) else {
            return false;
        };
        entries.flatten().all(|entry| {
            let path = to.join(entry.file_name());
            match (entry.metadata(), std::fs::metadata(&path)) {
                (Ok(a), Ok(b)) if a.is_dir() && b.is_dir() => same(&entry.path(), &path),
                (Ok(a), Ok(b)) => a.is_file() && b.is_file() && a.len() == b.len(),
                _ => false,
            }
        })
    }
    if !source.is_dir() {
        return std::fs::create_dir_all(target);
    }
    if target.is_dir() && same(source, target) {
        return Ok(());
    }
    let staged = target.with_extension("next");
    let _ = std::fs::remove_dir_all(&staged);
    copy(source, &staged)?;
    let _ = std::fs::remove_dir_all(target);
    std::fs::rename(staged, target)
}

#[cfg(not(target_os = "linux"))]
pub fn stable_engine(bundled: &Path, _window: &Path) -> std::io::Result<PathBuf> {
    Ok(bundled.to_path_buf())
}

#[cfg(windows)]
mod windows {
    use windows_sys::Win32::{
        Foundation::{CloseHandle, FILETIME, INVALID_HANDLE_VALUE},
        System::{
            Diagnostics::ToolHelp::{
                CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
                TH32CS_SNAPPROCESS,
            },
            Threading::{
                GetExitCodeProcess, GetProcessTimes, OpenProcess, QueryFullProcessImageNameW,
                TerminateProcess, PROCESS_QUERY_LIMITED_INFORMATION, PROCESS_TERMINATE,
            },
        },
    };

    pub fn alive(pid: u32) -> bool {
        const STILL_ACTIVE: u32 = 259;
        let process = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid) };
        if pid == 0 || process.is_null() {
            return false;
        }
        let mut code = 0u32;
        let read = unsafe { GetExitCodeProcess(process, &mut code) } != 0;
        unsafe { CloseHandle(process) };
        read && code == STILL_ACTIVE
    }

    pub fn terminate(pid: u32) {
        let process = unsafe { OpenProcess(PROCESS_TERMINATE, 0, pid) };
        if pid == 0 || process.is_null() {
            return;
        }
        unsafe {
            TerminateProcess(process, 1);
            CloseHandle(process);
        }
    }

    pub fn parent(pid: u32) -> Option<u32> {
        let snapshot = unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) };
        if snapshot == INVALID_HANDLE_VALUE {
            return None;
        }
        let mut entry: PROCESSENTRY32W = unsafe { std::mem::zeroed() };
        entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
        let mut found = None;
        let mut more = unsafe { Process32FirstW(snapshot, &mut entry) } != 0;
        while more {
            if entry.th32ProcessID == pid {
                found = Some(entry.th32ParentProcessID);
                break;
            }
            more = unsafe { Process32NextW(snapshot, &mut entry) } != 0;
        }
        unsafe { CloseHandle(snapshot) };
        found
    }

    pub fn image(pid: u32) -> Option<(String, u64)> {
        let process = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid) };
        if process.is_null() {
            return None;
        }
        let mut name = [0u16; 1024];
        let mut length = name.len() as u32;
        let read =
            unsafe { QueryFullProcessImageNameW(process, 0, name.as_mut_ptr(), &mut length) } != 0;
        let zero = FILETIME {
            dwLowDateTime: 0,
            dwHighDateTime: 0,
        };
        let (mut created, mut exited, mut kernel, mut user) = (zero, zero, zero, zero);
        let timed =
            unsafe { GetProcessTimes(process, &mut created, &mut exited, &mut kernel, &mut user) }
                != 0;
        unsafe { CloseHandle(process) };
        (read && timed).then(|| {
            (
                String::from_utf16_lossy(&name[..length as usize]).to_lowercase(),
                (created.dwHighDateTime as u64) << 32 | created.dwLowDateTime as u64,
            )
        })
    }
}
