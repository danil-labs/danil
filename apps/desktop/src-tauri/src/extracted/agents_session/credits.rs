//! Piloto local: solo la ventana conserva la sesión humana.
use super::*;
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Instant;

const MAX_INPUT: usize = 65536;
const MAX_HEADERS: usize = 8192;
const MAX_OUTPUT: u64 = 1048576;
const INFERENCE: &str = "https://app.danil.ai/api/credits/v1/chat/completions";
static GENERATION: AtomicU64 = AtomicU64::new(0);

fn active() -> &'static Mutex<Option<Arc<Binding>>> {
    static ACTIVE: OnceLock<Mutex<Option<Arc<Binding>>>> = OnceLock::new();
    ACTIVE.get_or_init(Default::default)
}
fn preparing() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(Default::default)
}
pub(super) fn invalidate() {
    let mut guard = active().lock().unwrap_or_else(|p| p.into_inner());
    GENERATION.fetch_add(1, Ordering::SeqCst);
    if let Some(binding) = guard.take() {
        binding.cancel();
    }
}

#[derive(Clone)]
struct CapturedPeer {
    runtime: String,
    call: Arc<dyn Fn(Value) -> Result<Value, Value> + Send + Sync>,
}
trait Context: Send + Sync {
    fn capture(&self) -> Result<CapturedPeer, Value>;
    fn engine(&self) -> Result<String, Value>;
    fn epoch(&self) -> u64;
    fn session(&self) -> Result<Live, Value>;
    fn readiness(&self, token: &str) -> Result<(), Value>;
}
struct WindowContext {
    app: tauri::AppHandle,
    account: Option<String>,
    workspace: String,
}
impl Context for WindowContext {
    fn capture(&self) -> Result<CapturedPeer, Value> {
        let client = super::super::proxy::credits_local_client(&self.app, &self.workspace)?;
        let runtime = client.runtime().to_owned();
        let workspace = self.workspace.clone();
        Ok(CapturedPeer {
            runtime,
            call: Arc::new(move |args| {
                super::super::proxy::credits_captured_call(&client, &workspace, args)
            }),
        })
    }
    fn engine(&self) -> Result<String, Value> {
        super::super::proxy::credits_local_engine(&self.app, &self.workspace)
    }
    fn epoch(&self) -> u64 {
        CONNECT.load(Ordering::SeqCst)
    }
    fn session(&self) -> Result<Live, Value> {
        checked(&self.app, &self.account)
    }
    fn readiness(&self, token: &str) -> Result<(), Value> {
        tauri::async_runtime::block_on(async {
            let client = reqwest::Client::builder()
                .no_proxy()
                .retry(reqwest::retry::never())
                .redirect(reqwest::redirect::Policy::none())
                .timeout(Duration::from_secs(10))
                .build()
                .map_err(|_| error("credits_unavailable"))?;
            let mut response = client
                .get("https://app.danil.ai/api/credits/v1/status")
                .bearer_auth(token)
                .header("Accept-Encoding", "identity")
                .send()
                .await
                .map_err(|_| error("credits_unavailable"))?;
            if response.status().as_u16() != 200
                || response
                    .headers()
                    .get("Content-Encoding")
                    .is_some_and(|v| v != "identity")
            {
                return Err(error("credits_unavailable"));
            }
            let mut bytes = Vec::new();
            while let Some(part) = response
                .chunk()
                .await
                .map_err(|_| error("credits_unavailable"))?
            {
                if bytes.len() + part.len() > 16384 {
                    return Err(error("credits_unavailable"));
                }
                bytes.extend_from_slice(&part);
            }
            let value: Value =
                serde_json::from_slice(&bytes).map_err(|_| error("credits_unavailable"))?;
            if value["scope"] != "automatic_request_policy"
                || value["policy_ready"] != true
                || value["ready"] != true
                || value["account_id"] != 476
                || value["model"] != "deepseek/deepseek-v4.1-flash"
                || value["max_output_tokens"] != 128
            {
                return Err(error("credits_unavailable"));
            }
            Ok(())
        })
    }
}

