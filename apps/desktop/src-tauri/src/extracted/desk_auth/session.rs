//! La sesión de Desk en `identity` (S1, decisión `desk-auth`): un access opaco
//! solo en memoria y un refresh rotatorio en el llavero. Dos renovaciones a la
//! vez usarían dos veces el mismo refresh, e `identity` revocaría la familia.
//! Sin Tauri: las pruebas lo usan contra un borde simulado.

use serde_json::{json, Value};
use std::collections::HashSet;
use std::sync::{Mutex, MutexGuard, PoisonError};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

/// El nombre de cliente de Desk en `identity` (`azp`).
pub(crate) const CLIENT_ID: &str = "danil-desktop";
/// Pide otro access este tiempo antes de que venza.
const EARLY_SECONDS: i64 = 30;
const HTTP_WAIT: Duration = Duration::from_secs(20);
const MAX_BODY: u64 = 4 * 1024 * 1024;
/// Cuánto vale la lista de `/v1/capabilities` antes de volver a pedirla.
const CAPABILITIES_TTL: Duration = Duration::from_secs(60);

/// Lo que se guarda en el llavero. El access nunca.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct Stored {
    pub(crate) refresh_token: String,
    pub(crate) sid: String,
}

impl Stored {
    pub(crate) fn to_record(&self) -> String {
        json!({ "version": 1, "refresh_token": self.refresh_token, "sid": self.sid }).to_string()
    }

    /// Otro formato o versión se descarta.
    pub(crate) fn from_record(raw: &str) -> Option<Self> {
        let v = serde_json::from_str::<Value>(raw).ok()?;
        if v["version"] != 1 {
            return None;
        }
        Some(Self {
            refresh_token: v["refresh_token"]
                .as_str()
                .filter(|s| !s.is_empty())?
                .to_owned(),
            sid: v["sid"].as_str().unwrap_or_default().to_owned(),
        })
    }
}

/// Dónde vive el refresh: el llavero del sistema o, sin él, nada (solo memoria).
pub(crate) trait Vault: Send + Sync {
    fn load(&self) -> Option<Stored>;
    /// `true` si quedó guardado fuera de la memoria del proceso.
    fn save(&self, stored: &Stored) -> bool;
    fn clear(&self);
}

#[derive(Clone, Debug)]
pub(crate) struct Live {
    pub(crate) access_token: String,
    pub(crate) expires_at: i64,
    pub(crate) refresh_token: String,
    /// Si el refresh quedó en el llavero.
    pub(crate) persisted: bool,
}

/// Por qué no salió una llamada. Ningún caso lleva tokens.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) enum Fail {
    /// No hay sesión, o `identity` la rechazó: se borró del llavero.
    NoSession,
    /// La ruta todavía no existe en el borde (404/501): se reintenta sola.
    NotYet { retry_after: Duration },
    /// Red, 5xx o 429: se conserva el refresh y se reintenta.
    Unavailable { retry_after: Duration },
    /// Un error del contrato (`problem+json` `code`), con su estado.
    Refused { status: u16, code: String },
}

impl Fail {
    pub(crate) fn code(&self) -> &str {
        match self {
            Fail::NoSession => "no_session",
            Fail::NotYet { .. } => "not_available_yet",
            Fail::Unavailable { .. } => "unavailable",
            Fail::Refused { code, .. } => code,
        }
    }

    pub(crate) fn retry_after(&self) -> Option<Duration> {
        match self {
            Fail::NotYet { retry_after } | Fail::Unavailable { retry_after } => Some(*retry_after),
            _ => None,
        }
    }
}

pub(crate) fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or_default()
}

/// Espera antes del intento `attempt` (0, 1, 2…): 0,5 s, 1 s, 2 s… hasta `cap`.
/// Un `Retry-After` del servidor manda si es mayor.
pub(crate) fn backoff(attempt: u32, retry_after: Option<Duration>, cap: Duration) -> Duration {
    let base = Duration::from_millis(500u64.saturating_mul(1u64 << attempt.min(16)));
    base.max(retry_after.unwrap_or_default()).min(cap)
}

/// La capacidad que anuncia cada ruta en `/v1/capabilities`.
pub(crate) fn capability_of(path: &str) -> &'static str {
    if path.starts_with("/v1/identity/organizations") {
        "identity.organizations"
    } else if path.starts_with("/v1/identity/") {
        // `me` y `desk/*` con el Bearer de Desk.
        "identity.desk"
    } else if path.starts_with("/v1/workspaces") {
        "workspaces"
    } else if path.starts_with("/v1/machines") || path.starts_with("/v1/operations") {
        "machines"
    } else {
        "edge"
    }
}

