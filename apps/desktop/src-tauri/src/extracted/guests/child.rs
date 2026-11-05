//! Una máquina hija de esta computadora: un huésped local (hoy, una distro de
//! WSL) con su propio motor. No se inscribe en el plano de control ni abre su
//! propio relay; la ventana le habla directo por RPC1 en `127.0.0.1` (WSL
//! reenvía el puerto a Windows) con el token que el motor publica en su
//! carpeta de datos (`docs/wsl-local-machine.md`).
//!
//! Aquí va lo que no depende del canal: registro, RPC1, eventos, estado,
//! espacios, carpetas, instalación del motor y trabajos. Lo que solo existe en
//! WSL está en `wsl_setup.rs`.
#![cfg_attr(not(windows), allow(dead_code, unused_imports))]

use super::wsl_setup::{
    create_user, distro_user, keep_alive, let_sleep, running_distros, unc, unpack, valid_distro,
};
use super::{exec_ok, fail, now_ms, ChannelKind, Failure};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};

/// El prefijo del id de máquina de una distro: `wsl:Ubuntu`.
pub const MACHINE_PREFIX: &str = "wsl:";
const LOCK: &str = include_str!("../../../../seldon-runtime.lock");
const INSTALL_HOST: &str = include_str!("install-host.sh");
const ENGINE_INSTALL: &str = include_str!("engine-install.sh");
/// Lo que se espera a que el motor de la distro vuelva tras un reinicio.
const ENGINE_WAIT: Duration = Duration::from_secs(40);
const MAX_FRAME: usize = 16 * 1024 * 1024;

// ---------------------------------------------------------------- registro

/// Una distro conectada a Danil, guardada por esta ventana. No es fuente de
/// verdad de nada más: el motor de la distro tiene sus propios datos.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChildEntry {
    pub distro: String,
    pub user: String,
    pub home: String,
    pub name: String,
    pub added_at: u64,
    /// Los campos que esta versión no conoce: se guardan tal como llegaron.
    #[serde(flatten)]
    pub extra: serde_json::Map<String, Value>,
}

impl ChildEntry {
    /// `wsl-children.json` solo guarda distros de WSL.
    pub fn channel(&self) -> ChannelKind {
        ChannelKind::Wsl
    }
}

fn registry_path(app: &AppHandle) -> Result<PathBuf, Failure> {
    let dir = app
        .path()
        .app_local_data_dir()
        .map_err(|e| fail("io", e.to_string()))?;
    std::fs::create_dir_all(&dir).map_err(|e| fail("io", e.to_string()))?;
    Ok(dir.join("wsl-children.json"))
}

pub(super) fn load(app: &AppHandle) -> Vec<ChildEntry> {
    registry_path(app).map(|p| load_at(&p)).unwrap_or_default()
}

/// Lo que hay en `wsl-children.json`: las entradas que esta versión entiende
/// y, aparte y sin tocar, las que no.
#[derive(Default)]
struct Registry {
    entries: Vec<ChildEntry>,
    unknown: Vec<Value>,
}

/// Sin archivo, el registro está vacío. Un archivo que no se puede leer o no
/// es una lista es un error: guardar encima borraría las máquinas.
fn read_registry(path: &std::path::Path) -> Result<Registry, Failure> {
    let bytes = match std::fs::read(path) {
        Ok(bytes) => bytes,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Registry::default()),
        Err(e) => return Err(fail("io", format!("wsl-children.json: {e}"))),
    };
    let list: Vec<Value> = serde_json::from_slice(&bytes)
        .map_err(|e| fail("io", format!("wsl-children.json: {e}")))?;
    let mut registry = Registry::default();
    for item in list {
        match serde_json::from_value::<ChildEntry>(item.clone()) {
            Ok(entry) => registry.entries.push(entry),
            Err(_) => registry.unknown.push(item),
        }
    }
    Ok(registry)
}

/// Para leer: lo que no se entiende se salta y un archivo roto no muestra nada.
fn load_at(path: &std::path::Path) -> Vec<ChildEntry> {
    read_registry(path)
        .map(|registry| registry.entries)
        .unwrap_or_default()
}

/// Lee el registro, le aplica `change` y lo guarda con las entradas que no
/// entiende. Si no se puede leer, no guarda nada.
pub(super) fn update<T>(
    app: &AppHandle,
    change: impl FnOnce(&mut Vec<ChildEntry>) -> T,
) -> Result<T, Failure> {
    update_at(&registry_path(app)?, change)
}

fn update_at<T>(
    path: &std::path::Path,
    change: impl FnOnce(&mut Vec<ChildEntry>) -> T,
) -> Result<T, Failure> {
    let mut registry = read_registry(path)?;
    let out = change(&mut registry.entries);
    let mut list = registry
        .entries
        .iter()
        .map(serde_json::to_value)
        .collect::<Result<Vec<Value>, _>>()
        .map_err(|e| fail("io", e.to_string()))?;
    list.extend(registry.unknown);
    let body = serde_json::to_vec_pretty(&list).map_err(|e| fail("io", e.to_string()))?;
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, body).map_err(|e| fail("io", e.to_string()))?;
    std::fs::rename(&tmp, path).map_err(|e| fail("io", e.to_string()))?;
    Ok(out)
}