struct Binding {
    context: Arc<dyn Context>,
    peer: CapturedPeer,
    cancelled: tokio::sync::watch::Sender<bool>,
    sockets: Mutex<Vec<TcpStream>>,
    account: Option<String>,
    workspace: String,
    engine: String,
    person: Value,
    generation: u64,
    session_epoch: u64,
    expires: i64,
    capability: String,
    busy: AtomicBool,
    operations: Mutex<HashSet<String>>,
}

impl Binding {
    fn cancel(&self) {
        self.cancelled.send_replace(true);
        if let Ok(sockets) = self.sockets.lock() {
            for socket in sockets.iter() {
                let _ = socket.shutdown(std::net::Shutdown::Both);
            }
        }
        let peer = self.peer.clone();
        let workspace = self.workspace.clone();
        let capability = self.capability.clone();
        std::thread::spawn(move || {
            let _ = (peer.call)(
                json!({"workspaceId":workspace,"action":"clear","capability":capability}),
            );
        });
    }
    fn public(&self) -> Value {
        json!({"ready":true,"account_id":476,"model":"danil-credits/deepseek/deepseek-v4.1-flash","expires_at":self.expires})
    }
    fn valid(&self) -> bool {
        GENERATION.load(Ordering::SeqCst) == self.generation
            && self.context.epoch() == self.session_epoch
            && now() < self.expires
            && self.context.engine().ok().as_deref() == Some(self.engine.as_str())
    }
    fn session(&self) -> Result<Live, Value> {
        if !self.valid() {
            return Err(error("credits_unavailable"));
        }
        let session = self.context.session()?;
        if active_account(&session.access_token) != Some(476)
            || session.user != self.person
            || !self.valid()
        {
            return Err(error("credits_unavailable"));
        }
        Ok(session)
    }
}

pub(super) fn prepare(
    app: tauri::AppHandle,
    account: Option<String>,
    workspace: String,
) -> Result<Value, Value> {
    let context = Arc::new(WindowContext {
        app,
        account: account.clone(),
        workspace: workspace.clone(),
    });
    prepare_context(context, account, workspace)
}
fn prepare_context(
    context: Arc<dyn Context>,
    account: Option<String>,
    workspace: String,
) -> Result<Value, Value> {
    let _preparing = preparing()
        .lock()
        .map_err(|_| error("credits_unavailable"))?;
    let peer = context.capture()?;
    let engine = peer.runtime.clone();
    let session_epoch = context.epoch();
    let session = context.session()?;
    if active_account(&session.access_token) != Some(476) {
        return Err(error("credits_unavailable"));
    }
    {
        let guard = active().lock().map_err(|_| error("credits_unavailable"))?;
        if let Some(existing) = guard.as_ref() {
            if existing.valid()
                && existing.workspace == workspace
                && existing.engine == engine
                && existing.account == account
                && existing.person == session.user
                && existing.session_epoch == session_epoch
            {
                return Ok(existing.public());
            }
            if existing.busy.load(Ordering::SeqCst) {
                return Err(error("credits_unavailable"));
            }
        }
    }
    context.readiness(&session.access_token)?;
    invalidate();
    let listener = TcpListener::bind(("127.0.0.1", 0)).map_err(|_| error("credits_unavailable"))?;
    listener
        .set_nonblocking(true)
        .map_err(|_| error("credits_unavailable"))?;
    let port = listener
        .local_addr()
        .map_err(|_| error("credits_unavailable"))?
        .port();
    let generation = GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
    let binding = Arc::new(Binding {
        context,
        peer: peer.clone(),
        cancelled: tokio::sync::watch::channel(false).0,
        sockets: Mutex::new(Vec::new()),
        account,
        workspace: workspace.clone(),
        engine,
        person: session.user,
        generation,
        session_epoch,
        expires: now() + 600,
        capability: random(32)?,
        busy: AtomicBool::new(false),
        operations: Mutex::new(HashSet::new()),
    });
    *active().lock().map_err(|_| error("credits_unavailable"))? = Some(binding.clone());
    let worker = binding.clone();
    std::thread::spawn(move || {
        while worker.valid() {
            match listener.accept() {
                Ok((mut stream, _)) => {
                    if worker.busy.swap(true, Ordering::SeqCst) {
                        reply(
                            &mut stream,
                            503,
                            "application/json",
                            b"{\"error\":\"credits_busy\"}",
                        );
                        continue;
                    }
                    if let Ok(copy) = stream.try_clone() {
                        if let Ok(mut sockets) = worker.sockets.lock() {
                            sockets.clear();
                            sockets.push(copy);
                        }
                    }
                    let call = worker.clone();
                    std::thread::spawn(move || {
                        serve(&mut stream, &call);
                        if let Ok(mut sockets) = call.sockets.lock() {
                            sockets.clear();
                        }
                        call.busy.store(false, Ordering::SeqCst);
                    });
                }
                Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    std::thread::sleep(Duration::from_millis(20))
                }
                Err(_) => break,
            }
        }
        worker.cancel();
    });
    if !binding.valid() {
        invalidate();
        return Err(error("credits_unavailable"));
    }
    let installed = (peer.call)(json!({
        "workspaceId": workspace, "action": "install", "capability": binding.capability,
        "endpoint": format!("http://127.0.0.1:{port}/api/credits/v1"), "expiresAt": binding.expires,
    }));
    if !installed.as_ref().is_ok_and(|value| value["ready"] == true)
        || !binding.valid()
        || binding.session().is_err()
    {
        invalidate();
        return Err(error("credits_unavailable"));
    }
    Ok(binding.public())
}

