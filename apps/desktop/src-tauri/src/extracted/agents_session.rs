//! La sesión de persona de Atención en la ventana (docs/desktop-bff-session.md).
//! El blob sellado vive en el llavero; el access token, solo en memoria de este
//! proceso. Nada de esto llega al JavaScript ni al motor.

use base64::engine::general_purpose::{STANDARD, URL_SAFE_NO_PAD};
use base64::Engine as _;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

const ENTRY: &str = "https://alfa-app.danil.ai";
const LOGIN_WAIT: Duration = Duration::from_secs(600);
const HTTP_WAIT: Duration = Duration::from_secs(35);
/// Pide otro token este tiempo antes de que venza el actual.
const EARLY_SECONDS: i64 = 60;
const MAX_BODY: usize = 16 * 1024 * 1024 + 64 * 1024;

#[derive(Clone)]
struct Live {
    session: String,
    access_token: String,
    expires_at: i64,
    user: Value,
}

fn live() -> &'static Mutex<HashMap<String, Live>> {
    static LIVE: OnceLock<Mutex<HashMap<String, Live>>> = OnceLock::new();
    LIVE.get_or_init(Default::default)
}

/// Una renovación a la vez: GoTrue rota el refresh token y un segundo uso lo revoca.
fn refreshing() -> &'static Mutex<()> {
    static R: OnceLock<Mutex<()>> = OnceLock::new();
    R.get_or_init(Default::default)
}

/// Cuentas cuya sesión ya se comparó, en este proceso, con la persona de la cuenta del motor.
fn verified() -> &'static Mutex<std::collections::HashSet<String>> {
    static V: OnceLock<Mutex<std::collections::HashSet<String>>> = OnceLock::new();
    V.get_or_init(Default::default)
}

/// Un inicio de sesión nuevo deja sin efecto al que seguía esperando.
static CONNECT: AtomicU64 = AtomicU64::new(0);

fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or_default()
}

fn error(code: &str) -> Value {
    json!({"what":{"clave":format!("attention.desktop.error.{code}")},"detail":code})
}

fn key(account: &Option<String>) -> String {
    account
        .as_deref()
        .map(str::trim)
        .filter(|a| !a.is_empty())
        .unwrap_or("default")
        .to_owned()
}

/// La entrada de WorkOS; `DANIL_ENTRY_URL` la cambia solo en builds de depuración.
fn entry() -> String {
    #[cfg(debug_assertions)]
    if let Some(value) = std::env::var("DANIL_ENTRY_URL")
        .ok()
        .map(|v| v.trim().trim_end_matches('/').to_owned())
        .filter(|v| v.starts_with("https://") || v.starts_with("http://127.0.0.1:"))
    {
        return value;
    }
    ENTRY.to_owned()
}

/// Los tokens solo viajan a un Computers conocido: el `endpoint` lo responde el motor,
/// y un agente con el mismo usuario del sistema podría cambiar su configuración.
fn known_computers(endpoint: &str) -> bool {
    const KNOWN: [&str; 2] = [
        "https://computers.danil.ai",
        "https://computers-dev.danil.ai",
    ];
    KNOWN.contains(&endpoint)
        || (cfg!(debug_assertions) && endpoint.starts_with("http://127.0.0.1:"))
}

fn keyring_service(app: &tauri::AppHandle) -> String {
    format!("{}.agents-session", app.config().identifier)
}

/// `None`: no hay llavero en este sistema; la sesión queda solo en memoria.
fn keychain(app: &tauri::AppHandle, account: &str) -> Option<keyring::Entry> {
    if std::env::var_os("DANIL_AGENTS_SESSION_MEMORY").is_some() {
        return None;
    }
    keyring::Entry::new(&keyring_service(app), account).ok()
}

/// Lo guardado: `{version, user_id, session}`. Otro formato se descarta.
fn stored(app: &tauri::AppHandle, account: &str) -> Option<String> {
    let raw = keychain(app, account)?.get_password().ok()?;
    let record = serde_json::from_str::<Value>(&raw).ok()?;
    if record["version"] != 1 || !record["user_id"].is_string() {
        return None;
    }
    record["session"].as_str().map(str::to_owned)
}