fn entry(app: &AppHandle, distro: &str) -> Result<ChildEntry, Failure> {
    load(app)
        .into_iter()
        .find(|e| e.distro == distro)
        .ok_or_else(|| fail("unknown_machine", distro))
}

// ---------------------------------------------------------------- RPC1

#[derive(Debug, Clone, Deserialize)]
struct Descriptor {
    address: String,
    token_file: String,
    runtime: String,
    #[serde(default)]
    contract: String,
}

#[derive(Clone)]
struct Conn {
    address: SocketAddr,
    token: String,
    runtime: String,
    contract: String,
}

fn conns() -> &'static Mutex<HashMap<String, Conn>> {
    static C: OnceLock<Mutex<HashMap<String, Conn>>> = OnceLock::new();
    C.get_or_init(Default::default)
}

/// Lee el descriptor y el token por `\\wsl.localhost` (medio segundo, contra
/// varios de `wsl.exe`). El motor cambia de puerto y token al reiniciarse.
fn read_conn(distro: &str, home: &str) -> Result<Conn, Failure> {
    let path = unc(
        distro,
        &format!("{home}/.local/share/seldon-host/data/seldon-endpoint.json"),
    );
    let bytes = std::fs::read(&path).map_err(|_| fail("app_unavailable", "descriptor"))?;
    let d: Descriptor =
        serde_json::from_slice(&bytes).map_err(|_| fail("app_unavailable", "descriptor"))?;
    let address: SocketAddr = d
        .address
        .parse()
        .map_err(|_| fail("endpoint_untrusted", d.address.clone()))?;
    if !address.ip().is_loopback() {
        return Err(fail("endpoint_untrusted", d.address));
    }
    let token = std::fs::read_to_string(unc(distro, &d.token_file))
        .map_err(|_| fail("app_unavailable", "token"))?
        .trim()
        .to_string();
    Ok(Conn {
        address,
        token,
        runtime: d.runtime,
        contract: d.contract,
    })
}

fn connection(distro: &str, home: &str, fresh: bool) -> Result<Conn, Failure> {
    if !fresh {
        if let Some(c) = conns()
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .get(distro)
        {
            return Ok(c.clone());
        }
    }
    let c = read_conn(distro, home)?;
    conns()
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .insert(distro.to_string(), c.clone());
    Ok(c)
}

enum Wire {
    /// No llegó: puerto cerrado, motor reiniciándose.
    Unreachable,
    Answer(Value),
}

fn exchange(conn: &Conn, request: &Value, timeout: Duration) -> Wire {
    let Ok(mut socket) = TcpStream::connect_timeout(&conn.address, Duration::from_secs(3)) else {
        return Wire::Unreachable;
    };
    let _ = socket.set_read_timeout(Some(timeout));
    let _ = socket.set_write_timeout(Some(Duration::from_secs(30)));
    let mut body = serde_json::to_vec(request).unwrap_or_default();
    body.push(b'\n');
    if socket.write_all(&body).is_err() {
        return Wire::Unreachable;
    }
    let mut line = Vec::new();
    match BufReader::new(socket.take(MAX_FRAME as u64 + 1)).read_until(b'\n', &mut line) {
        Ok(0) | Err(_) => Wire::Unreachable,
        Ok(_) => match serde_json::from_slice::<Value>(&line) {
            Ok(v) => Wire::Answer(v),
            Err(_) => Wire::Unreachable,
        },
    }
}

/// Una orden RPC1 al motor de la distro. Si el motor se reinició (WSL la
/// apagó, o salió por inactividad y systemd lo volvió a levantar) se relee el
/// descriptor y se repite con el mismo `request_id`, que el motor no corre dos
/// veces. `pending` se vuelve a preguntar con el mismo id, como la ventana.
fn rpc(
    distro: &str,
    home: &str,
    command: &str,
    args: Value,
    workspace: Option<&str>,
    folder: Option<&str>,
    timeout: Duration,
) -> Result<Value, Failure> {
    keep_alive(distro);
    let request_id = uuid::Uuid::new_v4().to_string();
    let deadline = Instant::now() + timeout.max(ENGINE_WAIT);
    let mut fresh = false;
    loop {
        let conn = match connection(distro, home, fresh) {
            Ok(c) => c,
            Err(e) => {
                if Instant::now() > deadline {
                    return Err(e);
                }
                std::thread::sleep(Duration::from_millis(500));
                fresh = true;
                continue;
            }
        };
        let request = json!({
            "version": 1,
            "token": conn.token,
            "workspace": workspace,
            "folder": folder,
            "command": command,
            "args": args,
            "request_id": request_id,
        });
        match exchange(&conn, &request, timeout) {
            Wire::Unreachable => {
                if Instant::now() > deadline {
                    return Err(fail("app_unavailable", "engine"));
                }
                std::thread::sleep(Duration::from_millis(500));
                fresh = true;
            }
            Wire::Answer(v) => {
                if let Some(error) = v.get("error").filter(|e| !e.is_null()) {
                    // Un token de un motor anterior: se relee y se repite.
                    let code = error["code"].as_str().unwrap_or_default();
                    if matches!(code, "invalid_token" | "unauthorized") && !fresh {
                        fresh = true;
                        continue;
                    }
                    return Err(error.clone());
                }
                let result = v.get("result").cloned().unwrap_or(Value::Null);
                if result.get("pending").and_then(Value::as_bool) == Some(true) {
                    if Instant::now() > deadline + timeout {
                        return Err(fail("io", "timeout"));
                    }
                    std::thread::sleep(Duration::from_millis(300));
                    continue;
                }
                return Ok(result);
            }
        }
    }
}

