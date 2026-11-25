//! Login de Desk por el navegador del sistema contra `identity` (S1, decisión
//! `desk-auth` y contrato `mvp-v1` en `terminus-workspace`):
//! PKCE S256, retorno por loopback, canje en `POST /v1/identity/desk/token`,
//! refresh en el llavero y Bearer al borde. La webview recibe perfil y estado,
//! nunca tokens. Cada familia conserva su propia renovación y sus contextos.

mod context_role;
mod engine_session;
mod families;
mod login_browser;
pub(crate) mod pkce;
pub(crate) mod session;
#[cfg(test)]
mod tests;

use serde_json::{json, Value};
#[cfg(test)]
use session::Desk;
use session::{Fail, Stored, Vault};
use std::sync::OnceLock;
use std::time::{Duration, Instant};
use tauri::Emitter;

/// La única puerta: el borde `/v1`.
const EDGE: &str = "https://edge.danil.ai";
const LOGIN_WAIT: Duration = Duration::from_secs(600);
const LOGIN_POLL: Duration = Duration::from_millis(250);
const CANCEL_GRACE: Duration = Duration::from_secs(3);
const KEYCHAIN_ACCOUNT: &str = "danil";

/// `DANIL_EDGE_URL` cambia el borde solo en builds de depuración.
fn edge() -> String {
    #[cfg(debug_assertions)]
    if let Some(value) = std::env::var("DANIL_EDGE_URL")
        .ok()
        .map(|v| v.trim().trim_end_matches('/').to_owned())
        .filter(|v| v.starts_with("https://") || v.starts_with("http://127.0.0.1:"))
    {
        return value;
    }
    EDGE.to_owned()
}

/// El llavero del sistema, con la ACL del usuario. Sin llavero: solo memoria.
#[derive(Clone)]
struct Keychain {
    service: String,
    account: String,
}

impl Keychain {
    fn entry(&self) -> Option<keyring::Entry> {
        if std::env::var_os("DANIL_DESK_SESSION_MEMORY").is_some() {
            return None;
        }
        keyring::Entry::new(&self.service, &self.account).ok()
    }
}

impl Vault for Keychain {
    fn load(&self) -> Option<Stored> {
        Stored::from_record(&self.entry()?.get_password().ok()?)
    }
    fn save(&self, stored: &Stored) -> bool {
        self.entry()
            .is_some_and(|e| e.set_password(&stored.to_record()).is_ok())
    }
    fn clear(&self) {
        if let Some(e) = self.entry() {
            let _ = e.delete_credential();
        }
    }
}

impl families::FamilyVault for Keychain {
    fn family(&self, id: &str) -> Self {
        Self {
            service: self.service.clone(),
            account: format!("session:{id}"),
        }
    }
    fn index(&self) -> Option<String> {
        Self {
            service: self.service.clone(),
            account: "sessions-index".into(),
        }
        .entry()?
        .get_password()
        .ok()
    }
    fn save_index(&self, index: &str) -> bool {
        Self {
            service: self.service.clone(),
            account: "sessions-index".into(),
        }
        .entry()
        .is_some_and(|e| e.set_password(index).is_ok())
    }
}

fn desk(app: &tauri::AppHandle) -> &'static families::Families<Keychain> {
    static DESK: OnceLock<families::Families<Keychain>> = OnceLock::new();
    DESK.get_or_init(|| {
        let app = app.clone();
        families::Families::new(
            edge(),
            Keychain {
                service: format!("{}.desk-session", app.config().identifier),
                account: KEYCHAIN_ACCOUNT.into(),
            },
            move || {
                let app = app.clone();
                std::thread::spawn(move || {
                    let value = desk(&app).status();
                    announce(&app, &value);
                });
            },
        )
    })
}

fn disconnected() -> Value {
    json!({ "state": "disconnected" })
}

fn error(fail: &Fail) -> Value {
    let code = fail.code();
    let mut value = json!({ "what": { "clave": format!("danil.error.{code}") }, "detail": code });
    if let Some(wait) = fail.retry_after() {
        value["retry_after_ms"] = json!(wait.as_millis() as u64);
    }
    value
}

fn coded(code: &str) -> Value {
    json!({ "what": { "clave": format!("danil.error.{code}") }, "detail": code })
}

