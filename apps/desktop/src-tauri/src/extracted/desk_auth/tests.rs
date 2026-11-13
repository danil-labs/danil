//! El login de Desk contra un borde simulado: canje, refresco de uno en uno,
//! llavero, reintentos de 404/501 guiados por `/v1/capabilities` y logout.

use super::pkce::{self, challenge_of, parse_request_line, Pkce, Returned};
use super::session::{self, allowed, backoff, Capabilities, Desk, Fail, Stored, Vault};
use super::status_from;
use serde_json::{json, Value};
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

#[derive(Clone, Debug)]
struct Req {
    method: String,
    path: String,
    authorization: Option<String>,
    idempotency_key: Option<String>,
    body: Value,
}

type Handler = dyn Fn(&Req, usize) -> (u16, Value) + Send + Sync;

/// Un borde de mentira: cada petición pasa por `handler(petición, n de esa ruta)`.
fn serve(handler: Arc<Handler>) -> (String, Arc<Mutex<Vec<Req>>>) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    let log: Arc<Mutex<Vec<Req>>> = Arc::default();
    let seen = log.clone();
    std::thread::spawn(move || {
        for stream in listener.incoming() {
            let Ok(stream) = stream else { continue };
            let handler = handler.clone();
            let seen = seen.clone();
            std::thread::spawn(move || answer(stream, &*handler, &seen));
        }
    });
    (base, log)
}

fn answer(mut stream: TcpStream, handler: &Handler, seen: &Mutex<Vec<Req>>) {
    let mut raw = Vec::new();
    let mut buf = [0u8; 4096];
    let head_end = loop {
        let n = stream.read(&mut buf).unwrap_or(0);
        if n == 0 {
            return;
        }
        raw.extend_from_slice(&buf[..n]);
        if let Some(i) = raw.windows(4).position(|w| w == b"\r\n\r\n") {
            break i + 4;
        }
    };
    let head = String::from_utf8_lossy(&raw[..head_end]).to_string();
    let mut lines = head.lines();
    let mut first = lines.next().unwrap_or_default().split(' ');
    let method = first.next().unwrap_or_default().to_owned();
    let path = first.next().unwrap_or_default().to_owned();
    let mut length = 0usize;
    let mut authorization = None;
    let mut idempotency_key = None;
    for line in lines {
        if let Some((k, v)) = line.split_once(':') {
            match k.trim().to_ascii_lowercase().as_str() {
                "content-length" => length = v.trim().parse().unwrap_or(0),
                "authorization" => authorization = Some(v.trim().to_owned()),
                "idempotency-key" => idempotency_key = Some(v.trim().to_owned()),
                _ => {}
            }
        }
    }
    while raw.len() < head_end + length {
        let n = stream.read(&mut buf).unwrap_or(0);
        if n == 0 {
            break;
        }
        raw.extend_from_slice(&buf[..n]);
    }
    let body = serde_json::from_slice(&raw[head_end..]).unwrap_or(Value::Null);
    let req = Req {
        method,
        path,
        authorization,
        idempotency_key,
        body,
    };
    let n = {
        let mut seen = seen.lock().unwrap();
        let n = seen.iter().filter(|r| r.path == req.path).count();
        seen.push(req.clone());
        n
    };
    let (status, value) = handler(&req, n);
    let text = if value.is_null() {
        String::new()
    } else {
        value.to_string()
    };
    let _ = write!(
        stream,
        "HTTP/1.1 {status} X\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{text}",
        text.len()
    );
}

#[derive(Default, Clone)]
struct MemoryVault(Arc<Mutex<Option<String>>>);

impl Vault for MemoryVault {
    fn load(&self) -> Option<Stored> {
        Stored::from_record(self.0.lock().unwrap().as_deref()?)
    }
    fn save(&self, stored: &Stored) -> bool {
        *self.0.lock().unwrap() = Some(stored.to_record());
        true
    }
    fn clear(&self) {
        *self.0.lock().unwrap() = None;
    }
}

fn issued(n: usize, expires_in: i64) -> Value {
    json!({ "access_token": format!("acc_{n}"), "token_type": "Bearer", "expires_in": expires_in, "refresh_token": format!("ref_{n}"), "sid": "sid_1" })
}