struct Input {
    authorization: String,
    operation: String,
    body: Vec<u8>,
    status: bool,
}

fn read_input(stream: &mut TcpStream) -> Result<Input, ()> {
    let deadline = Instant::now() + Duration::from_secs(2);
    let mut bytes = Vec::new();
    let (offset, length, authorization, operation, status) = loop {
        if bytes.len() > MAX_HEADERS + MAX_INPUT {
            return Err(());
        }
        let mut headers = [httparse::EMPTY_HEADER; 32];
        let mut request = httparse::Request::new(&mut headers);
        match request.parse(&bytes).map_err(|_| ())? {
            httparse::Status::Complete(offset) => {
                let status =
                    request.method == Some("GET") && request.path == Some("/api/credits/v1/status");
                if offset > MAX_HEADERS
                    || (!status
                        && (request.method != Some("POST")
                            || request.path != Some("/api/credits/v1/chat/completions")))
                    || request.version != Some(1)
                {
                    return Err(());
                }
                let single = |name: &str| -> Result<Option<String>, ()> {
                    let mut matches = request
                        .headers
                        .iter()
                        .filter(|h| h.name.eq_ignore_ascii_case(name));
                    let value = matches
                        .next()
                        .map(|h| std::str::from_utf8(h.value).map(str::to_owned))
                        .transpose()
                        .map_err(|_| ())?;
                    if matches.next().is_some() {
                        return Err(());
                    }
                    Ok(value)
                };
                if single("origin")?.is_some()
                    || single("transfer-encoding")?.is_some()
                    || single("content-encoding")?.is_some_and(|v| v != "identity")
                    || (!status && single("content-type")?.as_deref() != Some("application/json"))
                {
                    return Err(());
                }
                let length = single("content-length")?
                    .unwrap_or_else(|| if status { "0".into() } else { String::new() })
                    .parse::<usize>()
                    .map_err(|_| ())?;
                if length > MAX_INPUT || (status && length != 0) {
                    return Err(());
                }
                let operation = single("x-danil-operation")?.unwrap_or_default();
                if !status && uuid::Uuid::parse_str(&operation).is_err() {
                    return Err(());
                }
                break (
                    offset,
                    length,
                    single("authorization")?.ok_or(())?,
                    operation,
                    status,
                );
            }
            httparse::Status::Partial if bytes.len() > MAX_HEADERS => return Err(()),
            httparse::Status::Partial => {}
        }
        let remaining = deadline.checked_duration_since(Instant::now()).ok_or(())?;
        stream.set_read_timeout(Some(remaining)).map_err(|_| ())?;
        let mut part = [0u8; 1024];
        let count = stream.read(&mut part).map_err(|_| ())?;
        if count == 0 {
            return Err(());
        }
        bytes.extend_from_slice(&part[..count]);
    };
    if bytes.len() > offset + length {
        return Err(());
    }
    while bytes.len() < offset + length {
        stream
            .set_read_timeout(Some(
                deadline.checked_duration_since(Instant::now()).ok_or(())?,
            ))
            .map_err(|_| ())?;
        let mut part = [0u8; 4096];
        let wanted = (offset + length - bytes.len()).min(part.len());
        let count = stream.read(&mut part[..wanted]).map_err(|_| ())?;
        if count == 0 {
            return Err(());
        }
        bytes.extend_from_slice(&part[..count]);
    }
    Ok(Input {
        authorization,
        operation,
        body: bytes[offset..].to_vec(),
        status,
    })
}