/// Un id opaco del contrato en un segmento de ruta: sin `/`, `.`, `%` ni query.
fn opaque_id(segment: &str) -> bool {
    (1..=128).contains(&segment.len())
        && segment
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
}

/// El cursor opaco de `GET /v1/machines?cursor=` tal como lo codifica el cliente
/// (RFC 3986): letras, dígitos, `-._~` y `%XX`; nada que abra otra ruta o parámetro.
fn opaque_cursor(raw: &str) -> bool {
    let b = raw.as_bytes();
    if !(1..=1024).contains(&b.len()) {
        return false;
    }
    let mut i = 0;
    while i < b.len() {
        match b[i] {
            b'%' if i + 2 < b.len()
                && b[i + 1].is_ascii_hexdigit()
                && b[i + 2].is_ascii_hexdigit() =>
            {
                i += 3
            }
            c if c.is_ascii_alphanumeric() || matches!(c, b'-' | b'.' | b'_' | b'~') => i += 1,
            _ => return false,
        }
    }
    true
}

/// Rutas del borde (contrato `mvp-v1`) que Desk llama con su Bearer. Lista
/// cerrada con métodos y plantillas exactas, no un proxy abierto.
pub(crate) fn allowed(method: &str, path: &str) -> bool {
    // La única query: la página siguiente de máquinas (`next_cursor`, `machines.openapi`).
    if let Some(cursor) = path.strip_prefix("/v1/machines?cursor=") {
        return method == "GET" && opaque_cursor(cursor);
    }
    let fixed = matches!(
        (method, path),
        ("GET", "/v1/capabilities")
            | ("GET", "/v1/identity/me")
            | ("GET", "/v1/identity/organizations")
            | ("POST", "/v1/identity/organizations/select")
            | ("GET", "/v1/workspaces")
            | ("POST", "/v1/workspaces/select")
            | ("GET", "/v1/machines")
    );
    if fixed {
        return true;
    }
    let parts: Vec<&str> = path.split('/').collect();
    match (method, parts.as_slice()) {
        ("GET", ["", "v1", "machines", id]) => opaque_id(id),
        ("POST", ["", "v1", "machines", id, "start" | "tickets"]) => opaque_id(id),
        ("GET", ["", "v1", "operations", id]) => opaque_id(id),
        _ => false,
    }
}

/// `/v1/capabilities` leída (`{contract, items: [{name, version, status}]}`):
/// `None` si el borde aún no la sirve, y entonces no guía nada.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct Capabilities(pub(crate) Option<HashSet<String>>);

impl Capabilities {
    pub(crate) fn parse(body: &Value) -> Option<HashSet<String>> {
        let list = body["items"].as_array()?;
        Some(
            list.iter()
                // Solo la versión mayor que Desk conoce y `available`; lo demás (también
                // `degraded` y los estados desconocidos) es no disponible, como en la web.
                .filter(|c| c["version"] == 1 && c["status"] == "available")
                .filter_map(|c| c["name"].as_str())
                .map(str::to_owned)
                .collect(),
        )
    }

    /// `Some(false)` solo si la lista existe y no la anuncia como `available`.
    pub(crate) fn announces(&self, name: &str) -> Option<bool> {
        Some(self.0.as_ref()?.contains(name))
    }
}

#[derive(Debug)]
pub(crate) struct Reply {
    pub(crate) status: u16,
    pub(crate) body: Value,
    pub(crate) retry_after: Option<Duration>,
    /// `Location` (la operación de un `202`, por ejemplo).
    pub(crate) location: Option<String>,
}

fn agent() -> ureq::Agent {
    ureq::Agent::config_builder()
        .timeout_global(Some(HTTP_WAIT))
        .http_status_as_error(false)
        .max_redirects(0)
        .build()
        .into()
}

/// Una petición JSON al borde. `Err` solo si no hubo respuesta.
pub(crate) fn request(
    url: &str,
    method: &str,
    bearer: Option<&str>,
    body: Option<&Value>,
) -> Result<Reply, Fail> {
    let key = super::pkce::random(18).unwrap_or_default();
    request_keyed(url, method, bearer, body, &key)
}