/// La forma de `DanilConnectStatus` que el front ya pinta (`danil-account.ts`).
pub(crate) fn status_from(me: Option<&Value>, persisted: bool) -> Value {
    let Some(me) = me else {
        return json!({ "state": "connected", "online": false, "storage": storage(persisted) });
    };
    // `me` puede venir plano (`{id, name, …}`) o con `user` (borrador); se tolera.
    let user = if me["user"].is_object() {
        &me["user"]
    } else {
        me
    };
    let text = |v: &Value| v.as_str().filter(|s| !s.is_empty()).map(str::to_owned);
    json!({
        "state": "connected",
        "online": true,
        "account": text(&user["id"]),
        "email": text(&user["email"]),
        "account_name": text(&user["name"]),
        "storage": storage(persisted),
    })
}

fn storage(persisted: bool) -> &'static str {
    if persisted {
        "keychain"
    } else {
        "memory"
    }
}

fn announce(app: &tauri::AppHandle, value: &Value) {
    let _ = app.emit("danil-connect", value.clone());
}

/// El Bearer vigente, para otros módulos de la ventana que llaman al borde.
#[allow(dead_code)]
pub(crate) fn bearer(app: &tauri::AppHandle) -> Result<(String, String), Value> {
    let d = desk(app);
    let live = d.access().map_err(|f| error(&f))?;
    Ok((d.edge().to_owned(), live.access_token))
}

/// El motor de esta ventana, para `engine_session`.
struct WindowEngine<'a>(&'a tauri::AppHandle);

impl engine_session::Engine for WindowEngine<'_> {
    fn features(&self) -> Value {
        super::proxy::engine_features(self.0)
    }
    fn call(&self, command: &str, args: Value) -> Result<Value, Value> {
        super::proxy::engine_call(self.0, command, args)
    }
}

fn owner_ready(app: &tauri::AppHandle) -> Result<engine_session::Owner<WindowEngine<'_>>, Value> {
    match engine_session::resolve(super::proxy::engine_attached(app), Some(WindowEngine(app))) {
        engine_session::Resolved::Engine(engine) => Ok(engine_session::Owner::Engine(engine)),
        engine_session::Resolved::Desk => Ok(engine_session::Owner::Desk),
        engine_session::Resolved::Waiting => Err(super::proxy::engine_down()),
    }
}

#[tauri::command(async)]
pub(super) fn danil_session_status(app: tauri::AppHandle) -> Result<Value, Value> {
    match owner_ready(&app)? {
        engine_session::Owner::Engine(engine) => Ok(engine_session::status(&engine)),
        engine_session::Owner::Desk => Ok(desk(&app).status()),
    }
}

/// Abre el navegador del sistema en `identity`, espera la vuelta por loopback y
/// canjea el código. `name` (el de la computadora) ya no se usa: se acepta para
/// no romper al front que lo manda.
#[tauri::command(async)]
pub(super) fn danil_sign_in(
    app: tauri::AppHandle,
    name: Option<String>,
    mode: Option<String>,
) -> Result<Value, Value> {
    let _ = name;
    if mode.as_deref().is_some_and(|m| m != "add") {
        return Err(coded("invalid_request"));
    }
    let add = mode.as_deref() == Some("add");
    if let engine_session::Owner::Engine(engine) = owner_ready(&app)? {
        return engine_sign_in(&app, &engine, add);
    }
    let d = desk(&app);
    let attempt = d.begin_sign_in();
    if d.capabilities()
        .announces(session::capability_of("/v1/identity/desk/authorize"))
        == Some(false)
    {
        return Err(coded("not_available_yet"));
    }
    let pkce = pkce::Pkce::open().ok_or_else(|| coded("unavailable"))?;
    let redirect_uri = pkce.redirect_uri();
    let url = d.authorize_url(&pkce.challenge, &pkce.state, &redirect_uri, add);
    let url = d.prepare_authorize(url, add).map_err(|fail| error(&fail))?;
    let mut browser = LiveBrowser::open(&app, url, add)?;
    let deadline = Instant::now() + LOGIN_WAIT;
    let mut cancelled_at: Option<Instant> = None;
    let code = loop {
        match pkce.poll().map_err(|_| coded("unavailable"))? {
            Some(pkce::Returned::Code(code)) => break code,
            Some(pkce::Returned::Denied(_)) => return Err(coded("access_denied")),
            None => {}
        }
        if !d.is_signing_in(attempt) {
            return Err(coded("cancelled"));
        }
        if browser.failed() {
            browser.fallback_to_system()?;
            cancelled_at = None;
        } else if browser.cancelled() {
            let since = *cancelled_at.get_or_insert_with(Instant::now);
            if since.elapsed() >= CANCEL_GRACE {
                return Err(coded("cancelled"));
            }
        }
        if Instant::now() > deadline {
            return Err(coded("timeout"));
        }
        std::thread::sleep(Duration::from_millis(200));
    };
    drop(browser);
    let verifier = pkce.verifier.clone();
    drop(pkce);
    d.exchange(attempt, &code, &verifier, &redirect_uri, add)
        .map_err(|f| error(&f))?;
    forget_legacy_session(&app);
    let value = d.status();
    announce(&app, &value);
    Ok(value)
}