/// Como `examples/edge/capabilities.200.json` del contrato `mvp-v1`.
fn capabilities(names: &[&str]) -> Value {
    let mut items: Vec<Value> = names
        .iter()
        .map(|n| json!({"name": n, "version": 1, "status": "available"}))
        .collect();
    items.push(json!({"name": "machines.session.renew", "version": 1, "status": "unavailable"}));
    json!({ "contract": "mvp-v1", "items": items, "next_cursor": null })
}

fn count(log: &Mutex<Vec<Req>>, path: &str) -> usize {
    log.lock()
        .unwrap()
        .iter()
        .filter(|r| r.path == path)
        .count()
}

#[test]
fn the_challenge_is_s256_of_the_verifier() {
    // BASE64URL(SHA-256(verifier)) sin relleno, calculado aparte
    // (python3: base64.urlsafe_b64encode(hashlib.sha256(v).digest()).rstrip(b"=")).
    assert_eq!(
        challenge_of("dBjftJeZ4CVP-mJ92K9ehhuMssnbr7N2kOcIvPFXTB0"),
        "6EhL8aDaDRAetTnW_uF8x9E1NrUD4RpnZzEMlHEds1Y"
    );
    assert_eq!(challenge_of("x").len(), 43);
}

#[test]
fn the_browser_brings_back_code_or_error_with_state() {
    assert_eq!(
        parse_request_line("GET /callback?code=c%2B1&state=s HTTP/1.1\r\n"),
        Some((Returned::Code("c+1".into()), "s".into()))
    );
    assert_eq!(
        parse_request_line("GET /callback?error=access_denied&state=s HTTP/1.1\r\n"),
        Some((Returned::Denied("access_denied".into()), "s".into()))
    );
    assert_eq!(parse_request_line("GET /favicon.ico HTTP/1.1\r\n"), None);
    assert_eq!(
        parse_request_line("POST /callback?code=c&state=s HTTP/1.1\r\n"),
        None
    );
    assert_eq!(
        parse_request_line("GET /callback?code=c HTTP/1.1\r\n"),
        None
    );
}

#[test]
fn the_loopback_only_accepts_its_own_state() {
    let pkce = Pkce::open().expect("listener");
    assert!(pkce.redirect_uri().starts_with("http://127.0.0.1:"));
    assert!(pkce.redirect_uri().ends_with("/callback"));
    let send = |target: String| {
        let mut s = TcpStream::connect(("127.0.0.1", pkce.port)).unwrap();
        write!(s, "GET {target} HTTP/1.1\r\nHost: x\r\n\r\n").unwrap();
        s
    };
    let poll = || {
        for _ in 0..50 {
            if let Some(r) = pkce.poll().unwrap() {
                return Some(r);
            }
            std::thread::sleep(Duration::from_millis(20));
        }
        None
    };
    let _other = send("/callback?code=stolen&state=other".into());
    assert_eq!(poll(), None, "otro state no cierra el flujo");
    let _good = send(format!("/callback?code=abc&state={}", pkce.state));
    assert_eq!(poll(), Some(Returned::Code("abc".into())));
}

#[test]
fn authorize_goes_to_identity_with_pkce_and_loopback() {
    let desk = Desk::new("https://edge.danil.ai/", MemoryVault::default());
    let url = desk.authorize_url("chal", "st", "http://127.0.0.1:4321/callback");
    assert_eq!(
        url,
        "https://edge.danil.ai/v1/identity/desk/authorize?client_id=danil-desktop&redirect_uri=http%3A%2F%2F127.0.0.1%3A4321%2Fcallback&code_challenge=chal&code_challenge_method=S256&state=st"
    );
    assert!(
        !url.contains("authkit"),
        "el cliente no construye la URL de AuthKit"
    );
    assert_eq!(pkce::encode("a b/+"), "a%20b%2F%2B");
}

