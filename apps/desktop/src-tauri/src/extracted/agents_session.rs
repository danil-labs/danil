//! La sesión de persona de Atención en la ventana (docs/desktop-bff-session.md).
//! El blob sellado vive en el llavero; el access token, solo en memoria de este
//! proceso. Nada de esto llega al JavaScript ni al motor.

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine as _;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::Emitter;

const ENTRY: &str = "https://alfa-app.danil.ai";
const LOGIN_WAIT: Duration = Duration::from_secs(600);
const HTTP_WAIT: Duration = Duration::from_secs(35);
/// Pide otro token este tiempo antes de que venza el actual.
const EARLY_SECONDS: i64 = 60;

#[derive(Clone)]
struct Live {
    session: String,
    access_token: String,
    expires_at: i64,
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
struct Pkce {
    verifier: String,
    challenge: String,
    state: String,
    port: u16,
    listener: TcpListener,
}

impl Pkce {
    fn open() -> Result<Self, Value> {
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
        Ok(Self {
            verifier,
            challenge,
            state,
            port,
            listener,
        })
    }

    fn query(&self) -> String {
        format!(
            "challenge={}&state={}&port={}",
            self.challenge, self.state, self.port
        )
    }

    /// Una vuelta del navegador, sin bloquear: `Some(code)` cuando llega la buena.
    fn poll(&self) -> Result<Option<String>, Value> {
        match self.listener.accept() {
            Ok((mut stream, _)) => {
                let _ = stream.set_nonblocking(false);
                match callback(&mut stream) {
                    Some((code, returned)) if returned == self.state => {
                        answer_browser(&mut stream, true);
                        Ok(Some(code))
                    }
                    _ => {
                        answer_browser(&mut stream, false);
                        Ok(None)
                    }
                }
            }
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => Ok(None),
            Err(_) => Err(error("unavailable")),
        }
    }