/// `true` si quedó en el llavero.
fn store(app: &tauri::AppHandle, account: &str, user_id: &str, session: &str) -> bool {
    let record = json!({ "version": 1, "user_id": user_id, "session": session }).to_string();
    keychain(app, account).is_some_and(|e| e.set_password(&record).is_ok())
}

fn forget(app: &tauri::AppHandle, account: &str) {
    live()
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
        .remove(account);
    if let Some(entry) = keychain(app, account) {
        let _ = entry.delete_credential();
    }
}

fn agent() -> ureq::Agent {
    ureq::Agent::config_builder()
        .timeout_global(Some(HTTP_WAIT))
        .http_status_as_error(false)
        .max_redirects(0)
        .build()
        .into()
}

fn random(len: usize) -> Result<String, Value> {
    let mut bytes = vec![0u8; len];
    getrandom::fill(&mut bytes).map_err(|_| error("unavailable"))?;
    Ok(URL_SAFE_NO_PAD.encode(bytes))
}

fn post_json(url: &str, body: &Value) -> Result<(u16, Value), Value> {
    let mut response = agent()
        .post(url)
        .header("Accept", "application/json")
        .send_json(body)
        .map_err(|_| error("unavailable"))?;
    let status = response.status().as_u16();
    let value = response
        .body_mut()
        .read_json::<Value>()
        .unwrap_or(Value::Null);
    Ok((status, value))
}

fn accept(app: &tauri::AppHandle, account: &str, answer: &Value) -> Result<Live, Value> {
    let session = answer["session"]
        .as_str()
        .ok_or_else(|| error("unavailable"))?;
    let access_token = answer["access_token"]
        .as_str()
        .ok_or_else(|| error("unavailable"))?;
    let expires_at = answer["expires_at"]
        .as_i64()
        .ok_or_else(|| error("unavailable"))?;
    if !answer["user"]["user_id"].is_string() {
        return Err(error("unavailable"));
    }
    let next = Live {
        session: session.to_owned(),
        access_token: access_token.to_owned(),
        expires_at,
        user: answer["user"].clone(),
    };
    store(
        app,
        account,
        answer["user"]["user_id"].as_str().unwrap_or_default(),
        session,
    );
    live()
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
        .insert(account.to_owned(), next.clone());
    Ok(next)
}

/// Un token vigente; renueva con el blob guardado si hace falta.
fn access(app: &tauri::AppHandle, account: &str, force: bool) -> Result<Live, Value> {
    let current = live()
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
        .get(account)
        .cloned();
    if let Some(current) = &current {
        if !force && current.expires_at - EARLY_SECONDS > now() {
            return Ok(current.clone());
        }
    }
    let _one = refreshing()
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    // Otro hilo pudo renovar mientras se esperaba el candado.
    if let Some(after) = live()
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
        .get(account)
        .cloned()
    {
        let renewed = current
            .as_ref()
            .is_none_or(|before| before.access_token != after.access_token);
        if renewed && after.expires_at - EARLY_SECONDS > now() {
            return Ok(after);
        }
    }
    let session = live()
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
        .get(account)
        .map(|l| l.session.clone())
        .or_else(|| stored(app, account))
        .ok_or_else(|| error("no_session"))?;
    let (status, answer) = post_json(
        &format!("{}/auth/desktop/session", entry()),
        &json!({ "session": session }),
    )?;
    match status {
        200 => accept(app, account, &answer),
        401 => {
            forget(app, account);
            Err(error("no_session"))
        }
        403 => Err(error(answer["error"].as_str().unwrap_or("forbidden"))),
        _ => Err(error("unavailable")),
    }
}

/// El token de cliente de esa cuenta y la base de Computers, por el motor.
fn client(app: &tauri::AppHandle, account: &Option<String>) -> Result<(String, String), Value> {
    let token = super::proxy::account_relay_token(app.clone(), account.clone())
        .map_err(|_| error("client_token"))?;
    let secret = token["token"]
        .as_str()
        .ok_or_else(|| error("client_token"))?;
    let endpoint = token["endpoint"]
        .as_str()
        .ok_or_else(|| error("client_token"))?
        .trim_end_matches('/');
    if !known_computers(endpoint) {
        return Err(error("unknown_endpoint"));
    }
    Ok((secret.to_owned(), endpoint.to_owned()))
}