/// Lo que la ventana manda a una máquina: `service invoke` con el comando del
/// manifiesto, igual que por el relay. Devuelve el `value`.
pub fn invoke(
    distro: &str,
    home: &str,
    command: &str,
    args: Value,
    workspace: Option<&str>,
    folder: Option<&str>,
    timeout: Duration,
) -> Result<Value, Failure> {
    let result = rpc(
        distro,
        home,
        "service invoke",
        json!({ "command": command, "arguments": args }),
        workspace,
        folder,
        timeout,
    )?;
    // El motor contesta la falla de una orden dentro del resultado; por el relay
    // llega como error, y así la espera la ventana.
    if let Some(error) = result.get("error").filter(|e| !e.is_null()) {
        if result.get("value").is_none() {
            return Err(error.clone());
        }
    }
    Ok(result.get("value").cloned().unwrap_or(result))
}

/// Los espacios del workspace, con el mismo id, en el motor de la distribución.
/// Con las máquinas de la cuenta llegan por la nube; la hija no tiene cuenta y
/// sin ellos rechaza toda tarea nueva (`spaces.error.missing`). No pisa uno que
/// ya tenga.
pub fn sync_spaces(entry: &ChildEntry, workspace: &str, spaces: &[Value]) -> Result<(), Failure> {
    use base64::Engine as _;
    if !workspace.chars().all(|c| c.is_ascii_alphanumeric()) {
        return Err(fail("invalid_request", workspace));
    }
    for space in spaces {
        let Some(id) = space["id"]
            .as_str()
            .filter(|i| !i.is_empty() && i.chars().all(|c| c.is_ascii_alphanumeric()))
        else {
            continue;
        };
        let body = json!({
            "id": id,
            "name": space["name"],
            "folders": space["folders"].as_array().cloned().unwrap_or_default(),
            "created_at": space["created_at"].as_u64().unwrap_or_else(now_ms),
            "updated_at": space["updated_at"].as_u64().unwrap_or_else(now_ms),
        });
        let encoded = base64::engine::general_purpose::STANDARD.encode(body.to_string());
        exec_ok(
            entry.channel(),
            &entry.distro,
            Some(&entry.user),
            r#"set -eu
d="$HOME/.local/share/seldon-host/data/workspaces/$1/spaces/$2"
[ -f "$d/space.json" ] && exit 0
mkdir -p "$d"
printf '%s' "$3" | base64 -d > "$d/space.json.tmp"
mv "$d/space.json.tmp" "$d/space.json"
"#,
            &[workspace, id, &encoded],
            Duration::from_secs(60),
            |_| {},
        )?;
    }
    Ok(())
}