#[test]
fn exchange_keeps_refresh_in_the_vault_and_access_in_memory() {
    let (base, log) = serve(Arc::new(|r: &Req, _| match r.path.as_str() {
        "/v1/identity/desk/token" => (200, issued(1, 300)),
        _ => (404, Value::Null),
    }));
    let vault = MemoryVault::default();
    let desk = Desk::new(base, vault.clone());
    let live = desk
        .exchange("code_1", "verifier_1", "http://127.0.0.1:9/callback")
        .unwrap();
    assert_eq!(live.access_token, "acc_1");
    let sent = log.lock().unwrap()[0].clone();
    assert_eq!(sent.method, "POST");
    assert_eq!(
        sent.body,
        json!({"grant_type":"authorization_code","code":"code_1","code_verifier":"verifier_1","redirect_uri":"http://127.0.0.1:9/callback","client_id":"danil-desktop"})
    );
    let record = vault.0.lock().unwrap().clone().unwrap();
    assert!(record.contains("ref_1"));
    assert!(!record.contains("acc_1"), "el access no va al llavero");
    // El access vigente se usa sin otra llamada.
    assert_eq!(desk.access(false).unwrap().access_token, "acc_1");
    assert_eq!(log.lock().unwrap().len(), 1);
}

#[test]
fn a_bad_code_is_refused_without_a_session() {
    let (base, _) = serve(Arc::new(|_: &Req, _| {
        (
            400,
            json!({"type":"x","title":"x","status":400,"code":"invalid_grant"}),
        )
    }));
    let desk = Desk::new(base, MemoryVault::default());
    let got = desk
        .exchange("c", "v", "http://127.0.0.1:9/callback")
        .unwrap_err();
    assert_eq!(got.code(), "invalid_grant");
    assert!(!desk.has_session());
}

#[test]
fn concurrent_callers_refresh_once() {
    let refreshes = Arc::new(AtomicUsize::new(0));
    let counter = refreshes.clone();
    let (base, _) = serve(Arc::new(move |r: &Req, _| match r.path.as_str() {
        "/v1/identity/desk/refresh" => {
            let n = counter.fetch_add(1, Ordering::SeqCst) + 2;
            std::thread::sleep(Duration::from_millis(100));
            (200, issued(n, 300))
        }
        _ => (404, Value::Null),
    }));
    let vault = MemoryVault::default();
    vault.save(&Stored {
        refresh_token: "ref_1".into(),
        sid: "sid_1".into(),
    });
    let desk = Arc::new(Desk::new(base, vault.clone()));
    let threads: Vec<_> = (0..8)
        .map(|_| {
            let desk = desk.clone();
            std::thread::spawn(move || desk.access(false).map(|l| l.access_token))
        })
        .collect();
    for t in threads {
        assert_eq!(t.join().unwrap().unwrap(), "acc_2");
    }
    assert_eq!(
        refreshes.load(Ordering::SeqCst),
        1,
        "un refresh rotado se usa una sola vez"
    );
    assert!(vault.0.lock().unwrap().clone().unwrap().contains("ref_2"));
}

#[test]
fn a_rejected_refresh_forgets_the_session() {
    let (base, _) = serve(Arc::new(|_: &Req, _| {
        (
            400,
            json!({"type":"x","title":"x","status":400,"code":"invalid_grant"}),
        )
    }));
    let vault = MemoryVault::default();
    vault.save(&Stored {
        refresh_token: "ref_1".into(),
        sid: "s".into(),
    });
    let desk = Desk::new(base, vault.clone());
    assert_eq!(desk.access(false).unwrap_err(), Fail::NoSession);
    assert!(vault.load().is_none());
}

#[test]
fn identity_down_keeps_the_refresh() {
    let (base, _) = serve(Arc::new(|_: &Req, _| {
        (
            503,
            json!({"type":"x","title":"x","status":503,"code":"identity_unavailable"}),
        )
    }));
    let vault = MemoryVault::default();
    vault.save(&Stored {
        refresh_token: "ref_1".into(),
        sid: "s".into(),
    });
    let desk = Desk::new(base, vault.clone());
    assert!(matches!(desk.access(false), Err(Fail::Unavailable { .. })));
    assert!(vault.load().is_some());
}

