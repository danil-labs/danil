//! La suscripción de la ventana al diario (`service subscribe`): un hilo la
//! mantiene viva, reconecta con espera creciente y junta lo empujado en lotes
//! que la ventana recoge con [`Feed::next`].
use crate::{link::Link, Backoff, Client};
use serde_json::{json, Value};
use std::{
    sync::{mpsc, Arc, Condvar, Mutex},
    time::{Duration, Instant},
};
use terminus_engine_protocol::{Error, Push, Result};

// El motor manda `keepalive` tras 15 s sin marcos; tres sin nada es una conexión muerta.
const SILENCE: Duration = Duration::from_secs(45);
// Lo que se guarda sin que la ventana lo recoja; pasado esto se pide releer.
const MAX_QUEUED: usize = 20_000;
const MAX_SESSIONS: usize = 512;

/// Desde dónde empieza la suscripción: lo que la ventana procesó del diario.
pub struct Start {
    pub cursor: Option<u64>,
    pub replay: bool,
    pub runtime: Option<String>,
    pub sessions: Option<Vec<String>>,
}

/// Lo recogido. `batches`, en orden: `{"events"}`, `{"catchup","events"}` (reemplaza el
/// turno en curso de esa tarea) o `{"resync"}` (releer esa tarea).
pub struct Page {
    pub batches: Vec<Value>,
    pub cursor: Option<u64>,
    pub gap: bool,
    pub failure: Option<Error>,
}

#[derive(Default)]
struct State {
    batches: Vec<Value>,
    queued: usize,
    cursor: Option<u64>,
    gap: bool,
    failure: Option<Error>,
    sessions: Option<Vec<String>>,
    revision: u64,
    stopped: bool,
    wake: Option<mpsc::Sender<Signal>>,
}

struct Shared {
    state: Mutex<State>,
    ready: Condvar,
}
impl Shared {
    fn lock(&self) -> std::sync::MutexGuard<'_, State> {
        self.state.lock().unwrap_or_else(|p| p.into_inner())
    }
    fn stopped(&self) -> bool {
        self.lock().stopped
    }
    fn deliver(&self, batch: Option<Value>, cursor: Option<u64>) {
        let mut state = self.lock();
        if let Some(batch) = batch {
            state.queued += batch["events"].as_array().map_or(1, Vec::len);
            state.batches.push(batch);
            if state.queued > MAX_QUEUED {
                state.batches.clear();
                state.queued = 0;
                state.gap = true;
            }
        }
        if cursor.is_some() {
            state.cursor = cursor;
        }
        self.ready.notify_all();
    }
    fn gap(&self, cursor: Option<u64>) {
        let mut state = self.lock();
        state.gap = true;
        state.cursor = cursor;
        self.ready.notify_all();
    }
    fn fail(&self, error: Error) {
        self.lock().failure = Some(error);
        self.ready.notify_all();
    }
    /// Espera `delay` o hasta que se detenga.
    fn pause(&self, delay: Duration) {
        let state = self.lock();
        let _ = self
            .ready
            .wait_timeout_while(state, delay, |state| !state.stopped);
    }
}

enum Signal {
    Push(Push),
    Closed,
    Wake,
}

#[derive(Clone)]
pub struct Feed {
    shared: Arc<Shared>,
}

impl Feed {
    pub fn start(client: Arc<Client>, start: Start) -> Self {
        let shared = Arc::new(Shared {
            state: Mutex::new(State {
                cursor: start.cursor,
                sessions: bounded(start.sessions.clone()),
                ..State::default()
            }),
            ready: Condvar::new(),
        });
        let worker = shared.clone();
        let spawned = std::thread::Builder::new()
            .name("engine-feed".into())
            .spawn(move || run(&client, &worker, start));
        if spawned.is_err() {
            shared.fail(Error::new("service_busy"));
        }
        Self { shared }
    }

    /// Las tareas cuyo flujo token a token interesa; `None`, todas.
    pub fn filter(&self, sessions: Option<Vec<String>>) {
        let mut state = self.shared.lock();
        let sessions = bounded(sessions);
        if state.sessions == sessions {
            return;
        }
        state.sessions = sessions;
        state.revision += 1;
        if let Some(wake) = &state.wake {
            let _ = wake.send(Signal::Wake);
        }
    }

    /// Lo llegado desde la última vez, o lo que llegue antes de `wait`.
    pub fn next(&self, wait: Duration) -> Page {
        let deadline = Instant::now() + wait;
        let mut state = self.shared.lock();
        while state.batches.is_empty() && !state.gap && state.failure.is_none() && !state.stopped {
            let left = deadline.saturating_duration_since(Instant::now());
            if left.is_zero() {
                break;
            }
            state = self
                .shared
                .ready
                .wait_timeout(state, left)
                .unwrap_or_else(|p| p.into_inner())
                .0;
        }
        state.queued = 0;
        Page {
            batches: std::mem::take(&mut state.batches),
            cursor: state.cursor,
            gap: std::mem::take(&mut state.gap),
            failure: state.failure.clone(),
        }
    }

    pub fn stop(&self) {
        let mut state = self.shared.lock();
        state.stopped = true;
        if let Some(wake) = state.wake.take() {
            let _ = wake.send(Signal::Wake);
        }
        self.shared.ready.notify_all();
    }
}

fn bounded(sessions: Option<Vec<String>>) -> Option<Vec<String>> {
    let mut sessions = sessions?;
    sessions.sort();
    sessions.dedup();
    (sessions.len() <= MAX_SESSIONS).then_some(sessions)
}