trait SignInBrowser {
    fn cancelled(&self) -> bool;
    fn failed(&self) -> bool;
    fn fallback_to_system(&mut self) -> Result<(), Value>;
}

struct LiveBrowser {
    browser: login_browser::LoginBrowser,
    url: String,
    fell_back: bool,
}

impl LiveBrowser {
    fn open(app: &tauri::AppHandle, url: String, add: bool) -> Result<Self, Value> {
        let browser = login_browser::LoginBrowser::open(app, url.clone(), add)?;
        let fell_back = matches!(browser, login_browser::LoginBrowser::System);
        Ok(Self {
            browser,
            url,
            fell_back,
        })
    }
}

impl SignInBrowser for LiveBrowser {
    fn cancelled(&self) -> bool {
        self.browser.cancelled()
    }
    fn failed(&self) -> bool {
        self.browser.failed()
    }
    fn fallback_to_system(&mut self) -> Result<(), Value> {
        if self.fell_back {
            return Err(coded("browser"));
        }
        self.fell_back = true;
        log::warn!(
            "desk_auth: sesión privada falló de forma asíncrona; cambiando al navegador del sistema"
        );
        let previous = std::mem::replace(&mut self.browser, login_browser::LoginBrowser::System);
        drop(previous);
        self.browser = login_browser::LoginBrowser::open_system(self.url.clone())?;
        Ok(())
    }
}

fn wait_engine_sign_in<E: engine_session::Engine, B: SignInBrowser>(
    engine: &E,
    browser: &mut B,
    wait: Duration,
    poll: Duration,
    cancel_grace: Duration,
) -> Result<Value, Value> {
    let deadline = Instant::now() + wait;
    let mut cancelled_at: Option<Instant> = None;
    loop {
        let value = engine_session::status(engine);
        match engine_session::login_outcome(&value) {
            Some(Ok(())) => return Ok(value),
            Some(Err(fail)) => return Err(fail),
            None => {}
        }
        if browser.failed() {
            browser.fallback_to_system()?;
            cancelled_at = None;
        } else if browser.cancelled() {
            let pending = value["login"]["state"].as_str() == Some("pending");
            if !pending {
                return Err(coded("cancelled"));
            }
            let since = *cancelled_at.get_or_insert_with(Instant::now);
            if since.elapsed() >= cancel_grace {
                return Err(coded("cancelled"));
            }
        }
        if Instant::now() > deadline {
            return Err(coded("timeout"));
        }
        std::thread::sleep(poll);
    }
}

/// El motor da la liga y recibe la vuelta en su loopback; aquí solo se abre y se espera.
fn engine_sign_in(
    app: &tauri::AppHandle,
    engine: &WindowEngine<'_>,
    add: bool,
) -> Result<Value, Value> {
    let url = engine_session::start_login(engine, add)?;
    let mut browser = LiveBrowser::open(app, url, add)?;
    let value = wait_engine_sign_in(engine, &mut browser, LOGIN_WAIT, LOGIN_POLL, CANCEL_GRACE)?;
    drop(browser);
    announce(app, &value);
    Ok(value)
}

/// La dirección o el código que la persona pegó cuando la vuelta no llegó al loopback del
/// motor. Solo con la sesión en el motor.
#[tauri::command(async)]
pub(super) fn danil_sign_in_complete(
    app: tauri::AppHandle,
    pasted: String,
) -> Result<Value, Value> {
    let engine_session::Owner::Engine(engine) = owner_ready(&app)? else {
        return Err(coded("not_available_yet"));
    };
    engine_session::complete_login(&engine, &pasted)?;
    let value = engine_session::status(&engine);
    announce(&app, &value);
    Ok(value)
}