/// Como `request`, con la `Idempotency-Key` de quien llama (los reintentos repiten la misma).
pub(crate) fn request_keyed(
    url: &str,
    method: &str,
    bearer: Option<&str>,
    body: Option<&Value>,
    key: &str,
) -> Result<Reply, Fail> {
    let agent = agent();
    let auth = bearer.map(|t| format!("Bearer {t}"));
    let sent = if method == "GET" {
        let mut r = agent.get(url).header("Accept", "application/json");
        if let Some(a) = &auth {
            r = r.header("Authorization", a);
        }
        r.call()
    } else {
        let mut r = agent.post(url).header("Accept", "application/json");
        // Las escrituras del contrato exigen `Idempotency-Key`.
        if !key.is_empty() {
            r = r.header("Idempotency-Key", key);
        }
        if let Some(a) = &auth {
            r = r.header("Authorization", a);
        }
        r.send_json(body.cloned().unwrap_or_else(|| json!({})))
    };
    let mut response = sent.map_err(|_| Fail::Unavailable {
        retry_after: Duration::from_secs(1),
    })?;
    let status = response.status().as_u16();
    let retry_after = response
        .headers()
        .get("Retry-After")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.trim().parse::<u64>().ok())
        .map(Duration::from_secs);
    let location = response
        .headers()
        .get("Location")
        .and_then(|v| v.to_str().ok())
        .map(str::to_owned);
    let text = response
        .body_mut()
        .with_config()
        .limit(MAX_BODY)
        .read_to_string()
        .unwrap_or_default();
    Ok(Reply {
        status,
        body: serde_json::from_str(&text).unwrap_or(Value::Null),
        retry_after,
        location,
    })
}

/// El `code` de un `problem+json` (o `{"error": "…"}`), saneado.
pub(crate) fn problem_code(body: &Value, fallback: &str) -> String {
    body["code"]
        .as_str()
        .or_else(|| body["error"].as_str())
        .filter(|c| c.len() <= 64 && c.bytes().all(|b| b.is_ascii_lowercase() || b == b'_'))
        .unwrap_or(fallback)
        .to_owned()
}

/// La respuesta de `desk/token` y `desk/refresh`: `{access_token, token_type, expires_in, refresh_token, sid}`.
pub(crate) fn tokens(body: &Value) -> Option<(String, i64, String, String)> {
    if !body["token_type"]
        .as_str()
        .is_none_or(|t| t.eq_ignore_ascii_case("bearer"))
    {
        return None;
    }
    let access = body["access_token"].as_str().filter(|s| !s.is_empty())?;
    let refresh = body["refresh_token"].as_str().filter(|s| !s.is_empty())?;
    let expires_in = body["expires_in"]
        .as_i64()
        .filter(|s| *s > 0)
        .unwrap_or(300);
    let sid = body["sid"].as_str().unwrap_or_default();
    Some((
        access.to_owned(),
        expires_in,
        refresh.to_owned(),
        sid.to_owned(),
    ))
}

/// Clasifica una respuesta que no fue 2xx.
pub(crate) fn failure(reply: &Reply, fallback: &str) -> Fail {
    let short = reply.retry_after.unwrap_or(Duration::from_secs(2));
    match reply.status {
        404 | 501 => Fail::NotYet { retry_after: short },
        429 | 500..=599 => Fail::Unavailable { retry_after: short },
        401 => Fail::NoSession,
        status => Fail::Refused {
            status,
            code: problem_code(&reply.body, fallback),
        },
    }
}

pub(crate) struct Desk<V: Vault> {
    edge: String,
    vault: V,
    live: Mutex<Option<Live>>,
    refreshing: Mutex<()>,
    capabilities: Mutex<Option<(Instant, Capabilities)>>,
}

fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(PoisonError::into_inner)
}

impl<V: Vault> Desk<V> {
    pub(crate) fn new(edge: impl Into<String>, vault: V) -> Self {
        Self {
            edge: edge.into().trim_end_matches('/').to_owned(),
            vault,
            live: Mutex::new(None),
            refreshing: Mutex::new(()),
            capabilities: Mutex::new(None),
        }
    }

    pub(crate) fn edge(&self) -> &str {
        &self.edge
    }