/// Copia una carpeta de Windows a la distribución, en `~/danil/<nombre>`, y la
/// registra en su motor con el mismo id. Se salta lo que se reconstruye
/// (`node_modules`, `target`, `.venv`, `dist`) y conserva `.git`.
pub fn copy_folder(
    entry: &ChildEntry,
    id: &str,
    name: &str,
    windows_path: &str,
    workspace: Option<&str>,
) -> Result<String, Failure> {
    let source = std::path::Path::new(windows_path);
    if !source.is_dir() {
        return Err(fail("folder_missing", windows_path));
    }
    let safe: String = name
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.') {
                c
            } else {
                '-'
            }
        })
        .collect::<String>()
        .trim_matches('-')
        .to_string();
    let safe = if safe.is_empty() {
        id.to_string()
    } else {
        safe
    };
    // Una carpeta con ese nombre que ya tenga algo: la copia va al lado.
    let mut free = String::new();
    exec_ok(
        entry.channel(),
        &entry.distro,
        Some(&entry.user),
        r#"set -eu
b="$HOME/danil/$1"; d="$b"; n=2
while [ -e "$d" ] && [ -n "$(ls -A "$d" 2>/dev/null)" ]; do d="$b-$n"; n=$((n+1)); done
mkdir -p "$d"
printf '%s
' "$d"
"#,
        &[&safe],
        Duration::from_secs(60),
        |l| free = l.to_string(),
    )?;
    if free.is_empty() {
        return Err(fail("io", "destino"));
    }
    // La copia dura lo que pese la carpeta (proceso largo: a propósito): la
    // persona la ve avanzar y no hay un tope honesto para un repo grande.
    let mut tar = Command::new("tar.exe");
    crate::util::no_console_window(&mut tar);
    let mut tar = tar
        .args([
            "-c",
            "-f",
            "-",
            "--exclude=node_modules",
            "--exclude=target",
            "--exclude=.venv",
            "--exclude=dist",
            "-C",
        ])
        .arg(source)
        .arg(".")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| fail("io", format!("tar: {e}")))?;
    let pipe = tar.stdout.take().ok_or_else(|| fail("io", "tar"))?;
    let unpack = unpack(&entry.distro, &entry.user, &free)
        .stdin(Stdio::from(pipe))
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| fail("io", e.to_string()))?;
    let packed = tar
        .wait_with_output()
        .map_err(|e| fail("io", e.to_string()))?;
    if !packed.status.success() || !unpack.status.success() {
        let detail = String::from_utf8_lossy(&packed.stderr).into_owned()
            + &String::from_utf8_lossy(&unpack.stderr);
        return Err(fail("copy_failed", detail.trim().to_string()));
    }
    invoke(
        &entry.distro,
        &entry.home,
        "create_project",
        json!({ "name": name, "id": id, "workingDirectory": free }),
        workspace,
        None,
        Duration::from_secs(60),
    )?;
    Ok(free)
}

/// Una página de eventos del motor de la distro, con la forma de las del
/// relay. Si el motor cambió (otro `runtime`), el cursor de antes no vale: se
/// marca `gap` para que la ventana relea.
pub fn events(distro: &str, home: &str, cursor: Option<u64>) -> Result<Value, Failure> {
    let before = conns()
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .get(distro)
        .map(|c| c.runtime.clone());
    let args = match cursor {
        Some(c) => json!({ "cursor": c }),
        None => json!({}),
    };
    let page = rpc(
        distro,
        home,
        "service events",
        args,
        None,
        None,
        Duration::from_secs(15),
    )?;
    let after = conns()
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .get(distro)
        .map(|c| c.runtime.clone());
    let restarted = before.is_some() && before != after;
    let mut page = page;
    if restarted {
        page["gap"] = json!(true);
    }
    page["runtime"] = json!(after);
    Ok(page)
}

// ---------------------------------------------------------------- lista

#[derive(Debug, Clone, Serialize)]
pub struct ChildInfo {
    pub id: String,
    pub distro: String,
    pub name: String,
    pub user: String,
    pub home: String,
    pub online: bool,
    pub features: Vec<String>,
    pub contract: Option<String>,
    pub version: Option<String>,
}

/// `disk`: leer el descriptor de la distro, lo que la enciende si estaba
/// apagada. Sin él sólo se pregunta al puerto que ya se conocía.
pub fn status(entry: &ChildEntry, disk: bool) -> ChildInfo {
    let mut info = ChildInfo {
        id: format!("{MACHINE_PREFIX}{}", entry.distro),
        distro: entry.distro.clone(),
        name: entry.name.clone(),
        user: entry.user.clone(),
        home: entry.home.clone(),
        online: false,
        features: Vec::new(),
        contract: None,
        version: None,
    };
    let known = conns()
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .get(&entry.distro)
        .cloned();
    let conn = match (known, disk) {
        (_, true) => match read_conn(&entry.distro, &entry.home) {
            Ok(c) => c,
            Err(_) => return info,
        },
        (Some(c), false) => c,
        (None, false) => return info,
    };
    let request = json!({
        "version": 1, "token": conn.token, "workspace": null, "folder": null,
        "command": "status", "args": {}, "request_id": uuid::Uuid::new_v4().to_string(),
    });
    if let Wire::Answer(v) = exchange(&conn, &request, Duration::from_secs(3)) {
        let s = &v["result"];
        info.online = s["status"] == "ready";
        info.features = s["service_features"]
            .as_array()
            .map(|a| {
                a.iter()
                    .filter_map(|f| f.as_str().map(String::from))
                    .collect()
            })
            .unwrap_or_default();
        info.contract = Some(conn.contract.clone());
        info.version = s["engine_version"]
            .as_str()
            .or_else(|| s["version"].as_str())
            .map(String::from);
        conns()
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .insert(entry.distro.clone(), conn);
    }
    info
}

/// Sin `disk`, una distribución que ya corre se lee igual (no se enciende nada);
/// una apagada se queda apagada.
pub fn children(app: &AppHandle, disk: bool) -> Vec<ChildInfo> {
    let entries = load(app);
    if entries.is_empty() {
        return Vec::new();
    }
    let running = if disk { Vec::new() } else { running_distros() };
    entries
        .iter()
        .map(|e| status(e, disk || running.contains(&e.distro)))
        .collect()
}

// ---------------------------------------------------------------- progreso

