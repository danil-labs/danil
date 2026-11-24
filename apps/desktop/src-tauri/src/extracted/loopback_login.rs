//! Listener loopback nativo de un solo uso para callbacks OAuth de motores remotos.
//!
//! Reglas de seguridad (decisión `2026-11-18-login-remoto-por-loopback.md` § 5):
//! 1. Solo enlaza `127.0.0.1:<port>`; si el puerto está ocupado devuelve `port_unavailable` sin probar otro.
//! 2. Valida método `GET`, ruta exacta y parámetro `state` exacto en tiempo constante; lectura acotada a 16 KiB.
//! 3. Cualquier otra petición recibe `404 Not Found` y nunca resuelve ni reenvía nada.
//! 4. Se cierra al primer hit válido, a las 20 peticiones inválidas, al expirar (tope 10 min) o al cancelar.
//! 5. La respuesta `200 OK` es HTML estático fijo: jamás refleja parámetros, códigos, estados ni errores.
//! 6. Ningún log ni error incluye `target`, query, `code`, `state` ni URLs de autenticación.

use serde::Serialize;
use std::collections::HashMap;
use std::io::{self, Read, Write};
use std::net::{SocketAddr, TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

const MAX_REQUEST_BYTES: usize = 16 * 1024;
const MAX_INVALID_REQUESTS: usize = 20;
const MAX_TTL_SECS: u64 = 600;
const CONNECTION_TIMEOUT: Duration = Duration::from_secs(5);
const POLL_INTERVAL: Duration = Duration::from_millis(20);

const SUCCESS_HTML: &str = concat!(
    "<!doctype html><html lang=\"es\"><head><meta charset=\"utf-8\">",
    "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">",
    "<title>Danil</title>",
    "<style>body{font-family:-apple-system,BlinkMacSystemFont,\"Segoe UI\",sans-serif;",
    "margin:0;min-height:100vh;display:grid;place-items:center;background:#fafafa;color:#171717}",
    "main{text-align:center;padding:24px}h1{font-size:18px;font-weight:600;margin:0 0 8px}",
    "p{font-size:14px;color:#525252;margin:0}</style></head>",
    "<body><main><h1>Listo</h1><p>Ya puedes volver a Danil y cerrar esta pestaña.</p></main></body></html>"
);

const NOT_FOUND_RESPONSE: &[u8] = concat!(
    "HTTP/1.1 404 Not Found\r\n",
    "Content-Type: text/plain; charset=utf-8\r\n",
    "Content-Length: 9\r\n",
    "Cache-Control: no-store\r\n",
    "Connection: close\r\n",
    "\r\n",
    "Not Found"
)
.as_bytes();

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct LoopbackError {
    pub code: &'static str,
}

impl LoopbackError {
    const fn new(code: &'static str) -> Self {
        Self { code }
    }
}

struct ListenerSlot {
    cancelled: AtomicBool,
    done: AtomicBool,
}

impl ListenerSlot {
    fn new() -> Arc<Self> {
        Arc::new(Self {
            cancelled: AtomicBool::new(false),
            done: AtomicBool::new(false),
        })
    }
}

fn active_listeners() -> &'static Mutex<HashMap<String, Arc<ListenerSlot>>> {
    static ACTIVE: OnceLock<Mutex<HashMap<String, Arc<ListenerSlot>>>> = OnceLock::new();
    ACTIVE.get_or_init(|| Mutex::new(HashMap::new()))
}

struct SlotGuard {
    login_id: String,
    slot: Arc<ListenerSlot>,
}

impl Drop for SlotGuard {
    fn drop(&mut self) {
        self.slot.done.store(true, Ordering::Release);
        let mut map = active_listeners()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if map
            .get(&self.login_id)
            .is_some_and(|current| Arc::ptr_eq(current, &self.slot))
        {
            map.remove(&self.login_id);
        }
    }
}

