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
    Ok(result.get("value").cloned().unwrap_or(result))
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

pub fn children(app: &AppHandle, disk: bool) -> Vec<ChildInfo> {
    load(app).iter().map(|e| status(e, disk)).collect()
}

// ---------------------------------------------------------------- progreso

#[derive(Debug, Clone, Serialize)]
struct Progress<'a> {
    target: &'a str,
    step: &'a str,
    done: Option<u64>,
    total: Option<u64>,
    line: Option<String>,
}

fn progress(app: &AppHandle, target: &str, step: &str, done: Option<u64>, total: Option<u64>) {
    let _ = app.emit(
        "wsl-progress",
        Progress { target, step, done, total, line: None },
    );
}

fn progress_line(app: &AppHandle, target: &str, step: &str, line: &str) {
    let _ = app.emit(
        "wsl-progress",
        Progress { target, step, done: None, total: None, line: Some(line.chars().take(300).collect()) },
    );
}

// ---------------------------------------------------------------- catálogo

#[derive(Debug, Clone, Serialize)]
pub struct CatalogItem {
    pub name: String,
    pub label: String,
    pub url: String,
    pub sha256: String,
    pub default: bool,
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
        for (family, list) in families {
            if !matches!(family.as_str(), "Ubuntu" | "Debian") {
                continue;
            }
            for d in list.as_array().into_iter().flatten() {
                let name = d["Name"].as_str().unwrap_or_default();
                let url = d["Amd64Url"]["Url"].as_str().unwrap_or_default();
                let sha = d["Amd64Url"]["Sha256"].as_str().unwrap_or_default();
                if name.is_empty() || url.is_empty() || sha.len() != 64 || !url.starts_with("https://") {
                    continue;
                }
                out.push(CatalogItem {
                    name: name.to_string(),
                    label: d["FriendlyName"].as_str().unwrap_or(name).to_string(),
                    url: url.to_string(),
                    sha256: sha.to_ascii_lowercase(),
                    default: d["Default"].as_bool().unwrap_or(false),
                });
            }
        }
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
            loop {
                let n = reader.read(&mut buf).map_err(|e| e.to_string())?;
                if n == 0 {
                    break;
                }
                file.write_all(&buf[..n]).map_err(|e| e.to_string())?;
                done += n as u64;
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
        let text = super::wsl::decode(&output.stdout) + &super::wsl::decode(&output.stderr);
        return Err(fail("wsl_failed", text.trim().to_string()));
    }
    let _ = std::fs::remove_file(&file);
    progress(app, name, "user", None, None);
    create_user(name, user, password)?;
    progress(app, name, "done", None, None);
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
  apt-get update -qq && apt-get install -y -qq curl tar diffutils libdbus-1-3 ca-certificates
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
    let mut step = "download".to_string();
    progress(app, target, "download", None, None);
    script_ok(
        distro,
        Some(&who.user),
        &body,
        &[&url, &sha, &version],
        Duration::from_secs(1200),
        |l| {
            if let Some(next) = l.strip_prefix("PASO ") {
                step = match next.trim() {
                    "descargar" => "download",
                    "verificar" => "verify",
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