fn serve(stream: &mut TcpStream, binding: &Binding) {
    let result = (|| -> Result<(String, Vec<u8>), ()> {
        let input = read_input(stream)?;
        let expected = Sha256::digest(format!("Bearer {}", binding.capability).as_bytes());
        let supplied = Sha256::digest(input.authorization.as_bytes());
        if expected
            .iter()
            .zip(supplied.iter())
            .fold(0u8, |diff, (a, b)| diff | (a ^ b))
            != 0
        {
            return Err(());
        }
        let session = binding.session().map_err(|_| ())?;
        if input.status {
            let body = json!({"ready":true,"account_id":476,"workspace_id":binding.workspace,"engine_id":binding.engine,"model":"deepseek/deepseek-v4.1-flash","expires_at":binding.expires});
            return Ok((
                "application/json".into(),
                serde_json::to_vec(&body).map_err(|_| ())?,
            ));
        }
        {
            let mut operations = binding.operations.lock().map_err(|_| ())?;
            // Una respuesta perdida nunca produce un segundo envío, ni con otro cuerpo.
            if operations.len() >= 2 || !operations.insert(input.operation.clone()) {
                return Err(());
            }
        }
        let mut cancelled = binding.cancelled.subscribe();
        {
            let _gate = active().lock().map_err(|_| ())?;
            if !binding.valid() || *cancelled.borrow() {
                return Err(());
            }
        }
        let result = tauri::async_runtime::block_on(cancelable_forward(
            &mut cancelled,
            INFERENCE,
            &session.access_token,
            &input.operation,
            input.body,
        ));
        let (content_type, body) = result?;
        if !binding.valid() {
            return Err(());
        }
        Ok((content_type, body))
    })();
    match result {
        Ok((kind, body)) => reply(stream, 200, &kind, &body),
        Err(()) => reply(
            stream,
            503,
            "application/json",
            b"{\"error\":\"credits_result_pending\"}",
        ),
    }
}

async fn cancelable_forward(
    cancelled: &mut tokio::sync::watch::Receiver<bool>,
    endpoint: &str,
    token: &str,
    operation: &str,
    input: Vec<u8>,
) -> Result<(String, Vec<u8>), ()> {
    if *cancelled.borrow() {
        return Err(());
    }
    tokio::select! {
        biased;
        _ = cancelled.changed() => Err(()),
        result = forward(endpoint, token, operation, input) => result,
    }
}

async fn forward(
    endpoint: &str,
    token: &str,
    operation: &str,
    input: Vec<u8>,
) -> Result<(String, Vec<u8>), ()> {
    let client = reqwest::Client::builder()
        .no_proxy()
        .retry(reqwest::retry::never())
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(65))
        .build()
        .map_err(|_| ())?;
    let mut response = client
        .post(endpoint)
        .bearer_auth(token)
        .header("Content-Type", "application/json")
        .header("Accept-Encoding", "identity")
        .header("X-Danil-Operation", operation)
        .body(input)
        .send()
        .await
        .map_err(|_| ())?;
    if response.status().as_u16() != 200
        || response
            .headers()
            .get("Content-Encoding")
            .is_some_and(|v| v != "identity")
    {
        return Err(());
    }
    let kind = response
        .headers()
        .get("Content-Type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or_default()
        .to_owned();
    if !matches!(
        kind.split(';').next(),
        Some("application/json" | "text/event-stream")
    ) {
        return Err(());
    }
    let mut body = Vec::new();
    while let Some(part) = response.chunk().await.map_err(|_| ())? {
        if body.len() as u64 + part.len() as u64 > MAX_OUTPUT {
            return Err(());
        }
        body.extend_from_slice(&part);
    }
    Ok((kind, body))
}