fn register_slot(login_id: &str) -> SlotGuard {
    let previous = {
        let mut map = active_listeners()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        map.remove(login_id)
    };
    if let Some(prev) = previous {
        prev.cancelled.store(true, Ordering::Release);
        let wait_until = Instant::now() + Duration::from_millis(250);
        while !prev.done.load(Ordering::Acquire) && Instant::now() < wait_until {
            std::thread::sleep(Duration::from_millis(10));
        }
    }
    let slot = ListenerSlot::new();
    let mut map = active_listeners()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    map.insert(login_id.to_owned(), Arc::clone(&slot));
    SlotGuard {
        login_id: login_id.to_owned(),
        slot,
    }
}

/// Cancela un listener activo por `login_id` (si existe) para liberar el puerto de inmediato.
#[tauri::command]
pub fn loopback_login_cancel(login_id: String) {
    let slot = {
        let mut map = active_listeners()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        map.remove(&login_id)
    };
    if let Some(slot) = slot {
        slot.cancelled.store(true, Ordering::Release);
    }
}

/// Cancela todos los listeners activos al cerrar la aplicación.
pub fn cancel_all() {
    let slots: Vec<Arc<ListenerSlot>> = {
        let mut map = active_listeners()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        map.drain().map(|(_, slot)| slot).collect()
    };
    for slot in slots {
        slot.cancelled.store(true, Ordering::Release);
    }
}

/// Abre un listener temporal en `127.0.0.1:<port>` y devuelve el `target` exacto del callback válido.
#[tauri::command]
pub async fn loopback_login_listen(
    login_id: String,
    port: u16,
    path: String,
    state: String,
    expires_at: u64,
) -> Result<String, LoopbackError> {
    tauri::async_runtime::spawn_blocking(move || {
        listen_blocking(&login_id, port, &path, &state, expires_at)
    })
    .await
    .map_err(|_| LoopbackError::new("cancelled"))?
}

fn compute_deadline(expires_at: u64) -> Result<Instant, LoopbackError> {
    let now_secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    if expires_at <= now_secs {
        return Err(LoopbackError::new("expired"));
    }
    let ttl_secs = (expires_at - now_secs).min(MAX_TTL_SECS);
    Ok(Instant::now() + Duration::from_secs(ttl_secs))
}

fn validate_params(
    login_id: &str,
    port: u16,
    path: &str,
    state: &str,
) -> Result<(), LoopbackError> {
    if login_id.is_empty()
        || port == 0
        || state.is_empty()
        || !path.starts_with('/')
        || path.starts_with("//")
        || path.contains('?')
        || path.contains('#')
        || path.bytes().any(|b| b <= 0x20 || b == 0x7f)
    {
        return Err(LoopbackError::new("invalid_request"));
    }
    Ok(())
}

fn listen_blocking(
    login_id: &str,
    port: u16,
    path: &str,
    state: &str,
    expires_at: u64,
) -> Result<String, LoopbackError> {
    validate_params(login_id, port, path, state)?;
    let deadline = compute_deadline(expires_at)?;
    let guard = register_slot(login_id);
    if guard.slot.cancelled.load(Ordering::Acquire) {
        return Err(LoopbackError::new("cancelled"));
    }
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    let listener = TcpListener::bind(addr).map_err(|_| LoopbackError::new("port_unavailable"))?;
    listen_with_listener(guard, listener, path, state, deadline)
}