pub(super) fn progress(
    _app: &AppHandle,
    _target: &str,
    step: &str,
    done: Option<u64>,
    total: Option<u64>,
) {
    job_step(step, done, total);
}

fn progress_line(_app: &AppHandle, _target: &str, _step: &str, line: &str) {
    job_line(line);
}

// ---------------------------------------------------------------- instalar motor

#[derive(Deserialize)]
struct LockPlatform {
    url: String,
    sha256: String,
}

#[derive(Deserialize)]
struct Lock {
    engine_version: String,
    commit: String,
    platforms: HashMap<String, LockPlatform>,
}

/// El mismo motor que fija esta ventana, en su versión de Linux: el contrato
/// es idéntico al del motor de Windows.
fn linux_engine() -> Result<(String, String, String), Failure> {
    let lock: Lock = serde_json::from_str(LOCK).map_err(|e| fail("invalid_lock", e.to_string()))?;
    let p = lock
        .platforms
        .get("x86_64-unknown-linux-gnu")
        .ok_or_else(|| fail("arch", "x86_64-unknown-linux-gnu"))?;
    let short: String = lock.commit.chars().take(8).collect();
    Ok((
        p.url.clone(),
        p.sha256.clone(),
        format!("{}-{short}", lock.engine_version),
    ))
}

pub fn install_engine(
    app: &AppHandle,
    distro: &str,
    user: Option<&str>,
    password: Option<&str>,
    name: &str,
    workspace: Option<(&str, &str)>,
) -> Result<ChildInfo, Failure> {
    if !valid_distro(distro) {
        return Err(fail("invalid_distro", distro));
    }
    let target = distro;
    progress(app, target, "check", None, None);
    let mut who = distro_user(distro)?;
    if who.uid == 0 {
        // Una distro recién registrada sin abrir no tiene usuario todavía.
        let (Some(user), Some(password)) = (user, password) else {
            return Err(fail("user_required", distro));
        };
        progress(app, target, "user", None, None);
        create_user(distro, user, password)?;
        who = distro_user(distro)?;
        if who.uid == 0 {
            return Err(fail("user_required", distro));
        }
    }
    // Lo que pide el instalador del motor. Una imagen de Ubuntu ya lo trae; si
    // falta algo, se instala como root (lo pidió la persona al pulsar).
    progress(app, target, "deps", None, None);
    let deps = r#"set -e
need=''
for t in curl tar cmp; do command -v "$t" >/dev/null 2>&1 || need="$need $t"; done
ldconfig -p 2>/dev/null | grep -q 'libdbus-1.so.3' || need="$need libdbus"
[ -z "$need" ] && exit 0
if command -v apt-get >/dev/null; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get -o DPkg::Lock::Timeout=300 update -qq && apt-get -o DPkg::Lock::Timeout=300 install -y -qq curl tar diffutils libdbus-1-3 ca-certificates
elif command -v dnf >/dev/null; then dnf install -y curl tar diffutils dbus-libs
else echo "faltan:$need" >&2; exit 3; fi
"#;
    exec_ok(
        ChannelKind::Wsl,
        distro,
        Some("root"),
        deps,
        &[],
        Duration::from_secs(900),
        |l| progress_line(app, target, "deps", l),
    )?;

    let (url, sha, version) = linux_engine()?;
    // El instalador de seldon-host va dentro del script por stdin; se arma un
    // paquete local con el binario verificado y se instala sin conectar.
    let body = format!(
        "set -eu\nd=$(mktemp -d)\ncat > \"$d/install.sh\" <<'DANIL_INSTALL_HOST_EOF'\n{INSTALL_HOST}\nDANIL_INSTALL_HOST_EOF\ncat > \"$d/engine.sh\" <<'DANIL_ENGINE_EOF'\n{ENGINE_INSTALL}\nDANIL_ENGINE_EOF\nrc=0\nsh \"$d/engine.sh\" \"$1\" \"$2\" \"$3\" \"$d/install.sh\" || rc=$?\nrm -rf \"$d\"\nexit $rc\n"
    );
    let mut step = "engine_download".to_string();
    progress(app, target, "engine_download", None, None);
    exec_ok(
        ChannelKind::Wsl,
        distro,
        Some(&who.user),
        &body,
        &[&url, &sha, &version],
        Duration::from_secs(1200),
        |l| {
            if let Some(next) = l.strip_prefix("PASO ") {
                step = match next.trim() {
                    "descargar" => "engine_download",
                    "verificar" => "engine_verify",
                    "instalar" => "engine",
                    _ => "engine",
                }
                .to_string();
                progress(app, target, &step, None, None);
            } else if !l.starts_with('#') && !l.contains('%') {
                progress_line(app, target, &step, l);
            }
        },
    )?;

    // En Ubuntu el servicio de usuario hereda `UMask=0002`: el motor crea
    // `executor-releases/` con escritura de grupo y su propio preflight lo
    // rechaza (`executor_release_permissions`). Se fija la máscara del servicio.
    progress(app, target, "service", None, None);
    let service = r#"set -e
d="$HOME/.config/systemd/user/seldon-host.service.d"
mkdir -p "$d"
printf '[Service]\nUMask=0077\n' > "$d/umask.conf"
chmod -R go-w "$HOME/.local/share/seldon-host" 2>/dev/null || true
if systemctl --user show-environment >/dev/null 2>&1; then
  systemctl --user daemon-reload
  systemctl --user restart seldon-host
fi
"#;
    exec_ok(
        ChannelKind::Wsl,
        distro,
        Some(&who.user),
        service,
        &[],
        Duration::from_secs(120),
        |_| {},
    )?;

    let entry = ChildEntry {
        distro: distro.to_string(),
        user: who.user.clone(),
        home: who.home.clone(),
        name: name.to_string(),
        added_at: now_ms(),
        extra: Default::default(),
    };
    progress(app, target, "connect", None, None);
    keep_alive(distro);
    // Que conteste antes de darlo por conectado.
    let deadline = Instant::now() + Duration::from_secs(90);
    loop {
        let info = status(&entry, true);
        if info.online {
            break;
        }
        if Instant::now() > deadline {
            return Err(fail("app_unavailable", "engine"));
        }
        std::thread::sleep(Duration::from_secs(1));
    }
    if let Some((id, label)) = workspace {
        ensure_workspace(distro, &who.home, id, label)?;
    }
    update(app, |entries| {
        entries.retain(|e| e.distro != distro);
        entries.push(entry.clone());
    })?;
    progress(app, target, "done", None, None);
    Ok(status(&entry, false))
}