fn reply(stream: &mut TcpStream, status: u16, kind: &str, body: &[u8]) {
    let _ = stream.set_write_timeout(Some(Duration::from_secs(2)));
    let _ = write!(stream, "HTTP/1.1 {status} Credits\r\nContent-Type: {kind}\r\nContent-Length: {}\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n", body.len());
    let _ = stream.write_all(body);
}

#[cfg(test)]
mod tests {
    use super::*;
    struct FakeContext {
        selected: Arc<Mutex<String>>,
        calls: Arc<Mutex<Vec<(String, String)>>>,
        switch_during_install: bool,
    }
    impl Context for FakeContext {
        fn capture(&self) -> Result<CapturedPeer, Value> {
            let runtime = self.selected.lock().unwrap().clone();
            let captured = runtime.clone();
            let selected = self.selected.clone();
            let calls = self.calls.clone();
            let switch = self.switch_during_install;
            Ok(CapturedPeer {
                runtime,
                call: Arc::new(move |args| {
                    let action = args["action"].as_str().unwrap().to_owned();
                    calls
                        .lock()
                        .unwrap()
                        .push((captured.clone(), action.clone()));
                    if action == "install" && switch {
                        *selected.lock().unwrap() = "engine-new".into();
                    }
                    Ok(json!({"ready": action == "install"}))
                }),
            })
        }
        fn engine(&self) -> Result<String, Value> {
            Ok(self.selected.lock().unwrap().clone())
        }
        fn epoch(&self) -> u64 {
            1
        }
        fn readiness(&self, _: &str) -> Result<(), Value> {
            Ok(())
        }
        fn session(&self) -> Result<Live, Value> {
            let payload = URL_SAFE_NO_PAD.encode(b"{\"active_account_id\":476}");
            Ok(Live {
                session: "synthetic".into(),
                access_token: format!("synthetic.{payload}.synthetic"),
                expires_at: now() + 3600,
                user: json!({"user_id":"synthetic"}),
            })
        }
    }
    fn binding_test_lock() -> &'static Mutex<()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(Default::default)
    }
    fn fake(switch: bool) -> Arc<FakeContext> {
        Arc::new(FakeContext {
            selected: Arc::new(Mutex::new("engine-old".into())),
            calls: Arc::new(Mutex::new(Vec::new())),
            switch_during_install: switch,
        })
    }
    #[test]
    fn changing_engine_during_install_never_sends_capability_to_new_peer() {
        let _test = binding_test_lock().lock().unwrap();
        invalidate();
        let context = fake(true);
        assert!(prepare_context(context.clone(), None, "workspace".into()).is_err());
        assert!(context
            .calls
            .lock()
            .unwrap()
            .iter()
            .all(|(engine, _)| engine == "engine-old"));
        assert!(active().lock().unwrap().is_none());
    }
    #[test]
    fn concurrent_and_in_flight_preparations_reuse_one_capability() {
        let _test = binding_test_lock().lock().unwrap();
        invalidate();
        let context = fake(false);
        let barrier = Arc::new(std::sync::Barrier::new(3));
        let calls: Vec<_> = (0..2)
            .map(|_| {
                let context = context.clone();
                let barrier = barrier.clone();
                std::thread::spawn(move || {
                    barrier.wait();
                    prepare_context(context, None, "workspace".into()).unwrap()
                })
            })
            .collect();
        barrier.wait();
        let replies: Vec<_> = calls.into_iter().map(|call| call.join().unwrap()).collect();
        assert_eq!(replies[0], replies[1]);
        let existing = active().lock().unwrap().clone().unwrap();
        existing.busy.store(true, Ordering::SeqCst);
        assert_eq!(
            prepare_context(context.clone(), None, "workspace".into()).unwrap(),
            replies[0]
        );
        assert_eq!(
            context
                .calls
                .lock()
                .unwrap()
                .iter()
                .filter(|(_, action)| action == "install")
                .count(),
            1
        );
        assert!(!*existing.cancelled.borrow());
        existing.busy.store(false, Ordering::SeqCst);
        invalidate();
        assert!(*existing.cancelled.borrow());
    }
    fn parse(raw: Vec<u8>) -> Result<Input, ()> {
        let listener = TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let addr = listener.local_addr().unwrap();
        let client = std::thread::spawn(move || {
            let mut stream = TcpStream::connect(addr).unwrap();
            stream.write_all(&raw).unwrap();
            stream.shutdown(std::net::Shutdown::Write).unwrap();
        });
        let mut stream = listener.accept().unwrap().0;
        let result = read_input(&mut stream);
        client.join().unwrap();
        result
    }
    #[test]
    fn preserves_exact_body_and_operation() {
        let id = uuid::Uuid::new_v4().to_string();
        let raw = format!("POST /api/credits/v1/chat/completions HTTP/1.1\r\nAuthorization: Bearer synthetic\r\nX-Danil-Operation: {id}\r\nContent-Type: application/json\r\nContent-Length: 2\r\n\r\n{{}}");
        let input = parse(raw.into_bytes()).unwrap();
        assert_eq!(input.body, b"{}");
        assert_eq!(input.operation, id);
    }
    #[test]
    fn cancellation_before_dispatch_sends_nothing() {
        let listener = TcpListener::bind(("127.0.0.1", 0)).unwrap();
        listener.set_nonblocking(true).unwrap();
        let endpoint = format!(
            "http://{}/api/credits/v1/chat/completions",
            listener.local_addr().unwrap()
        );
        let (_cancel, mut receiver) = tokio::sync::watch::channel(true);
        assert!(tauri::async_runtime::block_on(cancelable_forward(
            &mut receiver,
            &endpoint,
            "synthetic",
            &uuid::Uuid::new_v4().to_string(),
            b"{}".to_vec()
        ))
        .is_err());
        assert_eq!(
            listener.accept().unwrap_err().kind(),
            std::io::ErrorKind::WouldBlock
        );
    }
    #[test]
    fn cancellation_after_dispatch_closes_without_retry() {
        let listener = TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let endpoint = format!(
            "http://{}/api/credits/v1/chat/completions",
            listener.local_addr().unwrap()
        );
        let (seen, wait) = std::sync::mpsc::channel();
        let server = std::thread::spawn(move || {
            let mut stream = listener.accept().unwrap().0;
            let input = read_input(&mut stream).unwrap();
            assert_eq!(input.body, b"{}");
            seen.send(()).unwrap();
            stream
                .set_read_timeout(Some(Duration::from_secs(3)))
                .unwrap();
            let mut byte = [0];
            assert_eq!(
                stream.read(&mut byte).unwrap(),
                0,
                "cancelling drops the in-flight connection"
            );
            listener.set_nonblocking(true).unwrap();
            assert_eq!(
                listener.accept().unwrap_err().kind(),
                std::io::ErrorKind::WouldBlock
            );
        });
        let (cancel, mut receiver) = tokio::sync::watch::channel(false);
        let call = std::thread::spawn(move || {
            tauri::async_runtime::block_on(cancelable_forward(
                &mut receiver,
                &endpoint,
                "synthetic",
                &uuid::Uuid::new_v4().to_string(),
                b"{}".to_vec(),
            ))
        });
        wait.recv_timeout(Duration::from_secs(3)).unwrap();
        cancel.send_replace(true);
        assert!(call.join().unwrap().is_err());
        server.join().unwrap();
    }
    #[test]
    fn rejects_smuggling_and_large_requests_before_parsing_json() {
        let id = uuid::Uuid::new_v4();
        for extra in [
            "Transfer-Encoding: chunked\r\n",
            "Authorization: Bearer other\r\n",
            "Content-Encoding: gzip\r\n",
            "Content-Length: 2\r\n",
        ] {
            let raw = format!("POST /api/credits/v1/chat/completions HTTP/1.1\r\nAuthorization: Bearer synthetic\r\nX-Danil-Operation: {id}\r\nContent-Type: application/json\r\nContent-Length: 2\r\n{extra}\r\n");
            assert!(parse(raw.into_bytes()).is_err());
        }
        let raw = format!("POST /api/credits/v1/chat/completions HTTP/1.1\r\nAuthorization: Bearer synthetic\r\nX-Danil-Operation: {id}\r\nContent-Type: application/json\r\nContent-Length: 65537\r\n\r\n");
        assert!(parse(raw.into_bytes()).is_err());
        let raw = format!("POST /api/credits/v1/chat/completions?url=evil HTTP/1.1\r\nX-Danil-Operation: {id}\r\nContent-Length: 0\r\n\r\n");
        assert!(parse(raw.into_bytes()).is_err());
    }
}