/// Una sesión viva sin pasar por el navegador.
fn signed_in(handler: Arc<Handler>) -> (Desk<MemoryVault>, Arc<Mutex<Vec<Req>>>, MemoryVault) {
    let inner = handler.clone();
    let (base, log) = serve(Arc::new(move |r: &Req, n| match r.path.as_str() {
        "/v1/identity/desk/token" => (200, issued(1, 300)),
        _ => inner(r, n),
    }));
    let vault = MemoryVault::default();
    let desk = Desk::new(base, vault.clone());
    desk.exchange("c", "v", "http://127.0.0.1:9/callback")
        .unwrap();
    (desk, log, vault)
}

#[test]
fn a_missing_route_is_retried_until_it_appears() {
    let (desk, log, _) = signed_in(Arc::new(|r: &Req, n| match r.path.as_str() {
        "/v1/capabilities" => (200, capabilities(&["identity.desk", "workspaces"])),
        "/v1/identity/me" if n < 2 => (501, Value::Null),
        "/v1/identity/me" => {
            assert_eq!(r.authorization.as_deref(), Some("Bearer acc_1"));
            (
                200,
                json!({"id":"user_1","name":"Ana","email":"ana@example.com","organizations":[]}),
            )
        }
        _ => (404, Value::Null),
    }));
    let me = desk
        .call("GET", "/v1/identity/me", None, Duration::from_secs(10))
        .unwrap();
    assert_eq!(me["id"], "user_1");
    assert_eq!(count(&log, "/v1/identity/me"), 3);
}

#[test]
fn a_route_the_edge_does_not_announce_is_not_hammered() {
    let (desk, log, _) = signed_in(Arc::new(|r: &Req, _| match r.path.as_str() {
        "/v1/capabilities" => (200, capabilities(&["identity.desk"])),
        _ => (404, Value::Null),
    }));
    let got = desk
        .call("GET", "/v1/workspaces", None, Duration::from_secs(10))
        .unwrap_err();
    assert_eq!(got.code(), "not_available_yet");
    assert!(got.retry_after().unwrap() >= Duration::from_secs(30));
    assert_eq!(count(&log, "/v1/workspaces"), 1);
}

#[test]
fn without_capabilities_a_missing_route_gives_up_within_budget() {
    let (desk, log, _) = signed_in(Arc::new(|_: &Req, _| (404, Value::Null)));
    let started = std::time::Instant::now();
    let got = desk
        .call(
            "GET",
            "/v1/identity/organizations",
            None,
            Duration::from_secs(3),
        )
        .unwrap_err();
    assert_eq!(got.code(), "not_available_yet");
    assert!(started.elapsed() < Duration::from_secs(4));
    assert!(
        count(&log, "/v1/identity/organizations") >= 2,
        "se reintentó"
    );
}

#[test]
fn an_expired_access_is_renewed_once_and_repeated() {
    let (desk, log, _) = signed_in(Arc::new(|r: &Req, _| match r.path.as_str() {
        "/v1/capabilities" => (404, Value::Null),
        "/v1/identity/desk/refresh" => (200, issued(2, 300)),
        "/v1/workspaces" if r.authorization.as_deref() == Some("Bearer acc_1") => (
            401,
            json!({"type":"x","title":"x","status":401,"code":"invalid_session"}),
        ),
        "/v1/workspaces" => (
            200,
            json!({"items":[{"id":"ws_1","name":"General"}],"next_cursor":null}),
        ),
        _ => (404, Value::Null),
    }));
    let got = desk
        .call("GET", "/v1/workspaces", None, Duration::from_secs(5))
        .unwrap();
    assert_eq!(got["items"][0]["id"], "ws_1");
    assert_eq!(count(&log, "/v1/identity/desk/refresh"), 1);
}

#[test]
fn a_revoked_session_ends_after_one_renewal() {
    let (desk, _, vault) = signed_in(Arc::new(|r: &Req, _| match r.path.as_str() {
        "/v1/identity/desk/refresh" => (200, issued(2, 300)),
        _ => (
            401,
            json!({"type":"x","title":"x","status":401,"code":"invalid_session"}),
        ),
    }));
    assert_eq!(
        desk.call("GET", "/v1/identity/me", None, Duration::from_secs(5))
            .unwrap_err(),
        Fail::NoSession
    );
    assert!(vault.load().is_none());
    assert!(!desk.has_session());
}