/// El workspace de la ventana, con el mismo id, en el motor de la distro. Es
/// local (`add_workspace`): `materialize_workspace` pide cuenta de Danil y la
/// máquina hija no la tiene a propósito.
pub fn ensure_workspace(distro: &str, home: &str, id: &str, name: &str) -> Result<(), Failure> {
    let listed = invoke(
        distro,
        home,
        "list_workspaces",
        json!({}),
        None,
        None,
        Duration::from_secs(30),
    )
    .unwrap_or(Value::Null);
    let known = listed["workspaces"]
        .as_array()
        .is_some_and(|ws| ws.iter().any(|w| w["id"] == id));
    if !known {
        invoke(
            distro,
            home,
            "add_workspace",
            json!({ "name": name, "id": id }),
            None,
            None,
            Duration::from_secs(30),
        )?;
    }
    if listed["active"] != id {
        invoke(
            distro,
            home,
            "set_active_workspace",
            json!({ "id": id }),
            None,
            None,
            Duration::from_secs(30),
        )?;
    }
    Ok(())
}

pub fn remove(app: &AppHandle, distro: &str) -> Result<(), Failure> {
    update(app, |entries| entries.retain(|e| e.distro != distro))?;
    let_sleep(distro);
    conns()
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .remove(distro);
    Ok(())
}

// ---------------------------------------------------------------- comandos

pub fn lookup(app: &AppHandle, machine: &str) -> Result<ChildEntry, Failure> {
    let distro = machine.strip_prefix(MACHINE_PREFIX).unwrap_or(machine);
    entry(app, distro)
}

// ---------------------------------------------------------------- estado y trabajos

/// Una falla con su código (la frase la pone la ventana) y el texto crudo.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JobError {
    pub code: String,
    pub detail: String,
}

/// Lo que se está haciendo ahora: activar Linux, instalar una distribución o
/// conectar una que ya existe. Uno a la vez; vive aquí y no en la pantalla, así
/// que salir de Configuración no lo pierde.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Job {
    pub id: String,
    /// Por dónde corre (`wsl`). Como texto: un trabajo guardado por otra
    /// versión se sigue leyendo.
    #[serde(default = "wsl_channel")]
    pub channel: String,
    /// `enable` · `install` · `connect`.
    pub kind: String,
    pub target: String,
    pub label: String,
    pub user: Option<String>,
    pub step: String,
    pub done: Option<u64>,
    pub total: Option<u64>,
    /// Bytes por segundo de la descarga en curso.
    pub speed: Option<u64>,
    pub paused: bool,
    pub lines: Vec<String>,
    pub error: Option<JobError>,
    pub finished: bool,
    pub started_at: u64,
}

fn wsl_channel() -> String {
    ChannelKind::Wsl.as_str().to_string()
}

/// Lo que quedó a medias por un reinicio: se retoma con la misma descarga.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Resume {
    pub name: String,
    pub label: String,
    pub url: String,
    pub sha256: String,
    pub user: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub(super) struct Saved {
    pub(super) job: Option<Job>,
    pub(super) resume: Option<Resume>,
    /// Cuándo se activó WSL desde aquí; si fue después del último arranque, falta reiniciar.
    pub(super) enabled_at: Option<u64>,
}

fn saved_path(app: &AppHandle) -> Option<PathBuf> {
    registry_path(app)
        .ok()
        .map(|p| p.with_file_name("wsl-state.json"))
}