    /// La URL que abre el navegador del sistema. El cliente no construye la de AuthKit.
    pub(crate) fn authorize_url(&self, challenge: &str, state: &str, redirect_uri: &str) -> String {
        use super::pkce::encode;
        format!(
            "{}/v1/identity/desk/authorize?client_id={CLIENT_ID}&redirect_uri={}&code_challenge={}&code_challenge_method=S256&state={}",
            self.edge,
            encode(redirect_uri),
            encode(challenge),
            encode(state)
        )
    }

    /// `true` si hay algo con qué entrar sin navegador (en memoria o en el llavero).
    pub(crate) fn has_session(&self) -> bool {
        lock(&self.live).is_some() || self.vault.load().is_some()
    }

    pub(crate) fn persisted(&self) -> bool {
        lock(&self.live).as_ref().is_some_and(|l| l.persisted)
    }

    fn accept(&self, access: String, expires_in: i64, refresh: String, sid: String) -> Live {
        let stored = Stored {
            refresh_token: refresh.clone(),
            sid,
        };
        let persisted = self.vault.save(&stored);
        let live = Live {
            access_token: access,
            expires_at: now() + expires_in,
            refresh_token: refresh,
            persisted,
        };
        *lock(&self.live) = Some(live.clone());
        live
    }

    /// `POST /v1/identity/desk/token`: el código de un uso más el verificador.
    pub(crate) fn exchange(
        &self,
        code: &str,
        verifier: &str,
        redirect_uri: &str,
    ) -> Result<Live, Fail> {
        let reply = request(
            &format!("{}/v1/identity/desk/token", self.edge),
            "POST",
            None,
            Some(&json!({
                "grant_type": "authorization_code",
                "code": code,
                "code_verifier": verifier,
                "redirect_uri": redirect_uri,
                "client_id": CLIENT_ID,
            })),
        )?;
        if reply.status != 200 {
            return Err(match failure(&reply, "invalid_grant") {
                Fail::NoSession => Fail::Refused {
                    status: 401,
                    code: "invalid_grant".into(),
                },
                other => other,
            });
        }
        let (access, expires_in, refresh, sid) = tokens(&reply.body).ok_or(Fail::Refused {
            status: 200,
            code: "invalid_response".into(),
        })?;
        Ok(self.accept(access, expires_in, refresh, sid))
    }

    /// Un access vigente; renueva con el refresh, de uno en uno, si hace falta.
    pub(crate) fn access(&self, force: bool) -> Result<Live, Fail> {
        let before = lock(&self.live).clone();
        if let Some(current) = &before {
            if !force && current.expires_at - EARLY_SECONDS > now() {
                return Ok(current.clone());
            }
        }
        let _one = lock(&self.refreshing);
        // Otro hilo pudo renovar mientras se esperaba el candado.
        if let Some(after) = lock(&self.live).clone() {
            let renewed = before
                .as_ref()
                .is_none_or(|b| b.access_token != after.access_token);
            if renewed && after.expires_at - EARLY_SECONDS > now() {
                return Ok(after);
            }
        }
        let refresh = lock(&self.live)
            .as_ref()
            .map(|l| l.refresh_token.clone())
            .or_else(|| self.vault.load().map(|s| s.refresh_token))
            .ok_or(Fail::NoSession)?;
        let reply = request(
            &format!("{}/v1/identity/desk/refresh", self.edge),
            "POST",
            None,
            Some(&json!({
                "grant_type": "refresh_token",
                "refresh_token": refresh,
                "client_id": CLIENT_ID,
            })),
        )?;
        match reply.status {
            200 => {
                let (access, expires_in, refresh, sid) =
                    tokens(&reply.body).ok_or(Fail::Unavailable {
                        retry_after: Duration::from_secs(2),
                    })?;
                Ok(self.accept(access, expires_in, refresh, sid))
            }
            // Refresh vencido, reutilizado o de una sesión revocada: se olvida.
            400 | 401 | 403 => {
                self.forget();
                Err(Fail::NoSession)
            }
            // 503 identity_unavailable, red, 404/501 de un borde a medio desplegar: se conserva.
            _ => Err(match failure(&reply, "unavailable") {
                Fail::NoSession | Fail::Refused { .. } => Fail::Unavailable {
                    retry_after: Duration::from_secs(2),
                },
                other => other,
            }),
        }
    }

    pub(crate) fn forget(&self) {
        *lock(&self.live) = None;
        self.vault.clear();
    }