fn grant(
    app: &tauri::AppHandle,
    account: &Option<String>,
    access_token: &str,
) -> Result<(), Value> {
    let (secret, endpoint) = client(app, account)?;
    let response = agent()
        .post(&format!("{endpoint}/v1/bff/grants"))
        .header("Authorization", &format!("Bearer {secret}"))
        .header("Accept", "application/json")
        .send_json(json!({ "access_token": access_token }))
        .map_err(|_| error("unavailable"))?;
    match response.status().as_u16() {
        200 | 201 => Ok(()),
        403 => Err(error("person_mismatch")),
        409 => Err(error("no_session")),
        404 => Err(error("route_missing")),
        _ => Err(error("grant_failed")),
    }
}

fn status_of(app: &tauri::AppHandle, account: &str, value: &Live) -> Value {
    let storage = if keychain(app, account).is_some_and(|e| e.get_password().is_ok()) {
        "keychain"
    } else {
        "memory"
    };
    json!({ "state": "active", "user": value.user, "storage": storage, "active_account_id": active_account(&value.access_token) })
}

/// Solo el claim que las vistas necesitan para elegir la cuenta; el token no sale de aquí.
fn active_account(token: &str) -> Option<u64> {
    let payload = URL_SAFE_NO_PAD.decode(token.split('.').nth(1)?).ok()?;
    serde_json::from_slice::<Value>(&payload)
        .ok()?
        .get("active_account_id")?
        .as_u64()
        .filter(|id| *id > 0)
}

#[tauri::command(async)]
pub(super) fn agents_session_status(
    app: tauri::AppHandle,
    account: Option<String>,
    verify: Option<bool>,
) -> Value {
    let name = key(&account);
    if verify == Some(true) {
        verified()
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .remove(&name);
    }
    match checked(&app, &account) {
        Ok(value) => status_of(&app, &name, &value),
        Err(e) if e["detail"] == "no_session" => json!({ "state": "none" }),
        Err(e) => json!({ "state": "unavailable", "detail": e["detail"] }),
    }
}

/// La sesión, comparada una vez por proceso con la persona de la cuenta del motor:
/// Computers rechaza la concesión si el token de cliente es de otra persona.
fn checked(app: &tauri::AppHandle, account: &Option<String>) -> Result<Live, Value> {
    let name = key(account);
    let value = access(app, &name, false)?;
    let known = verified()
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
        .contains(&name);
    if !known {
        regrant(app, account, &value.access_token)?;
    }
    Ok(value)
}

/// Otra persona en la cuenta o una concesión revocada terminan la sesión de la ventana.
fn regrant(app: &tauri::AppHandle, account: &Option<String>, token: &str) -> Result<(), Value> {
    match grant(app, account, token) {
        Ok(()) => {
            verified()
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner)
                .insert(key(account));
            Ok(())
        }
        Err(e) if e["detail"] == "person_mismatch" || e["detail"] == "no_session" => {
            let _ = sign_out(app, account);
            Err(error("no_session"))
        }
        Err(e) => Err(e),
    }
}

/// Lee una petición del navegador al puerto local; `Some((code, state))` si es la vuelta.
fn callback(stream: &mut TcpStream) -> Option<(String, String)> {
    stream.set_read_timeout(Some(Duration::from_secs(5))).ok()?;
    let mut buffer = [0u8; 8192];
    let read = stream.read(&mut buffer).ok()?;
    let head = String::from_utf8_lossy(&buffer[..read]);
    let target = head
        .lines()
        .next()?
        .strip_prefix("GET ")?
        .split(' ')
        .next()?;
    let url = url_query(target.strip_prefix("/callback?")?);
    Some((url.get("code")?.clone(), url.get("state")?.clone()))
}