pub(super) fn read_saved(app: &AppHandle) -> Saved {
    saved_path(app)
        .and_then(|p| std::fs::read(p).ok())
        .and_then(|b| serde_json::from_slice(&b).ok())
        .unwrap_or_default()
}

pub(super) fn write_saved(app: &AppHandle, saved: &Saved) {
    if let Some(path) = saved_path(app) {
        let tmp = path.with_extension("json.tmp");
        if std::fs::write(&tmp, serde_json::to_vec_pretty(saved).unwrap_or_default()).is_ok() {
            let _ = std::fs::rename(&tmp, &path);
        }
    }
}

pub(super) struct Current {
    pub(super) job: Option<Job>,
    running: bool,
    pub(super) app: Option<AppHandle>,
    last_emit: Option<Instant>,
}

pub(super) fn current() -> &'static Mutex<Current> {
    static C: OnceLock<Mutex<Current>> = OnceLock::new();
    C.get_or_init(|| {
        Mutex::new(Current {
            job: None,
            running: false,
            app: None,
            last_emit: None,
        })
    })
}

fn emit_job(force: bool) {
    let mut c = current().lock().unwrap_or_else(|p| p.into_inner());
    if !force
        && c.last_emit
            .is_some_and(|t| t.elapsed() < Duration::from_millis(200))
    {
        return;
    }
    c.last_emit = Some(Instant::now());
    if let (Some(app), job) = (c.app.clone(), c.job.clone()) {
        drop(c);
        let _ = app.emit("guest-job", &job);
        if let Some(job) = job {
            let mut saved = read_saved(&app);
            saved.job = Some(job);
            write_saved(&app, &saved);
        }
    }
}

fn with_job(change: impl FnOnce(&mut Job)) {
    {
        let mut c = current().lock().unwrap_or_else(|p| p.into_inner());
        if let Some(job) = c.job.as_mut() {
            change(job);
        }
    }
}

/// El paso en curso. La descarga también trae bytes; los demás pasos los limpian.
fn job_step(step: &str, done: Option<u64>, total: Option<u64>) {
    let mut changed_step = false;
    with_job(|job| {
        changed_step = job.step != step;
        job.step = step.to_string();
        job.done = done;
        job.total = total;
        if changed_step {
            job.speed = None;
        }
    });
    emit_job(changed_step);
}

/// Una línea del instalador para «Ver lo que está haciendo», sin nombres internos.
fn job_line(line: &str) {
    let clean = line
        .replace("Seldon Host", "el motor de Danil")
        .replace("seldon-host", "danil")
        .replace("seldon-runtime", "motor de Danil");
    with_job(|job| {
        job.lines.push(clean.chars().take(300).collect());
        let extra = job.lines.len().saturating_sub(60);
        job.lines.drain(..extra);
    });
    emit_job(false);
}

pub(super) fn job_speed(bytes_per_second: u64) {
    with_job(|job| job.speed = Some(bytes_per_second));
}

pub(super) fn job_paused() -> bool {
    current()
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .job
        .as_ref()
        .is_some_and(|j| j.paused && !j.finished)
}

pub fn pause(paused: bool) {
    with_job(|job| job.paused = paused);
    emit_job(true);
}

/// Cierra el aviso de un trabajo terminado o fallido.
pub fn dismiss(app: &AppHandle) {
    let mut c = current().lock().unwrap_or_else(|p| p.into_inner());
    if c.running {
        return;
    }
    c.job = None;
    drop(c);
    let mut saved = read_saved(app);
    saved.job = None;
    write_saved(app, &saved);
    let _ = app.emit("guest-job", Option::<Job>::None);
}

/// El código de una falla conocida, a partir de lo que dijo WSL o el script.
pub(super) fn classify(error: &Failure) -> JobError {
    let code = error["code"].as_str().unwrap_or("io").to_string();
    let detail = error["detail"].as_str().unwrap_or_default().to_string();
    let low = detail.to_lowercase();
    let code = if low.contains("hcs_e_service_not_available")
        || low.contains("hcs_e_hyperv_not_installed")
        || low.contains("virtualiz")
    {
        "reboot_required".to_string()
    } else if low.contains("could not get lock") || low.contains("dpkg lock") {
        "apt_lock".to_string()
    } else if low.contains("already exists")
        || low.contains("ya existe")
        || low.contains("error_already_exists")
    {
        "already_installed".to_string()
    } else if low.contains("could not resolve") || low.contains("temporary failure resolving") {
        "network".to_string()
    } else {
        code
    };
    JobError { code, detail }
}