/// Cierra la sesión de esta instalación en `identity` y la borra del llavero.
#[tauri::command(async)]
pub(super) fn danil_sign_out(
    app: tauri::AppHandle,
    family: Option<String>,
    context: Option<String>,
) -> Result<Value, Value> {
    if let engine_session::Owner::Engine(engine) = owner_ready(&app)? {
        let value = engine_session::sign_out(&engine, family.as_deref(), context.as_deref())?;
        announce(&app, &value);
        return Ok(value);
    }
    let d = desk(&app);
    let key = pkce::random(18).ok_or_else(|| coded("unavailable"))?;
    d.sign_out(family.as_deref(), context.as_deref(), &key)
        .map_err(|e| error(&e))?;
    if family.is_none() && context.is_none() {
        forget_legacy_session(&app);
        // La cuenta del motor tampoco queda conectada; un motor sin la orden no impide salir.
        let _ = super::proxy::engine_call(&app, "danil_disconnect", json!({}));
    }
    let value = d.status();
    announce(&app, &value);
    Ok(value)
}

/// Una llamada al borde con el Bearer de Desk, solo a la lista cerrada de
/// `session::allowed`. Contesta `{status, body, location?, idempotency_key,
/// retry_after_ms?}` con el status del borde tal cual: un 404 o un 501 no es un
/// error de sesión, y el front reintenta solo. `Err` solo sin sesión, con una
/// ruta fuera de la lista o sin red.
#[tauri::command(async)]
pub(super) fn danil_edge_fetch(
    app: tauri::AppHandle,
    method: String,
    path: String,
    body: Option<Value>,
    idempotency_key: Option<String>,
    context: Option<String>,
) -> Result<Value, Value> {
    let method = method.to_ascii_uppercase();
    if !session::allowed(&method, &path) {
        return Err(coded("invalid_request"));
    }
    let key = match idempotency_key {
        Some(k) if (1..=128).contains(&k.len()) && k.bytes().all(|b| b.is_ascii_graphic()) => k,
        Some(_) => return Err(coded("invalid_request")),
        None if session::requires_caller_key(&method, &path) => {
            return Err(coded("invalid_request"))
        }
        None => pkce::random(18).ok_or_else(|| coded("unavailable"))?,
    };
    if let engine_session::Owner::Engine(engine) = owner_ready(&app)? {
        return engine_session::fetch(
            &engine,
            &method,
            &path,
            body.as_ref(),
            &key,
            context.as_deref(),
        );
    }
    desk(&app)
        .fetch(&method, &path, body.as_ref(), &key, context.as_deref())
        .map(|reply| edge_reply(&method, &reply, &key))
        .map_err(|fail| error(&fail))
}

#[cfg(test)]
fn edge_fetch<V: Vault>(
    desk: &Desk<V>,
    method: &str,
    path: &str,
    body: Option<&Value>,
    key: &str,
) -> Result<Value, Value> {
    desk.fetch(method, path, body, key)
        .map(|reply| edge_reply(method, &reply, key))
        .map_err(|fail| error(&fail))
}

pub(crate) fn edge_reply(method: &str, reply: &session::Reply, key: &str) -> Value {
    let mut value = json!({ "status": reply.status, "body": reply.body });
    if reply.body.is_null() {
        if let Some(code) = &reply.rejection_code {
            value["body"] = json!({"code":code});
        }
    }
    if let Some(reason) = reply.empty_reason {
        value["empty_reason"] = json!(reason);
    }
    if let Some(location) = &reply.location {
        value["location"] = json!(location);
    }
    if method == "POST" {
        value["idempotency_key"] = json!(key);
    }
    if let Some(wait) = reply.retry_after {
        value["retry_after_ms"] = json!(wait.as_millis() as u64);
    }
    value
}

/// Borra la entrada de la sesión anterior cuando Desk entra o sale del borde.
fn forget_legacy_session(app: &tauri::AppHandle) {
    let service = format!("{}.agents-session", app.config().identifier);
    if let Ok(entry) = keyring::Entry::new(&service, "default") {
        let _ = entry.delete_credential();
    }
}

#[cfg(test)]
mod sign_in_tests {
    use super::*;
    use std::cell::RefCell;
    use std::collections::VecDeque;

    struct SequenceEngine {
        replies: RefCell<VecDeque<Value>>,
        last: Value,
    }

    impl SequenceEngine {
        fn new(replies: Vec<Value>) -> Self {
            let last = replies
                .last()
                .cloned()
                .unwrap_or_else(|| json!({"state": "disconnected"}));
            Self {
                replies: RefCell::new(replies.into()),
                last,
            }
        }
    }

    impl engine_session::Engine for SequenceEngine {
        fn features(&self) -> Value {
            json!([engine_session::FEATURE])
        }
        fn call(&self, _command: &str, _args: Value) -> Result<Value, Value> {
            Ok(self
                .replies
                .borrow_mut()
                .pop_front()
                .unwrap_or_else(|| self.last.clone()))
        }
    }