fn listen_with_listener(
    guard: SlotGuard,
    listener: TcpListener,
    expected_path: &str,
    expected_state: &str,
    deadline: Instant,
) -> Result<String, LoopbackError> {
    listener
        .set_nonblocking(true)
        .map_err(|_| LoopbackError::new("port_unavailable"))?;

    let mut invalid_count: usize = 0;

    loop {
        if guard.slot.cancelled.load(Ordering::Acquire) {
            return Err(LoopbackError::new("cancelled"));
        }
        let now = Instant::now();
        if now >= deadline {
            return Err(LoopbackError::new("expired"));
        }

        match listener.accept() {
            Ok((mut stream, _)) => {
                let remaining = deadline.saturating_duration_since(Instant::now());
                let io_timeout = remaining
                    .min(CONNECTION_TIMEOUT)
                    .max(Duration::from_millis(100));
                let _ = stream.set_nonblocking(false);
                let _ = stream.set_read_timeout(Some(io_timeout));
                let _ = stream.set_write_timeout(Some(io_timeout));

                match read_and_validate(&mut stream, expected_path, expected_state) {
                    Some(target) => {
                        let _ = write_success(&mut stream);
                        return Ok(target);
                    }
                    None => {
                        let _ = write_not_found(&mut stream);
                        invalid_count += 1;
                        if invalid_count >= MAX_INVALID_REQUESTS {
                            return Err(LoopbackError::new("too_many_invalid_requests"));
                        }
                    }
                }
            }
            Err(err) if err.kind() == io::ErrorKind::WouldBlock => {
                let sleep_for = deadline
                    .saturating_duration_since(Instant::now())
                    .min(POLL_INTERVAL);
                if !sleep_for.is_zero() {
                    std::thread::sleep(sleep_for);
                }
            }
            Err(_) => {
                std::thread::sleep(POLL_INTERVAL);
            }
        }
    }
}

fn read_and_validate(
    stream: &mut TcpStream,
    expected_path: &str,
    expected_state: &str,
) -> Option<String> {
    let mut buf = Vec::with_capacity(2048);
    let mut chunk = [0u8; 2048];
    loop {
        let remaining = MAX_REQUEST_BYTES.saturating_sub(buf.len());
        if remaining == 0 {
            break;
        }
        let to_read = remaining.min(chunk.len());
        match stream.read(&mut chunk[..to_read]) {
            Ok(0) => break,
            Ok(n) => {
                buf.extend_from_slice(&chunk[..n]);
                if contains_header_end(&buf) {
                    break;
                }
            }
            Err(_) => return None,
        }
    }
    if buf.is_empty() || !contains_header_end(&buf) {
        return None;
    }
    validate_http_request(&buf, expected_path, expected_state)
}

fn contains_header_end(buf: &[u8]) -> bool {
    buf.windows(4).any(|w| w == b"\r\n\r\n")
}

fn validate_http_request(raw: &[u8], expected_path: &str, expected_state: &str) -> Option<String> {
    let line_end = raw.windows(2).position(|w| w == b"\r\n")?;
    let request_line = std::str::from_utf8(&raw[..line_end]).ok()?;
    let mut parts = request_line.split(' ');
    let method = parts.next()?;
    let target = parts.next()?;
    let version = parts.next()?;
    if parts.next().is_some() {
        return None;
    }
    if method != "GET" || !version.starts_with("HTTP/1.") {
        return None;
    }
    if !target.starts_with('/')
        || target.starts_with("//")
        || target.contains('#')
        || target.bytes().any(|b| b <= 0x20 || b == 0x7f)
    {
        return None;
    }

    let (req_path, query) = target.split_once('?')?;
    if req_path != expected_path {
        return None;
    }

    let mut matched_state: Option<String> = None;
    for pair in query.split('&') {
        if pair.is_empty() {
            continue;
        }
        let (raw_k, raw_v) = match pair.split_once('=') {
            Some((k, v)) => (k, v),
            None => (pair, ""),
        };
        let key = percent_decode_form(raw_k)?;
        if key == "state" {
            if matched_state.is_some() {
                return None;
            }
            matched_state = Some(percent_decode_form(raw_v)?);
        }
    }

    let got_state = matched_state?;
    if !constant_time_eq(got_state.as_bytes(), expected_state.as_bytes()) {
        return None;
    }
    Some(target.to_owned())
}

fn percent_decode_form(input: &str) -> Option<String> {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'+' => {
                out.push(b' ');
                i += 1;
            }
            b'%' => {
                if i + 2 >= bytes.len() {
                    return None;
                }
                let hi = hex_val(bytes[i + 1])?;
                let lo = hex_val(bytes[i + 2])?;
                out.push((hi << 4) | lo);
                i += 3;
            }
            b => {
                out.push(b);
                i += 1;
            }
        }
    }
    String::from_utf8(out).ok()
}

