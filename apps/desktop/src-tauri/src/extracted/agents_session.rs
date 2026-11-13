//! La sesión de persona de Atención en la ventana (docs/desktop-bff-session.md).
//! El blob sellado vive en el llavero; el access token, solo en memoria de este
//! proceso. Nada de esto llega al JavaScript ni al motor.

use base64::engine::general_purpose::{STANDARD, URL_SAFE_NO_PAD};
use base64::Engine as _;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::Emitter;

mod credits;

pub(super) fn credits_invalidate() {
    credits::invalidate();
}

#[tauri::command(async)]
pub(super) fn credits_pilot_prepare(
    app: tauri::AppHandle,
    account: Option<String>,
    workspace: String,
) -> Result<Value, Value> {
    credits::prepare(app, account, workspace)
}

const ENTRY: &str = "https://alfa-app.danil.ai";
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
    const KNOWN: [&str; 4] = [
        "https://machines.danil.ai",
        "https://machines-dev.danil.ai",
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
        // Sin concesión vigente la sesión guardada ya no sirve: se borra igual que con un 401.
        403 if error_code(&answer) == Some(ACCESS_REQUIRED) => {
            forget(app, account);
            Err(error(ACCESS_REQUIRED))
        }
        403 => Err(error(answer["error"].as_str().unwrap_or("forbidden"))),
        _ => Err(error("unavailable")),
    }
}

const ACCESS_REQUIRED: &str = "access_required";

/// `{"error": "código"}` (entrada de alfa) o `{"error": {"code": "código"}}` (Computers).
fn error_code(answer: &Value) -> Option<&str> {
    let value = &answer["error"];
    value.as_str().or_else(|| value["code"].as_str())
}

/// Computers rechazó a la persona por la concesión: la ventana pierde la sesión, como con un 401.
fn access_revoked(
    app: &tauri::AppHandle,
    account: &Option<String>,
    status: u16,
    body: &str,
) -> Result<(), Value> {
    if status != 403 {
        return Ok(());
    }
    let answer = serde_json::from_str::<Value>(body).unwrap_or(Value::Null);
    if error_code(&answer) != Some(ACCESS_REQUIRED) {
        return Ok(());
    }
    let _ = sign_out(app, account);
    Err(error(ACCESS_REQUIRED))
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
        Err(e) if e["detail"] == ACCESS_REQUIRED => {
            json!({ "state": "none", "detail": ACCESS_REQUIRED })
        }
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

/// La sesión de antes (WorkOS a Supabase, `alfa-app`) se retira cuando entra la de
/// `identity` o se cierra sesión: revocación de mejor esfuerzo y borrado del llavero.
pub(super) fn retire_legacy(app: &tauri::AppHandle) {
    let name = key(&None);
    let held = live()
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
        .contains_key(&name)
        || stored(app, &name).is_some();
    if held {
        let _ = sign_out(app, &None);
    }
}

fn sign_out(app: &tauri::AppHandle, account: &Option<String>) -> Result<(), Value> {
    credits::invalidate();
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
    let _ = app.emit(
        "agents-session",
        json!({ "state": "signed_out", "account": name }),
    );
    Ok(())
}

#[tauri::command(async)]
pub(super) fn agents_session_sign_out(
    app: tauri::AppHandle,
    account: Option<String>,
) -> Result<(), Value> {
    credits::invalidate();
    sign_out(&app, &account)
}

fn allowed_path(path: &str) -> bool {
    (path.starts_with("/api/") || path.starts_with("/auth/"))
        && path.len() <= 512
        && !path.contains("..")
        && !path.split('/').any(|part| part == "delegations")
        && path
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'/' | b'_' | b'-' | b'.'))
}