    struct FakeBrowser {
        cancelled: bool,
        failed: bool,
        fallbacks: usize,
        fallback_ok: bool,
    }

    impl SignInBrowser for FakeBrowser {
        fn cancelled(&self) -> bool {
            self.cancelled
        }
        fn failed(&self) -> bool {
            self.failed
        }
        fn fallback_to_system(&mut self) -> Result<(), Value> {
            self.fallbacks += 1;
            if self.fallback_ok {
                self.failed = false;
                Ok(())
            } else {
                Err(coded("browser"))
            }
        }
    }

    #[test]
    fn done_outcome_wins_even_if_browser_already_reported_cancelled() {
        let engine = SequenceEngine::new(vec![json!({
            "state": "connected",
            "login": { "state": "done" }
        })]);
        let mut browser = FakeBrowser {
            cancelled: true,
            failed: false,
            fallbacks: 0,
            fallback_ok: true,
        };
        let result = wait_engine_sign_in(
            &engine,
            &mut browser,
            Duration::from_secs(1),
            Duration::from_millis(5),
            Duration::from_millis(50),
        );
        assert!(result.is_ok());
        assert_eq!(result.unwrap()["state"], "connected");
    }

    #[test]
    fn pending_login_completes_during_cancel_grace_window() {
        let engine = SequenceEngine::new(vec![
            json!({"state": "connected", "login": {"state": "pending"}}),
            json!({"state": "connected", "login": {"state": "pending"}}),
            json!({"state": "connected", "login": {"state": "done"}}),
        ]);
        let mut browser = FakeBrowser {
            cancelled: true,
            failed: false,
            fallbacks: 0,
            fallback_ok: true,
        };
        let result = wait_engine_sign_in(
            &engine,
            &mut browser,
            Duration::from_secs(1),
            Duration::from_millis(5),
            Duration::from_millis(200),
        );
        assert!(result.is_ok());
    }

    #[test]
    fn pending_login_returns_cancelled_after_grace_expires() {
        let engine = SequenceEngine::new(vec![json!({
            "state": "connected",
            "login": { "state": "pending" }
        })]);
        let mut browser = FakeBrowser {
            cancelled: true,
            failed: false,
            fallbacks: 0,
            fallback_ok: true,
        };
        let err = wait_engine_sign_in(
            &engine,
            &mut browser,
            Duration::from_secs(1),
            Duration::from_millis(5),
            Duration::from_millis(25),
        )
        .unwrap_err();
        assert_eq!(err["detail"], "cancelled");
    }

    #[test]
    fn pending_login_surfaces_engine_error_during_cancel_grace() {
        let engine = SequenceEngine::new(vec![
            json!({"state": "connected", "login": {"state": "pending"}}),
            json!({"state": "connected", "login": {"state": "error", "error": "too_many_contexts"}}),
        ]);
        let mut browser = FakeBrowser {
            cancelled: true,
            failed: false,
            fallbacks: 0,
            fallback_ok: true,
        };
        let err = wait_engine_sign_in(
            &engine,
            &mut browser,
            Duration::from_secs(1),
            Duration::from_millis(5),
            Duration::from_millis(200),
        )
        .unwrap_err();
        assert_eq!(err["detail"], "too_many_contexts");
    }

    #[test]
    fn async_private_browser_failure_falls_back_once_and_completes() {
        let engine = SequenceEngine::new(vec![
            json!({"state": "connected", "login": {"state": "pending"}}),
            json!({"state": "connected", "login": {"state": "done"}}),
        ]);
        let mut browser = FakeBrowser {
            cancelled: false,
            failed: true,
            fallbacks: 0,
            fallback_ok: true,
        };
        let result = wait_engine_sign_in(
            &engine,
            &mut browser,
            Duration::from_secs(1),
            Duration::from_millis(5),
            Duration::from_millis(50),
        );
        assert!(result.is_ok());
        assert_eq!(browser.fallbacks, 1);
    }

    #[test]
    fn async_private_browser_failure_returns_browser_error_when_fallback_fails() {
        let engine = SequenceEngine::new(vec![json!({
            "state": "connected",
            "login": { "state": "pending" }
        })]);
        let mut browser = FakeBrowser {
            cancelled: false,
            failed: true,
            fallbacks: 0,
            fallback_ok: false,
        };
        let err = wait_engine_sign_in(
            &engine,
            &mut browser,
            Duration::from_secs(1),
            Duration::from_millis(5),
            Duration::from_millis(50),
        )
        .unwrap_err();
        assert_eq!(err["detail"], "browser");
        assert_eq!(browser.fallbacks, 1);
    }
}