#[test]
fn sign_out_revokes_in_identity_and_forgets() {
    let (desk, log, vault) = signed_in(Arc::new(|r: &Req, _| match r.path.as_str() {
        "/v1/identity/desk/logout" => (204, Value::Null),
        _ => (404, Value::Null),
    }));
    desk.sign_out();
    let sent = log.lock().unwrap().clone();
    let desk_logout = sent
        .iter()
        .find(|r| r.path == "/v1/identity/desk/logout")
        .unwrap();
    assert_eq!(desk_logout.method, "POST");
    assert_eq!(desk_logout.authorization.as_deref(), Some("Bearer acc_1"));
    assert_eq!(
        desk_logout.body,
        json!({}),
        "cuerpo vacío: el refresh no viaja"
    );
    assert!(
        !sent.iter().any(|r| r.path == "/v1/identity/logout"),
        "el logout web exige CSRF"
    );
    assert!(vault.load().is_none());
    assert!(!desk.has_session());
}

#[test]
fn sign_out_after_a_restart_renews_to_revoke() {
    let (base, log) = serve(Arc::new(|r: &Req, _| match r.path.as_str() {
        "/v1/identity/desk/refresh" => (200, issued(2, 300)),
        "/v1/identity/desk/logout" => (204, Value::Null),
        _ => (404, Value::Null),
    }));
    let vault = MemoryVault::default();
    vault.save(&Stored {
        refresh_token: "ref_1".into(),
        sid: "s".into(),
    });
    let desk = Desk::new(base, vault.clone());
    desk.sign_out();
    let logout = log
        .lock()
        .unwrap()
        .iter()
        .find(|r| r.path == "/v1/identity/desk/logout")
        .cloned()
        .unwrap();
    assert_eq!(logout.authorization.as_deref(), Some("Bearer acc_2"));
    assert!(vault.load().is_none());
}

#[test]
fn writes_carry_an_idempotency_key() {
    let (desk, log, _) = signed_in(Arc::new(|r: &Req, _| match r.path.as_str() {
        "/v1/capabilities" => (
            200,
            capabilities(&["identity.desk", "identity.organizations", "workspaces"]),
        ),
        "/v1/workspaces/select" => (
            200,
            json!({"workspace":{"id":"1","org":"org_1","name":"Danil","role":"owner"}}),
        ),
        _ => (404, Value::Null),
    }));
    let got = desk
        .call(
            "POST",
            "/v1/workspaces/select",
            Some(&json!({"workspace":"1"})),
            Duration::from_secs(5),
        )
        .unwrap();
    assert_eq!(got["workspace"]["id"], "1");
    let sent = log
        .lock()
        .unwrap()
        .iter()
        .find(|r| r.path == "/v1/workspaces/select")
        .cloned()
        .unwrap();
    assert!(sent
        .idempotency_key
        .as_deref()
        .is_some_and(|k| (1..=128).contains(&k.len())));
    assert_eq!(sent.body, json!({"workspace":"1"}));
}

#[test]
fn only_the_mvp_routes_are_callable() {
    assert!(allowed("GET", "/v1/identity/me"));
    assert!(allowed("GET", "/v1/identity/organizations"));
    assert!(allowed("POST", "/v1/identity/organizations/select"));
    assert!(allowed("GET", "/v1/workspaces"));
    assert!(allowed("POST", "/v1/workspaces/select"));
    for (m, p) in [
        ("GET", "/v1/messaging/conversations"),
        ("GET", "/api/inbox/x"),
        ("POST", "/v1/identity/desk/confirm"),
        ("POST", "/v1/identity/me"),
        ("GET", "/v1/workspaces/../identity/me"),
        ("DELETE", "/v1/workspaces"),
    ] {
        assert!(!allowed(m, p), "{m} {p}");
    }
}