/// Rutas de lectura de la persona en Computers. Lista cerrada, no un proxy abierto.
fn allowed_person_path(path: &str) -> bool {
    let org = path == "/v1/org" || path.starts_with("/v1/org/");
    let usage = path == "/v1/usage/me";
    (org || usage)
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

/// `POST` con `body` o `DELETE` sin él, a una ruta de Computers con el JWT de la
/// persona. `path` lo arma Rust.
fn person_send(
    endpoint: &str,
    token: &str,
    path: &str,
    body: Option<&Value>,
) -> Result<(u16, Value), Value> {
    let url = format!("{endpoint}{path}");
    let authorization = format!("Bearer {token}");
    let sent = match body {
        Some(body) => agent()
            .post(&url)
            .header("Authorization", &authorization)
            .header("Accept", "application/json")
            .send_json(body),
        None => agent()
            .delete(&url)
            .header("Authorization", &authorization)
            .header("Accept", "application/json")
            .call(),
    };
    let mut response = sent.map_err(|e| match e {
        ureq::Error::Timeout(_) => error("bff_timeout"),
        _ => error("unavailable"),
    })?;
    let status = response.status().as_u16();
    let text = response
        .body_mut()
        .with_config()
        .limit(MAX_BODY as u64)
        .read_to_string()
        .map_err(|_| error("invalid_response"))?;
    Ok((status, serde_json::from_str(&text).unwrap_or(Value::Null)))
}

/// El código de Computers (`{"error":{"code"}}` o `{"error":"code"}`), o `fallback`.
fn computers_error(body: &Value, fallback: &str) -> Value {
    let code = body["error"]["code"]
        .as_str()
        .or_else(|| body["error"].as_str())
        .filter(|c| c.len() <= 64 && c.bytes().all(|b| b.is_ascii_lowercase() || b == b'_'))
        .unwrap_or(fallback);
    error(code)
}

/// Id de un workspace del motor: lo que acepta un segmento de ruta sin codificar.
fn workspace_segment(id: &str) -> Option<&str> {
    let ok = !id.is_empty()
        && id.len() <= 128
        && id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_');
    ok.then_some(id)
}

/// Enlaza un workspace propio con un workspace de Danil que la persona administra
/// (`POST /v1/workspaces/:id/danil-workspace`). Computers solo acepta ahí el JWT de la
/// persona, no el token de cliente. Sin sesión de la ventana: `no_session`.
#[tauri::command(async)]
pub(super) fn agents_session_link(
    app: tauri::AppHandle,
    account: Option<String>,
    workspace_id: String,
    danil_workspace_id: u64,
) -> Result<Value, Value> {
    let id = workspace_segment(&workspace_id).ok_or_else(|| error("invalid_request"))?;
    if danil_workspace_id == 0 || danil_workspace_id > (1u64 << 53) {
        return Err(error("invalid_request"));
    }
    let body = json!({ "danil_workspace_id": danil_workspace_id });
    let path = format!("/v1/workspaces/{id}/danil-workspace");
    match person_call(&app, &account, &path, Some(&body))? {
        (200, value) => Ok(json!({ "danil_workspace_id": value["danil_workspace_id"] })),
        (_, value) => Err(computers_error(&value, "link_failed")),
    }
}

/// `person_send` con la sesión de la ventana de esa cuenta. Computers rechazó el token
/// antes de actuar: renovar y repetir una vez no duplica nada.
fn person_call(
    app: &tauri::AppHandle,
    account: &Option<String>,
    path: &str,
    body: Option<&Value>,
) -> Result<(u16, Value), Value> {
    let (_, endpoint) = client(app, account)?;
    let name = key(account);
    let mut session = checked(app, account)?;
    let mut got = person_send(&endpoint, &session.access_token, path, body)?;
    if got.0 == 401 {
        session = access(app, &name, true)?;
        got = person_send(&endpoint, &session.access_token, path, body)?;
    }
    Ok(got)
}

/// Sube el workspace: crea el workspace personal de Danil de quien llama, con el nombre de
/// este, y lo enlaza (`{create: true}`). Si ya tiene uno propio, `personal_workspace_exists`.
#[tauri::command(async)]
pub(super) fn agents_session_create_danil_workspace(
    app: tauri::AppHandle,
    account: Option<String>,
    workspace_id: String,
) -> Result<Value, Value> {
    let id = workspace_segment(&workspace_id).ok_or_else(|| error("invalid_request"))?;
    let path = format!("/v1/workspaces/{id}/danil-workspace");
    let (status, value) = person_call(&app, &account, &path, Some(&json!({ "create": true })))?;
    created(status, &value)
}

fn created(status: u16, value: &Value) -> Result<Value, Value> {
    match status {
        200 | 201 => Ok(json!({
            "danil_workspace_id": value["danil_workspace_id"],
            "created": value["created"],
        })),
        _ => Err(computers_error(value, "create_failed")),
    }
}

/// Quita el enlace en Computers (`DELETE /v1/workspaces/:id/danil-workspace`, idempotente).
/// Un 404 es que el registro no es de esta persona: no hay enlace suyo que quitar.
#[tauri::command(async)]
pub(super) fn agents_session_unlink(
    app: tauri::AppHandle,
    account: Option<String>,
    workspace_id: String,
) -> Result<(), Value> {
    let id = workspace_segment(&workspace_id).ok_or_else(|| error("invalid_request"))?;
    let path = format!("/v1/workspaces/{id}/danil-workspace");
    let (status, value) = person_call(&app, &account, &path, None)?;
    unlinked(status, &value)
}

fn unlinked(status: u16, value: &Value) -> Result<(), Value> {
    match status {
        200 | 204 | 404 => Ok(()),
        _ => Err(computers_error(value, "unlink_failed")),
    }
}

/// Renueva ya el token de la ventana: tras entrar a otro workspace de Danil, el claim
/// `active_account_id` nuevo llega así.
#[tauri::command(async)]
pub(super) fn agents_session_refresh(app: tauri::AppHandle, account: Option<String>) -> bool {
    access(&app, &key(&account), true).is_ok()
}

/// Lectura de Harness y del consumo propio con la sesión de persona de la ventana.
/// El motor no participa y el JavaScript nunca ve el token. Solo GET y una lista
/// cerrada de rutas.
#[tauri::command(async)]
pub(super) fn harness_org_fetch(
    app: tauri::AppHandle,
    account: Option<String>,
    path: String,
    query: Option<String>,
) -> Result<Value, Value> {
    if !allowed_person_path(&path) {
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
    access_revoked(&app, &account, got.0, &got.1)?;
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
    access_revoked(&app, &account, got.0, &got.1)?;
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
    access_revoked(&app, &account, sent.status, &sent.body)?;
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
    fn error_codes_are_read_in_both_shapes() {
        assert_eq!(
            error_code(&json!({ "error": "access_required" })),
            Some("access_required")
        );
        assert_eq!(
            error_code(&json!({ "error": { "code": "access_required" } })),
            Some("access_required")
        );
        assert_eq!(error_code(&json!({ "error": { "code": 3 } })), None);
        assert_eq!(error_code(&Value::Null), None);
    }

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
    fn person_paths_are_a_closed_read_list() {
        assert!(allowed_person_path("/v1/org/me"));
        assert!(allowed_person_path("/v1/org/usage"));
        assert!(allowed_person_path("/v1/org/activity"));
        assert!(allowed_person_path("/v1/usage/me"));
        assert!(!allowed_person_path("/v1/me/usage"));
        assert!(!allowed_person_path("/v1/usage/me/other"));
        assert!(!allowed_person_path("/v1/org/../v1/me"));
        assert!(!allowed_person_path("/v1/org/usage?x=1"));
        assert!(!allowed_person_path("/v1/usage/me?x=1"));
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
    fn machines_hosts_are_known_by_exact_origin() {
        assert!(known_computers("https://machines.danil.ai"));
        assert!(known_computers("https://machines-dev.danil.ai"));
        assert!(!known_computers("https://machines.danil.ai.evil.example"));
        assert!(!known_computers("http://machines.danil.ai"));
        assert!(!known_computers("https://machines.danil.ai:8443"));
    }

    #[test]
    fn link_paths_only_take_plain_ids() {
        assert_eq!(workspace_segment("ab12cd34"), Some("ab12cd34"));
        assert_eq!(workspace_segment("ws_A-1"), Some("ws_A-1"));
        assert_eq!(workspace_segment(""), None);
        assert_eq!(workspace_segment("../v1/computers"), None);
        assert_eq!(workspace_segment("a/b"), None);
        assert_eq!(workspace_segment("a%2Fb"), None);
        assert_eq!(workspace_segment(&"a".repeat(129)), None);
    }

    #[test]
    fn link_refusals_keep_only_a_code() {
        assert_eq!(
            computers_error(&json!({"error":"danil_workspace_taken"}), "link_failed")["detail"],
            "danil_workspace_taken"
        );
        assert_eq!(
            computers_error(
                &json!({"error":{"code":"not_account_admin"}}),
                "link_failed"
            )["detail"],
            "not_account_admin"
        );
        assert_eq!(
            computers_error(&json!({"error":{"code":"Bad Code"}}), "link_failed")["detail"],
            "link_failed"
        );
        assert_eq!(
            computers_error(&Value::Null, "link_failed")["detail"],
            "link_failed"
        );
    }

    #[test]
    fn uploading_keeps_the_id_or_the_code() {
        let made = created(201, &json!({"danil_workspace_id": 476, "created": true})).unwrap();
        assert_eq!(made["danil_workspace_id"], 476);
        assert_eq!(made["created"], true);
        let exists = json!({"error":{"code":"personal_workspace_exists","danil_workspace_id":476}});
        assert_eq!(
            created(409, &exists).unwrap_err()["detail"],
            "personal_workspace_exists"
        );
        assert_eq!(
            created(502, &Value::Null).unwrap_err()["detail"],
            "create_failed"
        );
    }

    #[test]
    fn unlinking_twice_or_without_a_record_is_done() {
        assert!(unlinked(204, &Value::Null).is_ok());
        assert!(unlinked(404, &json!({"error":"not_found"})).is_ok());
        assert_eq!(
            unlinked(403, &json!({"error":"not_account_admin"})).unwrap_err()["detail"],
            "not_account_admin"
        );
        assert_eq!(
            unlinked(502, &Value::Null).unwrap_err()["detail"],
            "unlink_failed"
        );
    }

    #[test]
    fn account_key_defaults() {
        assert_eq!(key(&None), "default");
        assert_eq!(key(&Some("  ".into())), "default");
        assert_eq!(key(&Some("u_1".into())), "u_1");
    }
}