pub(super) fn start(
    app: &AppHandle,
    kind: &str,
    target: &str,
    label: &str,
    user: Option<&str>,
    work: impl FnOnce(&AppHandle) -> Result<(), Failure> + Send + 'static,
) -> Result<Job, Job> {
    let job = Job {
        id: uuid::Uuid::new_v4().to_string(),
        channel: wsl_channel(),
        kind: kind.to_string(),
        target: target.to_string(),
        label: label.to_string(),
        user: user.map(String::from),
        step: if kind == "enable" {
            "permission".into()
        } else if kind == "install" {
            "download".into()
        } else {
            "check".into()
        },
        done: None,
        total: None,
        speed: None,
        paused: false,
        lines: Vec::new(),
        error: None,
        finished: false,
        started_at: now_ms(),
    };
    {
        let mut c = current().lock().unwrap_or_else(|p| p.into_inner());
        if c.running {
            // Un segundo clic se engancha al que ya corre.
            return Err(c.job.clone().unwrap_or(job));
        }
        c.running = true;
        c.app = Some(app.clone());
        c.job = Some(job.clone());
    }
    emit_job(true);
    let app = app.clone();
    std::thread::spawn(move || {
        let result = work(&app);
        with_job(|job| {
            job.finished = true;
            job.paused = false;
            match &result {
                Ok(()) => job.step = "done".into(),
                Err(e) => job.error = Some(classify(e)),
            }
        });
        {
            let mut c = current().lock().unwrap_or_else(|p| p.into_inner());
            c.running = false;
        }
        emit_job(true);
        let _ = app.emit("guest-state-changed", ());
    });
    Ok(job)
}

pub fn start_connect(
    app: &AppHandle,
    distro: &str,
    label: &str,
    user: Option<String>,
    password: Option<String>,
    workspace: Option<(String, String)>,
) -> Result<Job, Job> {
    let (d, l) = (distro.to_string(), label.to_string());
    let shown = user.clone();
    start(
        app,
        "connect",
        distro,
        label,
        shown.as_deref(),
        move |app| {
            let ws = workspace.as_ref().map(|(i, n)| (i.as_str(), n.as_str()));
            install_engine(app, &d, user.as_deref(), password.as_deref(), &l, ws).map(|_| ())
        },
    )
}

pub fn forget_resume(app: &AppHandle) {
    let mut saved = read_saved(app);
    saved.resume = None;
    write_saved(app, &saved);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry_json(distro: &str) -> Value {
        json!({ "distro": distro, "user": "mau", "home": "/home/mau", "name": distro, "added_at": 1 })
    }

    fn sample(distro: &str) -> ChildEntry {
        serde_json::from_value(entry_json(distro)).expect("entry")
    }

    fn saved(path: &std::path::Path) -> Value {
        serde_json::from_slice(&std::fs::read(path).expect("read")).expect("json")
    }

    #[test]
    fn a_registry_that_cannot_be_read_is_not_overwritten() {
        let dir = tempfile::tempdir().expect("tmp");
        let path = dir.path().join("wsl-children.json");
        std::fs::write(&path, b"[{\"distro\": \"Ubuntu\", \"us").expect("write");
        let result = update_at(&path, |entries| entries.push(sample("Debian")));
        assert!(
            result.is_err(),
            "guardar sobre un registro roto tiene que fallar"
        );
        assert_eq!(
            std::fs::read(&path).expect("read"),
            b"[{\"distro\": \"Ubuntu\", \"us"
        );
    }

    #[test]
    fn saving_keeps_entries_and_fields_this_version_does_not_know() {
        let dir = tempfile::tempdir().expect("tmp");
        let path = dir.path().join("wsl-children.json");
        let mut known = entry_json("Ubuntu");
        known["later"] = json!({ "kept": true });
        let unknown = json!({ "channel": "lima", "guest": "danil" });
        let file = json!([known, unknown, entry_json("Debian")]);
        std::fs::write(&path, serde_json::to_vec(&file).expect("json")).expect("write");

        update_at(&path, |entries| entries.retain(|e| e.distro != "Debian")).expect("update");

        let after = saved(&path);
        let list = after.as_array().expect("array");
        assert_eq!(list.len(), 2, "{after}");
        assert!(list.contains(&known), "{after}");
        assert!(list.contains(&unknown), "{after}");
    }

    #[test]
    fn reading_skips_what_it_does_not_understand() {
        let dir = tempfile::tempdir().expect("tmp");
        let path = dir.path().join("wsl-children.json");
        let file = json!([entry_json("Ubuntu"), { "channel": "lima" }]);
        std::fs::write(&path, serde_json::to_vec(&file).expect("json")).expect("write");
        let entries = load_at(&path);
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].distro, "Ubuntu");
    }

    #[test]
    fn a_missing_registry_starts_empty() {
        let dir = tempfile::tempdir().expect("tmp");
        let path = dir.path().join("wsl-children.json");
        assert!(load_at(&path).is_empty());
        update_at(&path, |entries| entries.push(sample("Ubuntu"))).expect("update");
        assert_eq!(load_at(&path).len(), 1);
    }

    #[test]
    fn the_linux_engine_comes_from_the_lock() {
        let (url, sha, version) = linux_engine().expect("lock");
        assert!(url.starts_with("https://"));
        assert_eq!(sha.len(), 64);
        assert!(version.contains('-'));
    }
}