    /// `/v1/capabilities`, con caché de un minuto. Sin la ruta, no guía nada.
    pub(crate) fn capabilities(&self) -> Capabilities {
        if let Some((at, caps)) = lock(&self.capabilities).clone() {
            if at.elapsed() < CAPABILITIES_TTL {
                return caps;
            }
        }
        let caps = match request(&format!("{}/v1/capabilities", self.edge), "GET", None, None) {
            Ok(r) if r.status == 200 => Capabilities(Capabilities::parse(&r.body)),
            Ok(r) if matches!(r.status, 404 | 501) => Capabilities(None),
            // Red caída: no se guarda, se vuelve a pedir la próxima vez.
            _ => return Capabilities(None),
        };
        *lock(&self.capabilities) = Some((Instant::now(), caps.clone()));
        caps
    }

    /// Una llamada con el Bearer de Desk, tolerante a un servidor que evoluciona:
    /// - 401: renueva una vez y repite;
    /// - 404/501/429/5xx: reintenta con backoff hasta `budget`; después, `NotYet`
    ///   o `Unavailable` con la espera sugerida, y quien llama reintenta solo.
    ///
    /// `/v1/capabilities` guía la espera: una ruta que el borde no anuncia no se
    /// martillea (una sola prueba y espera larga).
    pub(crate) fn call(
        &self,
        method: &str,
        path: &str,
        body: Option<&Value>,
        budget: Duration,
    ) -> Result<Value, Fail> {
        let started = Instant::now();
        let announced = self.capabilities().announces(capability_of(path));
        let mut attempt = 0u32;
        let mut renewed = false;
        loop {
            let live = self.access(false)?;
            let reply = request(
                &format!("{}{path}", self.edge),
                method,
                Some(&live.access_token),
                body,
            )?;
            if (200..300).contains(&reply.status) {
                return Ok(if reply.body.is_null() {
                    json!({})
                } else {
                    reply.body
                });
            }
            let fail = failure(&reply, "request_failed");
            if matches!(fail, Fail::NotYet { .. }) {
                // Un 404/501: la próxima vez se relee `/v1/capabilities`.
                *lock(&self.capabilities) = None;
            }
            match &fail {
                Fail::NoSession if !renewed => {
                    renewed = true;
                    self.access(true)?;
                    continue;
                }
                Fail::NoSession => {
                    self.forget();
                    return Err(Fail::NoSession);
                }
                Fail::NotYet { retry_after } if announced == Some(false) => {
                    return Err(Fail::NotYet {
                        retry_after: (*retry_after).max(Duration::from_secs(30)),
                    });
                }
                Fail::NotYet { retry_after } | Fail::Unavailable { retry_after } => {
                    let wait = backoff(attempt, Some(*retry_after), Duration::from_secs(8));
                    if started.elapsed() + wait > budget {
                        return Err(fail);
                    }
                    std::thread::sleep(wait);
                    attempt += 1;
                }
                Fail::Refused { .. } => return Err(fail),
            }
        }
    }

    /// Una llamada con el Bearer que conserva el status: solo un 401 se trata aquí
    /// (renueva una vez y repite). Un 404 o un 501 llegan tal cual a quien llama.
    /// Un segundo 401 cierra la sesión solo si lo da `identity`: el de otro servicio
    /// (máquinas, operaciones, tickets) llega como status y la sesión sigue.
    pub(crate) fn fetch(
        &self,
        method: &str,
        path: &str,
        body: Option<&Value>,
        key: &str,
    ) -> Result<Reply, Fail> {
        let url = format!("{}{path}", self.edge);
        let live = self.access(false)?;
        let reply = request_keyed(&url, method, Some(&live.access_token), body, key)?;
        if reply.status != 401 {
            return Ok(reply);
        }
        let live = self.access(true)?;
        let reply = request_keyed(&url, method, Some(&live.access_token), body, key)?;
        if reply.status == 401 && path.starts_with("/v1/identity/") {
            self.forget();
            return Err(Fail::NoSession);
        }
        Ok(reply)
    }

    /// Revoca la sesión en `identity` (mejor esfuerzo) y la olvida aquí.
    pub(crate) fn sign_out(&self) {
        // `desk/logout` va con el Bearer: con solo el refresh guardado, se renueva antes.
        let access = if self.has_session() {
            self.access(false).ok().map(|l| l.access_token)
        } else {
            None
        };
        if let Some(access) = access {
            let _ = request(
                &format!("{}/v1/identity/desk/logout", self.edge),
                "POST",
                Some(&access),
                Some(&json!({})),
            );
        }
        self.forget();
    }
}