fn url_query(query: &str) -> HashMap<String, String> {
    query
        .split('&')
        .filter_map(|pair| pair.split_once('='))
        .map(|(k, v)| (decode(k), decode(v)))
        .collect()
}

fn decode(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'%' if i + 3 <= bytes.len() => {
                let hex = std::str::from_utf8(&bytes[i + 1..i + 3]).unwrap_or("");
                match u8::from_str_radix(hex, 16) {
                    Ok(b) => {
                        out.push(b);
                        i += 3;
                        continue;
                    }
                    Err(_) => out.push(b'%'),
                }
            }
            b'+' => out.push(b' '),
            b => out.push(b),
        }
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn answer_browser(stream: &mut TcpStream, ok: bool) {
    let text = if ok {
        "Listo. Vuelve a Danil. / Done. Go back to Danil."
    } else {
        "No se pudo conectar. / Could not connect."
    };
    let body = format!("<!doctype html><meta charset=utf-8><title>Danil</title><p style=\"font-family:system-ui;padding:48px\">{text}</p>");
    let _ = write!(
        stream,
        "HTTP/1.1 {}\r\nContent-Type: text/html; charset=utf-8\r\nCache-Control: no-store\r\nReferrer-Policy: no-referrer\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        if ok { "200 OK" } else { "400 Bad Request" },
        body.len()
    );
}

/// PKCE con el puerto local: el navegador trae un código que solo canjea quien tiene el verificador.
#[tauri::command(async)]
pub(super) fn agents_session_connect(
    app: tauri::AppHandle,
    account: Option<String>,
) -> Result<Value, Value> {
    let name = key(&account);
    let generation = CONNECT.fetch_add(1, Ordering::SeqCst) + 1;
    let verifier = random(32)?;
    let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
    let state = random(24)?;
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|_| error("unavailable"))?;
    let port = listener
        .local_addr()
        .map_err(|_| error("unavailable"))?
        .port();
    listener
        .set_nonblocking(true)
        .map_err(|_| error("unavailable"))?;
    let base = entry();
    super::env::open_external(format!(
        "{base}/auth/desktop?challenge={challenge}&state={state}&port={port}"
    ))
    .map_err(|_| error("browser"))?;
    let deadline = Instant::now() + LOGIN_WAIT;
    let code = loop {
        if CONNECT.load(Ordering::SeqCst) != generation {
            return Err(error("cancelled"));
        }
        if Instant::now() > deadline {
            return Err(error("timeout"));
        }
        match listener.accept() {
            Ok((mut stream, _)) => {
                let _ = stream.set_nonblocking(false);
                match callback(&mut stream) {
                    Some((code, returned)) if returned == state => {
                        answer_browser(&mut stream, true);
                        break code;
                    }
                    _ => answer_browser(&mut stream, false),
                }
            }
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(Duration::from_millis(200));
            }
            Err(_) => return Err(error("unavailable")),
        }
    };
    drop(listener);
    let (status, answer) = post_json(
        &format!("{base}/auth/desktop/exchange"),
        &json!({ "code": code, "verifier": verifier }),
    )?;
    if status != 200 {
        return Err(error(answer["error"].as_str().unwrap_or("unavailable")));
    }
    let value = accept(&app, &name, &answer)?;
    if let Err(e) = grant(&app, &account, &value.access_token) {
        let _ = sign_out(&app, &account);
        return Err(e);
    }
    verified()
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
        .insert(name.clone());
    Ok(status_of(&app, &name, &value))
}

fn sign_out(app: &tauri::AppHandle, account: &Option<String>) -> Result<(), Value> {
    let name = key(account);
    let session = live()
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
        .get(&name)
        .map(|l| (l.session.clone(), l.access_token.clone()));
    if let Some((_, token)) = &session {
        if let Ok((_, endpoint)) = client(app, account) {
            let _ = agent()
                .delete(&format!("{endpoint}/v1/bff/grants/self"))
                .header("Authorization", &format!("Bearer {token}"))
                .call();
        }
    }
    let blob = session.map(|(s, _)| s).or_else(|| stored(app, &name));
    if let Some(blob) = blob {
        let _ = post_json(
            &format!("{}/auth/desktop/logout", entry()),
            &json!({ "session": blob }),
        );
    }
    forget(app, &name);
    verified()
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
        .remove(&name);
    Ok(())
}

