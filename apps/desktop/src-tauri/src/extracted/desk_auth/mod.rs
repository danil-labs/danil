//! Login de Desk por el navegador del sistema contra `identity` (S1,
//! docs/decisions/2026-11-13-desk-auth.md en `terminus-workspace`):
//! PKCE S256, retorno por loopback, canje en `POST /v1/identity/desk/token`,
//! refresh en el llavero y Bearer al borde. La webview recibe perfil y estado,
//! nunca tokens. No hay varias cuentas: cambiar de usuario es cerrar sesión.

pub(crate) mod pkce;
pub(crate) mod session;
#[cfg(test)]
mod tests;

use serde_json::{json, Value};
use session::{Desk, Fail, Stored, Vault};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock, PoisonError};
use std::time::{Duration, Instant};
use tauri::Emitter;

/// La única puerta: el borde `/v1`.
const EDGE: &str = "https://edge.danil.ai";
const LOGIN_WAIT: Duration = Duration::from_secs(600);
/// Lo que una orden de la ventana espera reintentando antes de contestar «todavía no».
const CALL_BUDGET: Duration = Duration::from_secs(10);
const KEYCHAIN_ACCOUNT: &str = "danil";

/// Un inicio de sesión nuevo deja sin efecto al que seguía esperando.
static CONNECT: AtomicU64 = AtomicU64::new(0);

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
struct Keychain {
    service: String,
}

impl Keychain {
    fn entry(&self) -> Option<keyring::Entry> {
        if std::env::var_os("DANIL_DESK_SESSION_MEMORY").is_some() {
            return None;
        }
        keyring::Entry::new(&self.service, KEYCHAIN_ACCOUNT).ok()
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

fn desk(app: &tauri::AppHandle) -> &'static Desk<Keychain> {
    static DESK: OnceLock<Desk<Keychain>> = OnceLock::new();
    DESK.get_or_init(|| {
        Desk::new(
            edge(),
            Keychain {
                service: format!("{}.desk-session", app.config().identifier),
            },
        )
    })
}

/// La persona de `/v1/identity/me`, leída una vez por sesión.
fn profile() -> &'static Mutex<Option<Value>> {
    static P: OnceLock<Mutex<Option<Value>>> = OnceLock::new();
    P.get_or_init(Default::default)
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

fn status(app: &tauri::AppHandle) -> Value {
    let d = desk(app);
    if !d.has_session() {
        return json!({ "state": "disconnected" });
    }
    match d.access(false) {
        Err(Fail::NoSession) => {
            *profile().lock().unwrap_or_else(PoisonError::into_inner) = None;
            return json!({ "state": "disconnected" });
        }
        // Con refresh guardado pero sin `identity` ahora: la sesión sigue.
        Err(_) => return status_from(None, true),
        Ok(_) => {}
    }
    let cached = profile()
        .lock()
        .unwrap_or_else(PoisonError::into_inner)
        .clone();
    let me = cached.or_else(|| {
        let me = d
            .call("GET", "/v1/identity/me", None, Duration::from_secs(3))
            .ok()?;
        *profile().lock().unwrap_or_else(PoisonError::into_inner) = Some(me.clone());
        Some(me)
    });
    if !d.has_session() {
        return json!({ "state": "disconnected" });
    }
    status_from(me.as_ref(), d.persisted())
}

fn announce(app: &tauri::AppHandle, value: &Value) {
    let _ = app.emit("danil-connect", value.clone());
}

/// El Bearer vigente, para otros módulos de la ventana que llaman al borde.
#[allow(dead_code)]
pub(crate) fn bearer(app: &tauri::AppHandle) -> Result<(String, String), Value> {
    let d = desk(app);
    let live = d.access(false).map_err(|f| error(&f))?;
    Ok((d.edge().to_owned(), live.access_token))
}

#[tauri::command(async)]
pub(super) fn danil_session_status(app: tauri::AppHandle) -> Value {
    status(&app)
}

/// Abre el navegador del sistema en `identity`, espera la vuelta por loopback y
/// canjea el código. `name` (el de la computadora) ya no se usa: se acepta para
/// no romper al front que lo manda.
#[tauri::command(async)]
pub(super) fn danil_sign_in(app: tauri::AppHandle, name: Option<String>) -> Result<Value, Value> {
    let _ = name;
    let generation = CONNECT.fetch_add(1, Ordering::SeqCst) + 1;
    let d = desk(&app);
    if d.capabilities()
        .announces(session::capability_of("/v1/identity/desk/authorize"))
        == Some(false)
    {
        return Err(coded("not_available_yet"));
    }
    let pkce = pkce::Pkce::open().ok_or_else(|| coded("unavailable"))?;
    let redirect_uri = pkce.redirect_uri();
    let url = d.authorize_url(&pkce.challenge, &pkce.state, &redirect_uri);
    super::env::open_external(url).map_err(|_| coded("browser"))?;
    let deadline = Instant::now() + LOGIN_WAIT;
    let code = loop {
        if CONNECT.load(Ordering::SeqCst) != generation {
            return Err(coded("cancelled"));
        }
        if Instant::now() > deadline {
            return Err(coded("timeout"));
        }
        match pkce.poll().map_err(|_| coded("unavailable"))? {
            Some(pkce::Returned::Code(code)) => break code,
            Some(pkce::Returned::Denied(_)) => return Err(coded("access_denied")),
            None => std::thread::sleep(Duration::from_millis(200)),
        }
    };
    let verifier = pkce.verifier.clone();
    drop(pkce);
    d.exchange(&code, &verifier, &redirect_uri)
        .map_err(|f| error(&f))?;
    // La sesión de antes (WorkOS a Supabase) no convive con la nueva.
    super::agents_session::retire_legacy(&app);
    *profile().lock().unwrap_or_else(PoisonError::into_inner) = None;
    let value = status(&app);
    announce(&app, &value);
    Ok(value)
}

/// Cierra la sesión de esta instalación en `identity` y la borra del llavero.
#[tauri::command(async)]
pub(super) fn danil_sign_out(app: tauri::AppHandle) -> Result<Value, Value> {
    CONNECT.fetch_add(1, Ordering::SeqCst);
    desk(&app).sign_out();
    super::agents_session::retire_legacy(&app);
    *profile().lock().unwrap_or_else(PoisonError::into_inner) = None;
    let value = json!({ "state": "disconnected" });
    announce(&app, &value);
    Ok(value)
}

/// Una llamada al borde con el Bearer de Desk, solo a la lista cerrada de
/// `session::allowed`. Un 404 o un 501 se reintenta con backoff; si sigue, el
/// error `not_available_yet` lleva `retry_after_ms` y el front reintenta solo.
#[tauri::command(async)]
pub(super) fn danil_edge_fetch(
    app: tauri::AppHandle,
    method: String,
    path: String,
    body: Option<Value>,
) -> Result<Value, Value> {
    let method = method.to_ascii_uppercase();
    if !session::allowed(&method, &path) {
        return Err(coded("invalid_request"));
    }
    let d = desk(&app);
    match d.call(&method, &path, body.as_ref(), CALL_BUDGET) {
        Ok(value) => Ok(value),
        Err(Fail::NoSession) => {
            *profile().lock().unwrap_or_else(PoisonError::into_inner) = None;
            announce(&app, &json!({ "state": "disconnected" }));
            Err(error(&Fail::NoSession))
        }
        Err(f) => Err(error(&f)),
    }
}