/// Dónde va la suscripción: el cursor ya procesado, de qué motor, y si aún repone.
struct Position {
    cursor: Option<u64>,
    runtime: Option<String>,
    replay: bool,
}

fn run(client: &Client, shared: &Arc<Shared>, start: Start) {
    let mut position = Position {
        replay: start.replay && start.cursor.is_none(),
        cursor: start.cursor,
        runtime: start.runtime,
    };
    let mut backoff = Backoff::default();
    while !shared.stopped() {
        shared.pause(backoff.delay());
        if shared.stopped() {
            break;
        }
        let (sender, signals) = mpsc::channel::<Signal>();
        shared.lock().wake = Some(sender.clone());
        let link = client.open_link(Some(Box::new(move |push| {
            let _ = sender.send(push.map_or(Signal::Closed, Signal::Push));
        })));
        let link = match link {
            Ok(link) => link,
            Err(error) => {
                shared.fail(error);
                backoff.fail();
                continue;
            }
        };
        let outcome = follow(client, shared, &link, &signals, &mut position, &mut backoff);
        link.close();
        if let Err(error) = outcome {
            shared.fail(error);
            backoff.fail();
        }
    }
}

/// Atiende una conexión hasta que se corta (`Ok`) o el motor rechaza la suscripción.
fn follow(
    client: &Client,
    shared: &Shared,
    link: &Link,
    signals: &mpsc::Receiver<Signal>,
    position: &mut Position,
    backoff: &mut Backoff,
) -> Result<()> {
    let (mut id, mut applied) = subscribe(client, shared, link, position)?;
    backoff.reset();
    shared.lock().failure = None;
    loop {
        let (revision, sessions) = {
            let state = shared.lock();
            if state.stopped {
                let _ = client.call_on(
                    link,
                    "service unsubscribe",
                    json!({"subscription": id}),
                    Duration::from_secs(1),
                );
                return Ok(());
            }
            (state.revision, state.sessions.clone())
        };
        if revision != applied {
            let updated = client.call_on(
                link,
                "service subscription update",
                json!({"subscription": id, "sessions": sessions}),
                Duration::from_secs(5),
            );
            match updated {
                Ok(_) => applied = revision,
                Err(error) if error.code == "operation_missing" => {
                    (id, applied) = subscribe(client, shared, link, position)?;
                }
                Err(_) if !link.is_open() => return Ok(()),
                Err(error) => return Err(error),
            }
        }
        let push = match signals.recv_timeout(Duration::from_secs(1)) {
            Ok(Signal::Push(push)) => push,
            Ok(Signal::Wake) => continue,
            Ok(Signal::Closed) | Err(mpsc::RecvTimeoutError::Disconnected) => return Ok(()),
            Err(mpsc::RecvTimeoutError::Timeout) => {
                if !link.is_open() || link.silent_for() > SILENCE {
                    return Ok(());
                }
                continue;
            }
        };
        if push.subscription != id {
            continue;
        }
        if matches!(push.push.as_str(), "events" | "keepalive") {
            position.replay = false;
            if push.cursor.is_some() {
                position.cursor = push.cursor;
            }
        }
        match push.push.as_str() {
            "events" => shared.deliver(Some(json!({"events": push.events})), push.cursor),
            "keepalive" => shared.deliver(None, push.cursor),
            "catchup" => shared.deliver(
                Some(json!({"catchup": push.session, "events": push.events})),
                None,
            ),
            "session_resync" => shared.deliver(Some(json!({"resync": push.session})), None),
            "resync" => {
                position.cursor = push.latest;
                position.replay = false;
                shared.gap(push.latest);
                (id, applied) = subscribe(client, shared, link, position)?;
            }
            _ => {}
        }
    }
}

/// `service subscribe` desde la posición; un `resync_required` deja el hueco
/// marcado y vuelve a suscribir desde lo último del diario.
fn subscribe(
    client: &Client,
    shared: &Shared,
    link: &Link,
    position: &mut Position,
) -> Result<(String, u64)> {
    for _ in 0..4 {
        let (revision, sessions) = {
            let state = shared.lock();
            (state.revision, state.sessions.clone())
        };
        let replay = position.replay && position.cursor.is_none();
        let answer = client.call_on(
            link,
            "service subscribe",
            json!({
                "workspace": null,
                "sessions": sessions,
                "cursor": position.cursor,
                "runtime": position.runtime,
                "replay": replay,
                "desktop": true,
                "desktop_pid": std::process::id(),
                // Esta ventana pinta la tarjeta «Secreto solicitado»; un motor viejo ignora la clave.
                "client_features": ["secret_request_v1"],
            }),
            Duration::from_secs(10),
        );
        match answer {
            Ok(value) => {
                let id = value["subscription"]
                    .as_str()
                    .ok_or_else(|| Error::new("invalid_request"))?
                    .to_owned();
                position.runtime = value["runtime"].as_str().map(str::to_owned);
                // La reposición empieza en 0: el cursor útil llega con el primer marco.
                if !replay {
                    position.cursor = value["cursor"].as_u64();
                    shared.deliver(None, position.cursor);
                }
                return Ok((id, revision));
            }
            Err(error) if error.code == "resync_required" => {
                position.cursor = error.detail["latest"].as_u64();
                position.runtime = error.detail["runtime"].as_str().map(str::to_owned);
                position.replay = false;
                shared.gap(position.cursor);
            }
            Err(error) => return Err(error),
        }
    }
    Err(Error::new("io"))
}