#[tauri::command(async)]
pub(super) fn agents_session_sign_out(
    app: tauri::AppHandle,
    account: Option<String>,
) -> Result<(), Value> {
    CONNECT.fetch_add(1, Ordering::SeqCst);
    sign_out(&app, &account)
}

fn allowed_path(path: &str) -> bool {
    (path.starts_with("/api/") || path.starts_with("/auth/"))
        && path.len() <= 512
        && !path.contains("..")
        && path
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'/' | b'_' | b'-' | b'.'))
}

/// Rutas de lectura de Harness en Computers. Lista cerrada, no un proxy abierto.
fn allowed_org_path(path: &str) -> bool {
    (path == "/v1/org" || path.starts_with("/v1/org/"))
        && path.len() <= 512
        && !path.contains("..")
        && path
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'/' | b'_' | b'-' | b'.'))
}

struct Sent {
    status: u16,
    proxy: bool,
    content_type: String,
    body: String,
}

#[allow(clippy::too_many_arguments)]
fn send(
    endpoint: &str,
    token: &str,
    method: &str,
    path: &str,
    query: &str,
    workspace: &Option<String>,
    content_type: &Option<String>,
    body: &Option<Vec<u8>>,
) -> Result<Sent, Value> {
    let url = if query.is_empty() {
        format!("{endpoint}/v1/bff{path}")
    } else {
        format!("{endpoint}/v1/bff{path}?{query}")
    };
    let agent = agent();
    let authorization = format!("Bearer {token}");
    let mut headers = vec![
        ("Authorization", authorization.as_str()),
        ("Accept", "application/json"),
    ];
    if let Some(w) = workspace.as_deref() {
        headers.push(("X-Danil-Workspace", w));
    }
    if let Some(c) = content_type.as_deref() {
        headers.push(("Content-Type", c));
    }
    let result = match (method, body) {
        ("GET", _) | ("DELETE", None) => {
            let mut request = if method == "GET" {
                agent.get(&url)
            } else {
                agent.delete(&url)
            };
            for (k, v) in &headers {
                request = request.header(*k, *v);
            }
            request.call()
        }
        _ => {
            let mut request = match method {
                "POST" => agent.post(&url),
                "PUT" => agent.put(&url),
                "PATCH" => agent.patch(&url),
                _ => return Err(error("invalid_request")),
            };
            for (k, v) in &headers {
                request = request.header(*k, *v);
            }
            request.send(body.as_deref().unwrap_or_default())
        }
    };
    let mut response = result.map_err(|e| match e {
        ureq::Error::Timeout(_) => error("bff_timeout"),
        _ => error("unavailable"),
    })?;
    let status = response.status().as_u16();
    let proxy = response
        .headers()
        .get("X-Danil-Proxy")
        .is_some_and(|v| v == "computers");
    let content_type = response
        .headers()
        .get("Content-Type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or_default()
        .to_owned();
    let body = response
        .body_mut()
        .with_config()
        .limit(MAX_BODY as u64)
        .read_to_string()
        .map_err(|_| error("invalid_response"))?;
    Ok(Sent {
        status,
        proxy,
        content_type,
        body,
    })
}

fn proxy_error(sent: &Sent) -> Option<String> {
    if !sent.proxy {
        return None;
    }
    serde_json::from_str::<Value>(&sent.body)
        .ok()?
        .get("error")?
        .as_str()
        .map(str::to_owned)
}

fn org_get(endpoint: &str, token: &str, path: &str, query: &str) -> Result<(u16, String), Value> {
    let url = if query.is_empty() {
        format!("{endpoint}{path}")
    } else {
        format!("{endpoint}{path}?{query}")
    };
    let mut response = agent()
        .get(&url)
        .header("Authorization", &format!("Bearer {token}"))
        .header("Accept", "application/json")
        .call()
        .map_err(|e| match e {
            ureq::Error::Timeout(_) => error("bff_timeout"),
            _ => error("unavailable"),
        })?;
    let status = response.status().as_u16();
    let body = response
        .body_mut()
        .with_config()
        .limit(MAX_BODY as u64)
        .read_to_string()
        .map_err(|_| error("invalid_response"))?;
    Ok((status, body))
}

fn directory_rows(body: &str) -> Result<Value, Value> {
    let value: Value = serde_json::from_str(body).map_err(|_| error("invalid_response"))?;
    match value.get("workspaces") {
        Some(rows) if rows.is_array() => Ok(rows.clone()),
        _ => Err(error("invalid_response")),
    }
}

/// `GET /v1/me/workspaces` con el JWT de la persona. El directorio no pasa por `/v1/bff`.
fn directory_get(endpoint: &str, token: &str) -> Result<(u16, String), Value> {
    let mut response = agent()
        .get(&format!("{endpoint}/v1/me/workspaces"))
        .header("Authorization", &format!("Bearer {token}"))
        .header("Accept", "application/json")
        .call()
        .map_err(|e| match e {
            ureq::Error::Timeout(_) => error("bff_timeout"),
            _ => error("unavailable"),
        })?;
    let status = response.status().as_u16();
    let body = response
        .body_mut()
        .with_config()
        .limit(MAX_BODY as u64)
        .read_to_string()
        .map_err(|_| error("invalid_response"))?;
    Ok((status, body))
}

/// Lectura de Harness con la sesión de persona de la ventana. El motor no participa y
/// el JavaScript nunca ve el token. Solo GET y una lista cerrada de rutas.
#[tauri::command(async)]
pub(super) fn harness_org_fetch(
    app: tauri::AppHandle,
    account: Option<String>,
    path: String,
    query: Option<String>,
) -> Result<Value, Value> {
    if !allowed_org_path(&path) {
        return Err(error("invalid_request"));
    }
    let query = query.unwrap_or_default();
    if query.contains('#') || query.len() > 2048 {
        return Err(error("invalid_request"));
    }
    let (_, endpoint) = client(&app, &account)?;
    let name = key(&account);
    let mut session = checked(&app, &account)?;
    let mut got = org_get(&endpoint, &session.access_token, &path, &query)?;
    if got.0 == 401 {
        session = access(&app, &name, true)?;
        got = org_get(&endpoint, &session.access_token, &path, &query)?;
    }
    let body: Value = serde_json::from_str(&got.1).unwrap_or(Value::Null);
    Ok(json!({ "status": got.0, "body": body }))
}

/// El directorio de la persona, sin el token: la ventana elige la cuenta por id de workspace.
#[tauri::command(async)]
pub(super) fn agents_session_directory(
    app: tauri::AppHandle,
    account: Option<String>,
) -> Result<Value, Value> {
    let (_, endpoint) = client(&app, &account)?;
    let name = key(&account);
    let mut session = checked(&app, &account)?;
    let mut got = directory_get(&endpoint, &session.access_token)?;
    if got.0 == 401 {
        session = access(&app, &name, true)?;
        got = directory_get(&endpoint, &session.access_token)?;
    }
    if got.0 != 200 {
        return Err(error("directory_unavailable"));
    }
    directory_rows(&got.1)
}

/// Una llamada al BFF por Computers con la sesión de la persona; el JavaScript nunca ve el token.
#[tauri::command(async)]
#[allow(clippy::too_many_arguments)]
pub(super) fn agents_bff_fetch(
    app: tauri::AppHandle,
    account: Option<String>,
    method: String,
    path: String,
    query: Option<String>,
    workspace: Option<String>,
    content_type: Option<String>,
    body: Option<String>,
    body_base64: Option<String>,
) -> Result<Value, Value> {
    let method = method.to_ascii_uppercase();
    if !matches!(method.as_str(), "GET" | "POST" | "PUT" | "PATCH" | "DELETE")
        || !allowed_path(&path)
    {
        return Err(error("invalid_request"));
    }
    let query = query.unwrap_or_default();
    if query.contains('#') || query.len() > 2048 {
        return Err(error("invalid_request"));
    }
    let body = match (body, body_base64) {
        (Some(text), None) => Some(text.into_bytes()),
        (None, Some(encoded)) => Some(
            STANDARD
                .decode(encoded)
                .map_err(|_| error("invalid_request"))?,
        ),
        (None, None) => None,
        _ => return Err(error("invalid_request")),
    };
    if body.as_ref().is_some_and(|b| b.len() > MAX_BODY) {
        return Err(error("body_too_large"));
    }
    let name = key(&account);
    let (_, endpoint) = client(&app, &account)?;
    let mut session = checked(&app, &account)?;
    let mut sent = send(
        &endpoint,
        &session.access_token,
        &method,
        &path,
        &query,
        &workspace,
        &content_type,
        &body,
    )?;
    // El BFF rechazó el token antes de actuar: renovar y repetir una vez no duplica nada.
    if sent.status == 401 {
        session = access(&app, &name, true)?;
        sent = send(
            &endpoint,
            &session.access_token,
            &method,
            &path,
            &query,
            &workspace,
            &content_type,
            &body,
        )?;
    } else if sent.status == 403 && proxy_error(&sent).as_deref() == Some("window_session_unknown")
    {
        regrant(&app, &account, &session.access_token)?;
        sent = send(
            &endpoint,
            &session.access_token,
            &method,
            &path,
            &query,
            &workspace,
            &content_type,
            &body,
        )?;
    }
    let missing = sent.status == 404
        && !sent.proxy
        && !sent
            .content_type
            .to_ascii_lowercase()
            .starts_with("application/json");
    Ok(json!({
        "status": sent.status,
        "content_type": sent.content_type,
        "body": sent.body,
        "proxy": proxy_error(&sent),
        "route_missing": missing,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn paths_stay_inside_the_bff() {
        assert!(allowed_path("/api/inbox/conversations"));
        assert!(allowed_path("/auth/account/my-permissions"));
        assert!(!allowed_path("/v1/computers"));
        assert!(!allowed_path("/api/../v1/computers"));
        assert!(!allowed_path("/api/inbox?x=1"));
        assert!(!allowed_path("/api/inbox%2F"));
    }

    #[test]
    fn harness_paths_are_a_closed_read_list() {
        assert!(allowed_org_path("/v1/org/me"));
        assert!(allowed_org_path("/v1/org/usage"));
        assert!(allowed_org_path("/v1/org/activity"));
        assert!(!allowed_org_path("/v1/me/usage"));
        assert!(!allowed_org_path("/v1/org/../v1/me"));
        assert!(!allowed_org_path("/v1/org/usage?x=1"));
    }

    #[test]
    fn callback_query_decodes() {
        let q = url_query("code=v1.a-b_c&state=xyz%2Dq");
        assert_eq!(q["code"], "v1.a-b_c");
        assert_eq!(q["state"], "xyz-q");
    }

    #[test]
    fn active_account_is_read_from_the_claim() {
        let payload = URL_SAFE_NO_PAD.encode(br#"{"active_account_id":476,"sub":"x"}"#);
        assert_eq!(active_account(&format!("h.{payload}.s")), Some(476));
        assert_eq!(active_account("not-a-jwt"), None);
    }

    #[test]
    fn tokens_only_go_to_known_computers() {
        assert!(known_computers("https://computers.danil.ai"));
        assert!(known_computers("https://computers-dev.danil.ai"));
        assert!(!known_computers("https://computers.danil.ai.evil.example"));
        assert!(!known_computers("http://computers.danil.ai"));
    }

    #[test]
    fn directory_keeps_only_an_array() {
        assert!(directory_rows(r#"{"workspaces":[{"key":"a:476"}]}"#).is_ok());
        assert!(directory_rows(r#"{"workspaces":"no"}"#).is_err());
        assert!(directory_rows("[]").is_err());
    }

    #[test]
    fn account_key_defaults() {
        assert_eq!(key(&None), "default");
        assert_eq!(key(&Some("  ".into())), "default");
        assert_eq!(key(&Some("u_1".into())), "u_1");
    }
}
