//! Linux en esta PC: una distro de WSL con su propio motor, que es una máquina
//! hija de esta computadora. No se inscribe en el plano de control ni abre su
//! propio relay; la ventana le habla directo por RPC1 en `127.0.0.1` (WSL
//! reenvía el puerto a Windows) con el token que el motor publica en su
//! carpeta de datos (`docs/wsl-local-machine.md`).
//!
//! `wsl.exe` sólo se usa para instalar, crear el usuario, mantener viva la
//! distro y leer su usuario; el tráfico del motor va por el puerto.
#![cfg_attr(not(windows), allow(dead_code, unused_imports))]

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};

/// El prefijo del id de máquina de una distro: `wsl:Ubuntu`.
pub const MACHINE_PREFIX: &str = "wsl:";
const LOCK: &str = include_str!("../../../seldon-runtime.lock");
const INSTALL_HOST: &str = include_str!("wsl/install-host.sh");
const ENGINE_INSTALL: &str = include_str!("wsl/engine-install.sh");
const CATALOG_URL: &str =
    "https://raw.githubusercontent.com/microsoft/WSL/master/distributions/DistributionInfo.json";
/// Lo que se espera a que el motor de la distro vuelva tras un reinicio.
const ENGINE_WAIT: Duration = Duration::from_secs(40);
const MAX_FRAME: usize = 16 * 1024 * 1024;

type Failure = Value;

fn fail(code: &str, detail: impl Into<String>) -> Failure {
    json!({ "code": code, "detail": detail.into() })
}

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
}

fn registry_path(app: &AppHandle) -> Result<PathBuf, Failure> {
    let dir = app
        .path()
        .app_local_data_dir()
        .map_err(|e| fail("io", e.to_string()))?;
    std::fs::create_dir_all(&dir).map_err(|e| fail("io", e.to_string()))?;
    Ok(dir.join("wsl-children.json"))
}

fn load(app: &AppHandle) -> Vec<ChildEntry> {
    registry_path(app)
        .ok()
        .and_then(|p| std::fs::read(p).ok())
        .and_then(|b| serde_json::from_slice(&b).ok())
        .unwrap_or_default()
}

fn save(app: &AppHandle, entries: &[ChildEntry]) -> Result<(), Failure> {
    let path = registry_path(app)?;
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, serde_json::to_vec_pretty(entries).unwrap_or_default())
        .map_err(|e| fail("io", e.to_string()))?;
    std::fs::rename(&tmp, &path).map_err(|e| fail("io", e.to_string()))
}