fn hex_val(b: u8) -> Option<u8> {
    match b {
        b'0'..=b'9' => Some(b - b'0'),
        b'a'..=b'f' => Some(b - b'a' + 10),
        b'A'..=b'F' => Some(b - b'A' + 10),
        _ => None,
    }
}

fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff: u8 = 0;
    for (&x, &y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

fn write_success(stream: &mut TcpStream) -> io::Result<()> {
    let header = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nCache-Control: no-store\r\nReferrer-Policy: no-referrer\r\nConnection: close\r\n\r\n",
        SUCCESS_HTML.len()
    );
    stream.write_all(header.as_bytes())?;
    stream.write_all(SUCCESS_HTML.as_bytes())?;
    stream.flush()
}

fn write_not_found(stream: &mut TcpStream) -> io::Result<()> {
    stream.write_all(NOT_FOUND_RESPONSE)?;
    stream.flush()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::thread;

    fn send_raw(addr: SocketAddr, request: &str) -> String {
        let mut stream = TcpStream::connect(addr).expect("connect to loopback listener");
        stream
            .set_read_timeout(Some(Duration::from_secs(2)))
            .expect("set read timeout");
        stream
            .write_all(request.as_bytes())
            .expect("write raw request");
        stream.flush().expect("flush raw request");
        let mut resp = String::new();
        let _ = stream.read_to_string(&mut resp);
        resp
    }

    fn bind_ephemeral() -> (TcpListener, SocketAddr) {
        let listener =
            TcpListener::bind(SocketAddr::from(([127, 0, 0, 1], 0))).expect("bind ephemeral port");
        let addr = listener.local_addr().expect("local addr");
        (listener, addr)
    }

    fn future_epoch(secs: u64) -> u64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("unix epoch")
            .as_secs()
            + secs
    }

    #[test]
    fn valid_get_returns_target_fixed_200_html_and_closes_listener() {
        let (listener, addr) = bind_ephemeral();
        let guard = register_slot("test-valid-1");
        let deadline = Instant::now() + Duration::from_secs(5);
        let handle = thread::spawn(move || {
            listen_with_listener(guard, listener, "/oauth-callback", "st_secret_42", deadline)
        });

        let target = "/oauth-callback?code=auth_code_999&state=st_secret_42&scope=openid";
        let req = format!("GET {target} HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n");
        let resp = send_raw(addr, &req);

        assert!(resp.starts_with("HTTP/1.1 200 OK\r\n"), "resp: {resp}");
        assert!(resp.contains("Cache-Control: no-store\r\n"));
        assert!(resp.contains("Referrer-Policy: no-referrer\r\n"));
        assert!(resp.contains("Ya puedes volver a Danil"));
        assert!(!resp.contains("auth_code_999"));
        assert!(!resp.contains("st_secret_42"));

        let got = handle
            .join()
            .expect("listener thread")
            .expect("valid result");
        assert_eq!(got, target);

        // Listener must be closed immediately after the first valid hit.
        assert!(TcpStream::connect(addr).is_err());
    }

    #[test]
    fn invalid_path_state_or_method_gets_404_and_listener_stays_open_until_valid_hit() {
        let (listener, addr) = bind_ephemeral();
        let guard = register_slot("test-invalid-then-valid");
        let deadline = Instant::now() + Duration::from_secs(5);
        let handle = thread::spawn(move || {
            listen_with_listener(
                guard,
                listener,
                "/oauth-callback",
                "expected_state",
                deadline,
            )
        });

        // Wrong path
        let r1 = send_raw(
            addr,
            "GET /wrong?code=a&state=expected_state HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n",
        );
        assert!(r1.starts_with("HTTP/1.1 404 Not Found\r\n"));

        // Wrong state
        let r2 = send_raw(
            addr,
            "GET /oauth-callback?code=a&state=wrong HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n",
        );
        assert!(r2.starts_with("HTTP/1.1 404 Not Found\r\n"));

        // Missing state
        let r3 = send_raw(
            addr,
            "GET /oauth-callback?code=a HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n",
        );
        assert!(r3.starts_with("HTTP/1.1 404 Not Found\r\n"));

        // Duplicate state
        let r4 = send_raw(
            addr,
            "GET /oauth-callback?state=expected_state&state=expected_state HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n",
        );
        assert!(r4.starts_with("HTTP/1.1 404 Not Found\r\n"));

        // Non-GET method
        let r5 = send_raw(
            addr,
            "POST /oauth-callback?code=a&state=expected_state HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n",
        );
        assert!(r5.starts_with("HTTP/1.1 404 Not Found\r\n"));

        // Valid request still succeeds
        let target = "/oauth-callback?code=good&state=expected_state";
        let r6 = send_raw(
            addr,
            &format!("GET {target} HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n"),
        );
        assert!(r6.starts_with("HTTP/1.1 200 OK\r\n"));

        let got = handle
            .join()
            .expect("listener thread")
            .expect("valid target");
        assert_eq!(got, target);
    }

    #[test]
    fn closes_after_20_invalid_requests() {
        let (listener, addr) = bind_ephemeral();
        let guard = register_slot("test-20-invalid");
        let deadline = Instant::now() + Duration::from_secs(5);
        let handle = thread::spawn(move || {
            listen_with_listener(guard, listener, "/oauth-callback", "st", deadline)
        });

        for _ in 0..20 {
            let resp = send_raw(addr, "GET /favicon.ico HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n");
            assert!(resp.starts_with("HTTP/1.1 404 Not Found\r\n"));
        }

        let err = handle
            .join()
            .expect("listener thread")
            .expect_err("must close after 20 invalid requests");
        assert_eq!(err, LoopbackError::new("too_many_invalid_requests"));
        assert!(TcpStream::connect(addr).is_err());
    }

    #[test]
    fn closes_on_expiration_and_explicit_cancellation() {
        // 1) Already expired timestamp returns expired immediately
        let expired_err =
            listen_blocking("test-expired-past", 51121, "/cb", "st", 1).expect_err("must expire");
        assert_eq!(expired_err, LoopbackError::new("expired"));

        // 2) Short deadline expires and closes socket
        let (listener, addr) = bind_ephemeral();
        let guard = register_slot("test-expired-live");
        let deadline = Instant::now() + Duration::from_millis(80);
        let err =
            listen_with_listener(guard, listener, "/cb", "st", deadline).expect_err("must expire");
        assert_eq!(err, LoopbackError::new("expired"));
        assert!(TcpStream::connect(addr).is_err());

        // 3) Explicit cancellation closes socket promptly
        let (listener2, addr2) = bind_ephemeral();
        let guard2 = register_slot("test-cancel-live");
        let deadline2 = Instant::now() + Duration::from_secs(10);
        let handle =
            thread::spawn(move || listen_with_listener(guard2, listener2, "/cb", "st", deadline2));

        thread::sleep(Duration::from_millis(40));
        loopback_login_cancel("test-cancel-live".to_owned());

        let cancel_err = handle
            .join()
            .expect("listener thread")
            .expect_err("must cancel");
        assert_eq!(cancel_err, LoopbackError::new("cancelled"));
        assert!(TcpStream::connect(addr2).is_err());
    }

    #[test]
    fn occupied_port_returns_port_unavailable_without_fallback() {
        let holder =
            TcpListener::bind(SocketAddr::from(([127, 0, 0, 1], 0))).expect("bind occupied port");
        let port = holder.local_addr().expect("occupied addr").port();

        let err = listen_blocking(
            "test-occupied-port",
            port,
            "/oauth-callback",
            "st",
            future_epoch(60),
        )
        .expect_err("must fail when port is occupied");
        assert_eq!(err, LoopbackError::new("port_unavailable"));
        drop(holder);
    }
}