#[test]
fn capabilities_guide_only_when_listed() {
    let none = Capabilities(None);
    assert_eq!(none.announces("workspaces"), None);
    let some = Capabilities(Capabilities::parse(&capabilities(&[
        "identity.desk",
        "workspaces",
    ])));
    assert_eq!(some.announces("identity.desk"), Some(true));
    assert_eq!(some.announces("workspaces"), Some(true));
    assert_eq!(
        some.announces("machines"),
        Some(false),
        "ausente: no disponible"
    );
    assert_eq!(
        some.announces("machines.session.renew"),
        Some(false),
        "status unavailable"
    );
    assert_eq!(
        session::capability_of("/v1/identity/desk/token"),
        "identity.desk"
    );
    assert_eq!(session::capability_of("/v1/identity/me"), "identity.desk");
    assert_eq!(
        session::capability_of("/v1/identity/organizations/select"),
        "identity.organizations"
    );
}

#[test]
fn backoff_grows_and_honours_retry_after() {
    let cap = Duration::from_secs(8);
    assert_eq!(backoff(0, None, cap), Duration::from_millis(500));
    assert_eq!(backoff(2, None, cap), Duration::from_secs(2));
    assert_eq!(backoff(10, None, cap), cap);
    assert_eq!(
        backoff(0, Some(Duration::from_secs(3)), cap),
        Duration::from_secs(3)
    );
}

#[test]
fn the_profile_reaches_the_window_without_tokens() {
    let flat = status_from(
        Some(
            &json!({"id":"user_1","name":"Ana","state":"active","workspace":null,"organizations":[],"access_token":"no"}),
        ),
        true,
    );
    assert_eq!(flat["state"], "connected");
    assert_eq!(flat["account"], "user_1");
    assert_eq!(flat["account_name"], "Ana");
    assert_eq!(flat["storage"], "keychain");
    assert!(!flat.to_string().contains("access_token"));
    let nested = status_from(Some(&json!({"user":{"id":"user_2","name":"Bo"}})), false);
    assert_eq!(nested["account"], "user_2");
    assert_eq!(nested["storage"], "memory");
    assert_eq!(status_from(None, true)["online"], false);
}

#[test]
fn the_stored_record_has_one_version() {
    let s = Stored {
        refresh_token: "r".into(),
        sid: "s".into(),
    };
    assert_eq!(Stored::from_record(&s.to_record()), Some(s));
    assert_eq!(
        Stored::from_record(r#"{"version":1,"user_id":"u","session":"legacy"}"#),
        None
    );
}

#[test]
fn contract_examples_are_understood() {
    // Ejemplos de `docs/contracts/mvp-v1/examples` (terminus-workspace `695634e`).
    let parse = |raw: &str| serde_json::from_str::<Value>(raw).unwrap();
    let token = parse(include_str!("contract/desk_token.200.json"));
    let (access, expires_in, refresh, sid) = session::tokens(&token).unwrap();
    assert!(access.starts_with("dat_") && refresh.starts_with("drt_") && sid.starts_with("sid_"));
    assert_eq!(expires_in, 300);
    assert!(session::tokens(&parse(include_str!("contract/desk_refresh.200.json"))).is_some());
    let caps = Capabilities(Capabilities::parse(&parse(include_str!(
        "contract/capabilities.200.json"
    ))));
    for name in [
        "identity.desk",
        "identity.organizations",
        "workspaces",
        "machines",
    ] {
        assert_eq!(caps.announces(name), Some(true), "{name}");
    }
    assert_eq!(caps.announces("machines.session.renew"), Some(false));
    let me = status_from(Some(&parse(include_str!("contract/me.200.json"))), true);
    assert_eq!(me["account"], "user_01M62PSER5AJPC2751EECWQDEX");
    assert_eq!(me["account_name"], "Alejandro");
    assert_eq!(
        status_from(
            Some(&parse(include_str!("contract/me.200.no_org.json"))),
            true
        )["state"],
        "connected"
    );
    assert_eq!(
        session::problem_code(&parse(include_str!("contract/invalid_grant.400.json")), "x"),
        "invalid_grant"
    );
    assert_eq!(
        session::problem_code(
            &parse(include_str!("contract/identity_unavailable.503.json")),
            "x"
        ),
        "identity_unavailable"
    );
}