    /// Canjea el código con el verificador y guarda la sesión de la ventana.
    fn exchange(self, app: &tauri::AppHandle, name: &str, code: &str) -> Result<Live, Value> {
        drop(self.listener);
        let (status, answer) = post_json(
            &format!("{}/auth/desktop/exchange", entry()),
            &json!({ "code": code, "verifier": self.verifier }),
        )?;
        if status != 200 {
            return Err(error(answer["error"].as_str().unwrap_or("unavailable")));
        }
        accept(app, name, &answer)
    }
}

/// La concesión de la sesión recién abierta; si falla, la sesión no se queda a medias.
fn bind(app: &tauri::AppHandle, account: &Option<String>, value: &Live) -> Result<(), Value> {
    if let Err(e) = grant(app, account, &value.access_token) {
        let _ = sign_out(app, account);
        return Err(e);
    }
    // La ventana ofrece sincronizar el workspace abierto (`DanilWorkspaceStep`).
    let _ = app.emit(
        "agents-session",
        json!({ "state": "signed_in", "account": key(account) }),
    );
    Ok(())
}

/// Espera la vuelta del navegador con la página de consentimiento de la entrada.
fn pkce_alone(app: &tauri::AppHandle, name: &str, generation: u64) -> Result<Live, Value> {
    let pkce = Pkce::open()?;
    super::env::open_external(format!("{}/auth/desktop?{}", entry(), pkce.query()))
        .map_err(|_| error("browser"))?;
    let deadline = Instant::now() + LOGIN_WAIT;
    loop {
        if CONNECT.load(Ordering::SeqCst) != generation {
            return Err(error("cancelled"));
        }
        if Instant::now() > deadline {
            return Err(error("timeout"));
        }
        if let Some(code) = pkce.poll()? {
            return pkce.exchange(app, name, &code);
        }
        std::thread::sleep(Duration::from_millis(200));
    }
}

/// Tras conectarse el motor, el código de la ventana tiene este margen para llegar.
const AFTER_CONNECTED: Duration = Duration::from_secs(20);

/// La página de enlace de esta entrada: solo ella recibe los parámetros de la ventana.
fn paired_page(verification_uri: &str) -> bool {
    let (Ok(page), Ok(base)) = (
        tauri::Url::parse(verification_uri),
        tauri::Url::parse(&entry()),
    ) else {
        return false;
    };
    page.scheme() == base.scheme()
        && page.host_str() == base.host_str()
        && page.port_or_known_default() == base.port_or_known_default()
}

/// `ABCD-EFGH` y nada más: el código lo entrega el motor.
fn user_code(value: &str) -> Option<String> {
    let code = value.trim().to_ascii_uppercase();
    let ok = code.len() == 9
        && code.bytes().enumerate().all(|(i, b)| {
            if i == 4 {
                b == b'-'
            } else {
                b.is_ascii_uppercase() || b.is_ascii_digit()
            }
        });
    ok.then_some(code)
}

fn engine_status(app: &tauri::AppHandle) -> Result<Value, Value> {
    super::proxy::engine_call(app, "danil_connect_status", json!({}))
}

/// Un solo inicio de sesión: el motor de esta computadora y la sesión de la ventana con una aprobación.
#[tauri::command(async)]
pub(super) fn danil_sign_in(app: tauri::AppHandle, name: Option<String>) -> Result<Value, Value> {
    let account: Option<String> = None;
    let key_name = key(&account);
    let generation = CONNECT.fetch_add(1, Ordering::SeqCst) + 1;
    let has_session = access(&app, &key_name, false).is_ok();
    let status = engine_status(&app)?;
    if status["state"] == "connected" {
        if !has_session {
            let value = pkce_alone(&app, &key_name, generation)?;
            bind(&app, &account, &value)?;
        }
        return engine_status(&app);
    }
    let named = name
        .as_deref()
        .map(str::trim)
        .filter(|n| !n.is_empty())
        .map(|n| json!({ "name": n }))
        .unwrap_or_else(|| json!({}));
    let started = super::proxy::engine_call(&app, "danil_connect_start", named)?;
    let code = started["user_code"].as_str().and_then(user_code);
    let page = started["verification_uri"]
        .as_str()
        .or_else(|| started["verification_uri_complete"].as_str())
        .unwrap_or_default();
    // Sin código válido o con otra página de enlace: el navegador de siempre, y la ventana después.
    let (Some(code), true, false) = (code, paired_page(page), has_session) else {
        if let Some(url) = started["verification_uri_complete"].as_str() {
            super::env::open_external(url.to_owned()).map_err(|_| error("browser"))?;
        }
        return Ok(started);
    };
    let pkce = Pkce::open()?;
    super::env::open_external(format!("{}/connect?code={code}&{}", entry(), pkce.query()))
        .map_err(|_| error("browser"))?;
    let deadline = Instant::now() + LOGIN_WAIT;
    let mut connected_at: Option<Instant> = None;
    let mut window_code: Option<String> = None;
    let mut next_check = Instant::now();
    loop {
        if CONNECT.load(Ordering::SeqCst) != generation {
            return Err(error("cancelled"));
        }
        if window_code.is_none() {
            window_code = pkce.poll()?;
        }
        if connected_at.is_none() && Instant::now() >= next_check {
            next_check = Instant::now() + Duration::from_secs(1);
            let now_status = engine_status(&app)?;
            match now_status["state"].as_str() {
                Some("connected") => connected_at = Some(Instant::now()),
                Some("disconnected") | Some("error") => return Ok(now_status),
                _ => {}
            }
        }
        let late = connected_at.is_some_and(|at| at.elapsed() > AFTER_CONNECTED);
        if (connected_at.is_some() && window_code.is_some()) || late || Instant::now() > deadline {
            break;
        }
        std::thread::sleep(Duration::from_millis(200));
    }
    // Con el motor conectado y el código de la ventana: sesión y concesión. Si no, el estado como esté.
    if let (Some(_), Some(window)) = (connected_at, window_code) {
        let value = pkce.exchange(&app, &key_name, &window)?;
        bind(&app, &account, &value)?;
    }
    engine_status(&app)
}

/// Cierra las dos: la concesión y la sesión de la ventana, y después la cuenta principal del motor.
#[tauri::command(async)]
pub(super) fn danil_sign_out(app: tauri::AppHandle) -> Result<Value, Value> {
    CONNECT.fetch_add(1, Ordering::SeqCst);
    // La revocación usa el token de cliente del motor: va antes de desconectarlo.
    let _ = sign_out(&app, &None);
    super::proxy::engine_call(&app, "danil_disconnect", json!({}))
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
    let _ = app.emit(
        "agents-session",
        json!({ "state": "signed_out", "account": name }),
    );
    Ok(())
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
    fn callback_query_decodes() {
        let q = url_query("code=v1.a-b_c&state=xyz%2Dq");
        assert_eq!(q["code"], "v1.a-b_c");
        assert_eq!(q["state"], "xyz-q");
    }

    #[test]
    fn tokens_only_go_to_known_computers() {
        assert!(known_computers("https://computers.danil.ai"));
        assert!(known_computers("https://computers-dev.danil.ai"));
        assert!(!known_computers("https://computers.danil.ai.evil.example"));
        assert!(!known_computers("http://computers.danil.ai"));
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
    fn only_the_entry_page_gets_the_window_parameters() {
        assert!(paired_page("https://alfa-app.danil.ai/connect"));
        assert!(paired_page(
            "https://alfa-app.danil.ai/connect?code=ABCD-EFGH"
        ));
        assert!(!paired_page("https://staging-app.danil.ai/connect"));
        assert!(!paired_page(
            "https://alfa-app.danil.ai.evil.example/connect"
        ));
        assert!(!paired_page("http://alfa-app.danil.ai/connect"));
        assert!(!paired_page("https://alfa-app.danil.ai:8443/connect"));
        assert!(!paired_page("not a url"));
    }

    #[test]
    fn user_codes_are_checked_before_composing() {
        assert_eq!(user_code("abcd-efgh").as_deref(), Some("ABCD-EFGH"));
        assert_eq!(user_code("ABCD-EFG1").as_deref(), Some("ABCD-EFG1"));
        assert_eq!(user_code("ABCD-EFGH&port=1"), None);
        assert_eq!(user_code("ABCDEFGHI"), None);
        assert_eq!(user_code("ABCD EFGH"), None);
    }

    #[test]
    fn account_key_defaults() {
        assert_eq!(key(&None), "default");
        assert_eq!(key(&Some("  ".into())), "default");
        assert_eq!(key(&Some("u_1".into())), "u_1");
    }
}