fn entry(app: &AppHandle, distro: &str) -> Result<ChildEntry, Failure> {
    load(app)
        .into_iter()
        .find(|e| e.distro == distro)
        .ok_or_else(|| fail("unknown_machine", distro))
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

// ---------------------------------------------------------------- wsl.exe

fn wsl() -> Command {
    let mut command = Command::new("wsl.exe");
    crate::util::no_console_window(&mut command);
    command.env("WSL_UTF8", "1");
    command
}

fn valid_distro(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 64
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
}

/// Corre un script de `sh` dentro de la distro, por stdin (nunca en la línea
/// de comandos de Windows, que otros procesos ven), y pasa cada línea de la
/// salida a `on_line`. Devuelve el código de salida y lo último de stderr.
fn script(
    distro: &str,
    user: Option<&str>,
    body: &str,
    args: &[&str],
    timeout: Duration,
    mut on_line: impl FnMut(&str),
) -> Result<(i32, String), Failure> {
    let mut command = wsl();
    command.args(["-d", distro]);
    if let Some(user) = user {
        command.args(["-u", user]);
    }
    command
        .args(["--exec", "sh", "-s", "--"])
        .args(args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut child = command.spawn().map_err(|e| match e.kind() {
        std::io::ErrorKind::NotFound => fail("wsl_missing", "wsl.exe"),
        _ => fail("io", e.to_string()),
    })?;
    if let Some(mut stdin) = child.stdin.take() {
        let body = body.replace("\r\n", "\n");
        let _ = stdin.write_all(body.as_bytes());
    }
    let err = child.stderr.take().map(|mut pipe| {
        std::thread::spawn(move || {
            let mut bytes = Vec::new();
            let _ = pipe.read_to_end(&mut bytes);
            String::from_utf8_lossy(&bytes).into_owned()
        })
    });
    let started = Instant::now();
    if let Some(out) = child.stdout.take() {
        for line in BufReader::new(out).split(b'\n').map_while(|l| l.ok()) {
            let text = String::from_utf8_lossy(&line);
            for part in text.split('\r') {
                let part = part.trim_end();
                if !part.is_empty() {
                    on_line(part);
                }
            }
            if started.elapsed() > timeout {
                let _ = child.kill();
                return Err(fail("wsl_timeout", "script"));
            }
        }
    }
    let status = child.wait().map_err(|e| fail("io", e.to_string()))?;
    let stderr = err.and_then(|h| h.join().ok()).unwrap_or_default();
    let tail: Vec<&str> = stderr.lines().filter(|l| !l.trim().is_empty()).collect();
    let tail = tail[tail.len().saturating_sub(6)..].join("\n");
    Ok((status.code().unwrap_or(-1), tail))
}

fn script_ok(
    distro: &str,
    user: Option<&str>,
    body: &str,
    args: &[&str],
    timeout: Duration,
    on_line: impl FnMut(&str),
) -> Result<(), Failure> {
    let (code, tail) = script(distro, user, body, args, timeout, on_line)?;
    if code == 0 {
        Ok(())
    } else {
        Err(fail("wsl_failed", tail))
    }
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
    script_ok(
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

/// `\\wsl.localhost\<distro>\home\...` para una ruta de Linux.
fn unc(distro: &str, linux: &str) -> PathBuf {
    PathBuf::from(format!(r"\\wsl.localhost\{distro}{}", linux.replace('/', "\\")))
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

/// Copia una carpeta de Windows a la distribución, en `~/danil/<nombre>`, y la
/// registra en su motor con el mismo id. Se salta lo que se reconstruye
/// (`node_modules`, `target`, `.venv`, `dist`) y conserva `.git`.
pub fn copy_folder(entry: &ChildEntry, id: &str, name: &str, windows_path: &str, workspace: Option<&str>) -> Result<String, Failure> {
    let source = std::path::Path::new(windows_path);
    if !source.is_dir() {
        return Err(fail("folder_missing", windows_path));
    }
    let safe: String = name
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.') { c } else { '-' })
        .collect::<String>()
        .trim_matches('-')
        .to_string();
    let safe = if safe.is_empty() { id.to_string() } else { safe };
    // Una carpeta con ese nombre que ya tenga algo: la copia va al lado.
    let mut free = String::new();
    script_ok(
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
    let mut tar = Command::new("tar.exe");
    crate::util::no_console_window(&mut tar);
    let mut tar = tar
        .args(["-c", "-f", "-", "--exclude=node_modules", "--exclude=target", "--exclude=.venv", "--exclude=dist", "-C"])
        .arg(source)
        .arg(".")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| fail("io", format!("tar: {e}")))?;
    let pipe = tar.stdout.take().ok_or_else(|| fail("io", "tar"))?;
    let unpack = wsl()
        .args(["-d", &entry.distro, "-u", &entry.user, "--exec", "sh", "-c", "tar -x -f - -C \"$1\"", "sh", &free])
        .stdin(Stdio::from(pipe))
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| fail("io", e.to_string()))?;
    let packed = tar.wait_with_output().map_err(|e| fail("io", e.to_string()))?;
    if !packed.status.success() || !unpack.status.success() {
        let detail = String::from_utf8_lossy(&packed.stderr).into_owned() + &String::from_utf8_lossy(&unpack.stderr);
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
            .map(|a| a.iter().filter_map(|f| f.as_str().map(String::from)).collect())
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
    entries.iter().map(|e| status(e, disk || running.contains(&e.distro))).collect()
}

fn running_distros() -> Vec<String> {
    let Ok(out) = wsl().args(["--list", "--running", "--quiet"]).output() else {
        return Vec::new();
    };
    super::wsl::decode(&out.stdout)
        .lines()
        .map(|l| l.replace(' ', "").trim().to_string())
        .filter(|l| !l.is_empty())
        .collect()
}

// ---------------------------------------------------------------- progreso

fn progress(_app: &AppHandle, _target: &str, step: &str, done: Option<u64>, total: Option<u64>) {
    job_step(step, done, total);
}

fn progress_line(_app: &AppHandle, _target: &str, _step: &str, line: &str) {
    job_line(line);
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
    ["ubuntu", "debian", "kali", "fedora", "almalinux", "oraclelinux", "oracle"].iter().any(|f| n.starts_with(f))
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
                if name.is_empty() || url.is_empty() || sha.len() != 64 || !url.starts_with("https://") || !valid_distro(name) {
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
                    .and_then(|r| r.headers().get("content-length").and_then(|v| v.to_str().ok()).and_then(|v| v.parse::<u64>().ok()))
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
            "root" | "daemon" | "bin" | "sys" | "sync" | "games" | "man" | "nobody" | "admin" | "ubuntu" | "messagebus" | "systemd-network"
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
fn create_user(distro: &str, user: &str, password: &str) -> Result<(), Failure> {
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
    script_ok(distro, Some("root"), &body, &[], Duration::from_secs(120), |_| {})?;
    // El usuario por omisión y systemd se leen al arrancar la distro.
    let _ = wsl().args(["--terminate", distro]).status();
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
    let output = wsl()
        .args(["--install", "--from-file"])
        .arg(&file)
        .args(["--name", name, "--no-launch"])
        .output()
        .map_err(|e| fail("io", e.to_string()))?;
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
    Ok((p.url.clone(), p.sha256.clone(), format!("{}-{short}", lock.engine_version)))
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
    script_ok(distro, Some("root"), deps, &[], Duration::from_secs(900), |l| {
        progress_line(app, target, "deps", l)
    })?;

    let (url, sha, version) = linux_engine()?;
    // El instalador de seldon-host va dentro del script por stdin; se arma un
    // paquete local con el binario verificado y se instala sin conectar.
    let body = format!(
        "set -eu\nd=$(mktemp -d)\ncat > \"$d/install.sh\" <<'DANIL_INSTALL_HOST_EOF'\n{INSTALL_HOST}\nDANIL_INSTALL_HOST_EOF\ncat > \"$d/engine.sh\" <<'DANIL_ENGINE_EOF'\n{ENGINE_INSTALL}\nDANIL_ENGINE_EOF\nrc=0\nsh \"$d/engine.sh\" \"$1\" \"$2\" \"$3\" \"$d/install.sh\" || rc=$?\nrm -rf \"$d\"\nexit $rc\n"
    );
    let mut step = "engine_download".to_string();
    progress(app, target, "engine_download", None, None);
    script_ok(
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
    script_ok(distro, Some(&who.user), service, &[], Duration::from_secs(120), |_| {})?;

    let entry = ChildEntry {
        distro: distro.to_string(),
        user: who.user.clone(),
        home: who.home.clone(),
        name: name.to_string(),
        added_at: now_ms(),
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
    let mut entries = load(app);
    entries.retain(|e| e.distro != distro);
    entries.push(entry.clone());
    save(app, &entries)?;
    progress(app, target, "done", None, None);
    Ok(status(&entry, false))
}

/// El workspace de la ventana, con el mismo id, en el motor de la distro. Es
/// local (`add_workspace`): `materialize_workspace` pide cuenta de Danil y la
/// máquina hija no la tiene a propósito.
pub fn ensure_workspace(distro: &str, home: &str, id: &str, name: &str) -> Result<(), Failure> {
    let listed = invoke(distro, home, "list_workspaces", json!({}), None, None, Duration::from_secs(30))
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
    let mut entries = load(app);
    entries.retain(|e| e.distro != distro);
    save(app, &entries)?;
    let_sleep(distro);
    conns()
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .remove(distro);
    Ok(())
}

/// Activa WSL con permiso de administrador (el aviso de Windows). Pide
/// reiniciar: hasta entonces la distro no arranca.
pub fn enable() -> Result<(), Failure> {
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
struct Saved {
    job: Option<Job>,
    resume: Option<Resume>,
    /// Cuándo se activó WSL desde aquí; si fue después del último arranque, falta reiniciar.
    enabled_at: Option<u64>,
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

fn saved_path(app: &AppHandle) -> Option<PathBuf> {
    registry_path(app).ok().map(|p| p.with_file_name("wsl-state.json"))
}

fn read_saved(app: &AppHandle) -> Saved {
    saved_path(app)
        .and_then(|p| std::fs::read(p).ok())
        .and_then(|b| serde_json::from_slice(&b).ok())
        .unwrap_or_default()
}

fn write_saved(app: &AppHandle, saved: &Saved) {
    if let Some(path) = saved_path(app) {
        let tmp = path.with_extension("json.tmp");
        if std::fs::write(&tmp, serde_json::to_vec_pretty(saved).unwrap_or_default()).is_ok() {
            let _ = std::fs::rename(&tmp, &path);
        }
    }
}

struct Current {
    job: Option<Job>,
    running: bool,
    app: Option<AppHandle>,
    last_emit: Option<Instant>,
}

fn current() -> &'static Mutex<Current> {
    static C: OnceLock<Mutex<Current>> = OnceLock::new();
    C.get_or_init(|| Mutex::new(Current { job: None, running: false, app: None, last_emit: None }))
}

fn emit_job(force: bool) {
    let mut c = current().lock().unwrap_or_else(|p| p.into_inner());
    if !force && c.last_emit.is_some_and(|t| t.elapsed() < Duration::from_millis(200)) {
        return;
    }
    c.last_emit = Some(Instant::now());
    if let (Some(app), job) = (c.app.clone(), c.job.clone()) {
        drop(c);
        let _ = app.emit("wsl-job", &job);
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

fn job_speed(bytes_per_second: u64) {
    with_job(|job| job.speed = Some(bytes_per_second));
}

fn job_paused() -> bool {
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
    let _ = app.emit("wsl-job", Option::<Job>::None);
}

/// El código de una falla conocida, a partir de lo que dijo WSL o el script.
fn classify(error: &Failure) -> JobError {
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
    } else if low.contains("already exists") || low.contains("ya existe") || low.contains("error_already_exists") {
        "already_installed".to_string()
    } else if low.contains("could not resolve") || low.contains("temporary failure resolving") {
        "network".to_string()
    } else {
        code
    };
    JobError { code, detail }
}

fn start(app: &AppHandle, kind: &str, target: &str, label: &str, user: Option<&str>, work: impl FnOnce(&AppHandle) -> Result<(), Failure> + Send + 'static) -> Result<Job, Job> {
    let job = Job {
        id: uuid::Uuid::new_v4().to_string(),
        kind: kind.to_string(),
        target: target.to_string(),
        label: label.to_string(),
        user: user.map(String::from),
        step: if kind == "enable" { "permission".into() } else if kind == "install" { "download".into() } else { "check".into() },
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
        let _ = app.emit("wsl-state-changed", ());
    });
    Ok(job)
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
        let result = install_distro(app, &req.name, &req.url, &req.sha256, &req.user, &req.password);
        let mut saved = read_saved(app);
        match &result {
            Err(e) if classify(e).code == "reboot_required" => saved.resume = Some(resume),
            Ok(()) => saved.resume = None,
            Err(_) => {}
        }
        write_saved(app, &saved);
        result?;
        let ws = req.workspace.as_ref().map(|(i, n)| (i.as_str(), n.as_str()));
        install_engine(app, &req.name, None, None, &req.label, ws).map(|_| ())
    })
}

pub fn start_connect(app: &AppHandle, distro: &str, label: &str, user: Option<String>, password: Option<String>, workspace: Option<(String, String)>) -> Result<Job, Job> {
    let (d, l) = (distro.to_string(), label.to_string());
    let shown = user.clone();
    start(app, "connect", distro, label, shown.as_deref(), move |app| {
        let ws = workspace.as_ref().map(|(i, n)| (i.as_str(), n.as_str()));
        install_engine(app, &d, user.as_deref(), password.as_deref(), &l, ws).map(|_| ())
    })
}

pub fn forget_resume(app: &AppHandle) {
    let mut saved = read_saved(app);
    saved.resume = None;
    write_saved(app, &saved);
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
    command
        .args(["query", r"HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing\RebootPending"])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .is_ok_and(|s| s.success())
}

fn virtualization_off() -> bool {
    let Ok(out) = wsl().args(["--status"]).output() else {
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
                        job.error = Some(JobError { code: "interrupted".into(), detail: String::new() });
                    } else {
                        job.step = "done".into();
                    }
                }
                c.job = Some(job);
            }
        }
    }
    let job = current().lock().unwrap_or_else(|p| p.into_inner()).job.clone();
    let enabled_since_boot = saved.enabled_at.is_some_and(|t| t > boot_time_ms());
    let mut out = LinuxState { wsl: "unknown".into(), distros: Vec::new(), job, resume: saved.resume.clone(), detail: None };
    match super::wsl::detect() {
        Err(super::wsl::WslError::Unsupported) => out.wsl = "unsupported".into(),
        Err(super::wsl::WslError::NotInstalled) => {
            out.wsl = if enabled_since_boot || reboot_pending() { "reboot" } else { "missing" }.into();
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
                let _ = save(app, &entries);
                let _ = app.emit("wsl-state-changed", ());
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
                if enabled_since_boot || reboot_pending() { "reboot" } else { "virtualization" }
            } else {
                "ready"
            }
            .into();
        }
    }
    out
}

fn is_system_distro(name: &str) -> bool {
    let n = name.to_lowercase();
    ["docker-desktop", "rancher-desktop", "podman-machine"].iter().any(|p| n.starts_with(p))
}

/// Reinicia Windows en unos segundos, a pedido de la persona.
pub fn reboot() -> Result<(), Failure> {
    let mut command = Command::new("shutdown.exe");
    crate::util::no_console_window(&mut command);
    let status = command
        .args(["/r", "/t", "5", "/c", "Danil: reinicio para terminar de activar Linux"])
        .status()
        .map_err(|e| fail("io", e.to_string()))?;
    if status.success() { Ok(()) } else { Err(fail("io", "shutdown")) }
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
    fn the_linux_engine_comes_from_the_lock() {
        let (url, sha, version) = linux_engine().expect("lock");
        assert!(url.starts_with("https://"));
        assert_eq!(sha.len(), 64);
        assert!(version.contains('-'));
    }

    #[test]
    fn unc_paths_point_into_the_distro() {
        assert_eq!(
            unc("Ubuntu", "/home/mau/x"),
            PathBuf::from(r"\\wsl.localhost\Ubuntu\home\mau\x")
        );
    }
}
