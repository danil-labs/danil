//! Proxy cerrado del contrato habitual; cada solicitud captura su workspace.
//! Los canales Tauri quedan en la ventana y el host conserva progreso y ejecución.
use serde_json::{json, Value};
use std::{
    sync::{
        atomic::{AtomicBool, AtomicUsize, Ordering},
        Arc, Mutex, OnceLock, RwLock,
    },
    time::{Duration, Instant},
};
use tauri::{Emitter, Manager};
use terminus_engine_client::{
    push::{Feed, Start},
    Client,
};
use terminus_engine_protocol::{Error, StreamPage};

/// Su workspace y su corte.
type OwnedWatch = (Option<String>, Arc<AtomicBool>);
type OpenStream = (String, Option<String>);

/// `--wake <programa>`: el programa enciende la máquina remota y reescribe la
/// selección. Solo lo disparan las acciones de la persona; el sondeo no la enciende.
pub(super) static WAKE: OnceLock<(std::path::PathBuf, std::path::PathBuf)> = OnceLock::new();

/// La máquina de esta ventana: la local, o la remota de `--wake` con su programa
/// de encendido. Las otras máquinas de la cuenta las suma la ventana por el relay
/// (`features/machines/router.ts`), nunca este proceso.
struct Machine {
    local: bool,
    wake: Option<(std::path::PathBuf, std::path::PathBuf)>,
}
fn home(autostart: bool) -> Machine {
    match WAKE.get() {
        Some((program, selection)) => Machine {
            local: false,
            wake: Some((program.clone(), selection.clone())),
        },
        None => Machine {
            local: autostart,
            wake: None,
        },
    }
}
const WAKES: &[&str] = &[
    "send_message",
    // La tarea vacía de la vista previa nace donde nacería la del primer mensaje.
    "create_empty_session",
    "inject_message",
    "create_project",
    "create_agent",
    "respond_permission",
    "answer_question",
    "answer_shell_output",
    "run_shell_command",
    "queue_ready",
    "resume_awaiting_quota",
    "recreate_task_work",
    // Llevar trabajo despierta la máquina de destino con `work_import {probe: true}`.
    "work_import",
];
/// La suscripción viva y el cursor que la ventana ya recibió de ella.
struct Fed {
    client: Arc<Client>,
    feed: Feed,
    delivered: Option<u64>,
}
// Cuánto espera `service_poll` lo empujado antes de contestar sin eventos.
const PUSH_WAIT: Duration = Duration::from_secs(20);
const HISTORY_TURNS: u64 = 150;

pub(super) struct State {
    client: RwLock<Arc<Client>>,
    autostart: bool,
    restarts: Mutex<Vec<Instant>>,
    restart_failure: Mutex<Option<Error>>,
    waking: Mutex<()>,
    woke: AtomicBool,
    machine: Machine,
    workspace: Mutex<Option<String>>,
    closed: AtomicBool,
    in_flight: AtomicUsize,
    stream_gap: AtomicBool,
    watchers: Mutex<std::collections::BTreeMap<String, OwnedWatch>>,
    clones: Mutex<std::collections::BTreeMap<String, Option<String>>>,
    streams: Mutex<Vec<OpenStream>>,
    feed: Mutex<Option<Fed>>,
    sessions: Mutex<Option<Vec<String>>>,
}
impl State {
    pub fn new(client: Arc<Client>, autostart: bool) -> Self {
        Self {
            client: RwLock::new(client),
            autostart,
            restarts: Mutex::new(Vec::new()),
            restart_failure: Mutex::new(None),
            waking: Mutex::new(()),
            woke: AtomicBool::new(false),
            machine: home(autostart),
            workspace: Mutex::new(None),
            closed: AtomicBool::new(false),
            in_flight: AtomicUsize::new(0),
            stream_gap: AtomicBool::new(false),
            watchers: Mutex::new(Default::default()),
            clones: Mutex::new(Default::default()),
            streams: Mutex::new(Vec::new()),
            feed: Mutex::new(None),
            sessions: Mutex::new(None),
        }
    }
    pub fn client(&self) -> Arc<Client> {
        self.client
            .read()
            .unwrap_or_else(|p| p.into_inner())
            .clone()
    }
    /// Relanza el motor empaquetado tras un corte, o adopta el que otra ventana relanzó;
    /// como mucho tres veces en diez minutos.
    fn restart(&self) -> Result<(), Error> {
        let mut restarts = self.restarts.lock().unwrap_or_else(|p| p.into_inner());
        let current = self.client();
        if super::engine_profile::managed(&current.selection().data_directory)? {
            let client = super::engine::reconnect_managed(&current)?;
            *self.client.write().unwrap_or_else(|p| p.into_inner()) = Arc::new(client);
            return Ok(());
        }
        if !self.autostart || !self.machine().local {
            return Err(Error::new("app_unavailable"));
        }
        restarts.retain(|at| at.elapsed() < Duration::from_secs(600));
        let mut last_failure = self
            .restart_failure
            .lock()
            .unwrap_or_else(|p| p.into_inner());
        if restarts.len() >= 3 {
            return Err(last_failure
                .clone()
                .unwrap_or_else(|| Error::new("app_unavailable")));
        }
        restarts.push(Instant::now());
        let selected = super::engine::paths()
            .and_then(|paths| super::engine::ensure(&paths, false))
            .and_then(|selection| Client::select(&selection));
        match selected {
            Ok(client) => {
                *last_failure = None;
                *self.client.write().unwrap_or_else(|p| p.into_inner()) = Arc::new(client);
                Ok(())
            }
            Err(error) => {
                *last_failure = Some(error.clone());
                Err(error)
            }
        }
    }
    fn machine(&self) -> &Machine {
        &self.machine
    }
    /// La máquina activa es remota: apagada se enciende al actuar, no al sondear.
    fn remote(&self) -> bool {
        self.machine().wake.is_some()
    }
    /// Enciende la máquina activa con su programa y adopta el motor que publica.
    fn wake(&self) -> Result<(), Error> {
        let Some((program, selection)) = self.machine().wake.clone() else {
            return Err(Error::new("app_unavailable"));
        };
        let _turn = self.waking.lock().unwrap_or_else(|p| p.into_inner());
        // Otra acción pudo encenderla mientras esta esperaba su turno.
        if self
            .client()
            .request("status", None, json!({}), Duration::from_secs(3))
            .is_ok()
        {
            return Ok(());
        }
        let client = woken(&program, &selection)?;
        *self.client.write().unwrap_or_else(|p| p.into_inner()) = client;
        self.woke.store(true, Ordering::SeqCst);
        Ok(())
    }
    fn stop_feed(&self) {
        if let Some(fed) = self.feed.lock().unwrap_or_else(|p| p.into_inner()).take() {
            fed.feed.stop();
        }
    }
    pub fn close(&self) {
        self.closed.store(true, Ordering::SeqCst);
        self.stop_feed();
        let streams = std::mem::take(&mut *self.streams.lock().unwrap_or_else(|p| p.into_inner()));
        let deadline = std::time::Instant::now() + Duration::from_secs(3);
        let watchers =
            std::mem::take(&mut *self.watchers.lock().unwrap_or_else(|p| p.into_inner()));
        for (id, (workspace, cancel)) in watchers {
            cancel.store(true, Ordering::SeqCst);
            if std::time::Instant::now() >= deadline {
                break;
            }
            let _ = self.client().request(
                "service invoke",
                workspace,
                json!({"command":"unwatch_task_tree","arguments":{"id":id}}),
                Duration::from_millis(300),
            );
        }
        for (id, workspace) in streams {
            if std::time::Instant::now() >= deadline {
                break;
            }
            let _ = self.client().request(
                "service stream cancel",
                workspace,
                json!({"stream_id":id}),
                Duration::from_millis(300),
            );
        }
    }
    fn workspace(&self) -> Option<String> {
        self.workspace
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .clone()
    }
}
fn manifest() -> &'static Value {
    static M: OnceLock<Value> = OnceLock::new();
    M.get_or_init(terminus_engine_protocol::full_manifest)
}
fn command(name: &str) -> Option<&'static Value> {
    manifest()["commands"]
        .as_array()?
        .iter()
        .find(|c| c["name"] == name)
}
fn answers(client: &Client) -> bool {
    client
        .request("status", None, json!({}), Duration::from_secs(2))
        .is_ok()
}

/// Corre el programa de encendido, que reabre el túnel y reescribe la selección.
fn woken(program: &std::path::Path, selection: &std::path::Path) -> Result<Arc<Client>, Error> {
    // Medido: de VM apagada a motor listo, unos 20 s; EC2 puede tardar minutos.
    let status = crate::util::output_with_timeout(
        crate::util::no_console_window(&mut std::process::Command::new(program)).arg(selection),
        Duration::from_secs(300),
    )?;
    if !status.success() {
        return Err(Error::new("app_unavailable"));
    }
    Ok(Arc::new(Client::select(selection)?))
}

pub(super) fn desktop_command(name: &str) -> bool {
    command(name).is_some_and(|c| c["kind"] == "desktop")
        || matches!(
            name,
            "launcher_state"
                | "launcher_continue"
                | "window_painted"
                | "window_background"
                | "update_install"
                | "update_pending"
                | "window_to_background"
                | "tray_update"
                | "quit_completely"
                | "restart_app"
                | "tray_notify"
                | "machine_list"
                | "account_relay_token"
                | "agents_session_status"
                | "agents_session_connect"
                | "agents_session_sign_out"
                | "danil_sign_in"
                | "danil_sign_out"
                | "agents_session_directory"
                | "agents_session_link"
                | "agents_session_unlink"
                | "agents_session_create_danil_workspace"
                | "agents_session_refresh"
                | "agents_bff_fetch"
                | "harness_org_fetch"
                | "typst_live_complete"
                | "service_filter"
                | "load_history"
                | "handler_action"
                // Máquinas locales (`guests/`): la ventana, no el motor.
                | "wsl_state"
                | "wsl_catalog"
                | "wsl_enable"
                | "wsl_install"
                | "wsl_connect"
                | "wsl_job_pause"
                | "wsl_job_dismiss"
                | "wsl_resume_forget"
                | "wsl_distro_user"
                | "wsl_reboot"
                | "guest_channels"
                | "guest_list"
                | "guest_connect"
                | "guest_job"
                | "guest_children"
                | "guest_remove"
                | "guest_start"
                | "guest_call"
                | "guest_copy_folder"
                | "guest_sync_spaces"
                | "guest_events"
        )
}
pub(super) fn with_desktop(
    local: impl Fn(tauri::ipc::Invoke) -> bool + Send + Sync + 'static,
) -> impl Fn(tauri::ipc::Invoke) -> bool + Send + Sync + 'static {
    move |invoke| {
        if !local_machine_header(invoke.message.headers()) {
            invoke
                .resolver
                .reject(failure(&Error::new("unknown_machine")));
            return true;
        }
        if desktop_command(invoke.message.command()) {
            local(invoke)
        } else {
            handle(invoke);
            true
        }
    }
}

fn local_machine_header(headers: &tauri::http::HeaderMap) -> bool {
    let mut values = headers.get_all("x-terminus-machine").iter();
    match values.next() {
        None => true,
        Some(value) => value.to_str().ok() == Some("local") && values.next().is_none(),
    }
}
pub(super) fn failure(error: &Error) -> Value {
    if error.code == "operation_failed"
        && (error.detail.is_string() || error.detail.get("what").is_some())
    {
        return error.detail.clone();
    }
    // Un motor que no escucha no vuelve solo: `engine_down` no está en los reintentos de `src/lib/invoke.ts`.
    if error.code == "app_unavailable" {
        return json!({"what":{"clave":"shell.service.engine_down"},"detail":"engine_down"});
    }
    if error.code == "engine_missing" {
        return json!({"what":{"clave":"shell.service.engine_missing"},"detail":error.detail});
    }
    if error.code.starts_with("handler_")
        || error.code.starts_with("pending_")
        || error.code.starts_with("peer_")
    {
        return json!({"what":{"clave":error.message_key},"detail":{"code":error.code,"detail":error.detail}});
    }
    let key = match error.code.as_str() {
        "managed_service_unavailable" | "managed_profile_invalid" => {
            super::util::Frase::new("shell.service.managed").0
        }
        "service_busy" | "task_busy" => "shell.service.busy",
        "invalid_token" | "io" => "shell.service.unreachable",
        "version_mismatch" | "service_version" => "shell.service.version",
        "no_host" => "shell.service.no_host",
        "response_too_large" => super::util::Frase::new("shell.service.too_large").0,
        "command" | "unsupported" => "shell.service.command",
        _ => "shell.service.failed",
    };
    let detail = if error.detail.is_null() {
        json!(error.code)
    } else {
        json!({"code": error.code, "message_key": error.message_key, "detail": error.detail})
    };
    json!({"what":{"clave":key},"detail":detail})
}
fn reply(value: Value) -> Result<Value, Value> {
    if let Some(error) = value.get("error") {
        Err(error.clone())
    } else if let Some(value) = value.get("value") {
        Ok(value.clone())
    } else {
        Err(failure(&Error::new("invalid_request")))
    }
}
pub(super) fn invoke(state: &State, command: &str, arguments: Value) -> Result<Value, Value> {
    state
        .client()
        .invoke(command, state.workspace(), arguments)
        .map_err(|e| failure(&e))
        .and_then(reply)
}
type Job = Box<dyn FnOnce() + Send>;
fn ordered(job: Job) -> std::io::Result<()> {
    static Q: OnceLock<std::sync::mpsc::Sender<Job>> = OnceLock::new();
    let sender = Q.get_or_init(|| {
        let (tx, rx) = std::sync::mpsc::channel::<Job>();
        std::thread::spawn(move || {
            for job in rx {
                job();
            }
        });
        tx
    });
    sender
        .send(job)
        .map_err(|_| std::io::Error::other("workspace queue"))
}
struct Slot(Arc<State>);
impl Drop for Slot {
    fn drop(&mut self) {
        self.0.in_flight.fetch_sub(1, Ordering::SeqCst);
    }
}

pub(super) fn handle(invoke: tauri::ipc::Invoke) {
    let name = invoke.message.command().to_owned();
    let Some(spec) = command(&name).filter(|c| c["kind"] == "invoke" || c["kind"] == "stream")
    else {
        invoke.resolver.reject(failure(&Error::new("command")));
        return;
    };
    let tauri::ipc::InvokeBody::Json(mut args) = invoke.message.payload().clone() else {
        invoke
            .resolver
            .reject(failure(&Error::new("invalid_request")));
        return;
    };
    let webview = invoke.message.webview().clone();
    let Some(state) = webview.app_handle().try_state::<Arc<State>>() else {
        invoke
            .resolver
            .reject(failure(&Error::new("app_unavailable")));
        return;
    };
    let state = state.inner().clone();
    if state.closed.load(Ordering::SeqCst) {
        invoke
            .resolver
            .reject(failure(&Error::new("app_unavailable")));
        return;
    }
    if state.in_flight.fetch_add(1, Ordering::SeqCst) >= 256 {
        state.in_flight.fetch_sub(1, Ordering::SeqCst);
        invoke.resolver.reject(failure(&Error::new("service_busy")));
        return;
    }
    let slot = Slot(state.clone());
    let workspace = if name == "list_workspaces" {
        None
    } else if matches!(name.as_str(), "tree_show" | "tree_open_external")
        && args["tree"] == "terminus-chat-visuals"
    {
        // El scope pertenece al sobre RPC1, no a los parámetros congelados del comando.
        let Some(workspace) = invoke
            .message
            .headers()
            .get("x-terminus-workspace")
            .and_then(|value| value.to_str().ok())
            .filter(|value| !value.is_empty())
        else {
            invoke
                .resolver
                .reject(failure(&Error::new("invalid_request")));
            return;
        };
        Some(workspace.to_owned())
    } else if matches!(
        name.as_str(),
        "stop_turn"
            | "stop_shell_command"
            | "write_shell_input"
            | "pending_requests"
            | "respond_permission"
            | "answer_question"
            | "list_storage"
            | "reclaim_storage"
            | "empty_build_cache"
            | "collect_orphans"
            | "workspaces_startup"
            | "set_provider_consent"
    ) {
        // Cerrar con tareas vivas detiene también las de otros workspaces.
        invoke
            .message
            .headers()
            .get("x-terminus-workspace")
            .and_then(|value| value.to_str().ok())
            .filter(|value| !value.is_empty())
            .map(str::to_owned)
            .or_else(|| state.workspace())
    } else if name == "unwatch_task_tree" {
        let watchers = state.watchers.lock().unwrap_or_else(|p| p.into_inner());
        args["id"]
            .as_str()
            .and_then(|id| watchers.get(id))
            .map(|(scope, _)| scope.clone())
            .unwrap_or_else(|| state.workspace())
    } else if name == "cancel_project_clone" {
        args["operation"]
            .as_str()
            .and_then(|id| {
                state
                    .clones
                    .lock()
                    .unwrap_or_else(|p| p.into_inner())
                    .get(id)
                    .cloned()
            })
            .unwrap_or_else(|| state.workspace())
    } else {
        state.workspace()
    };
    let channel = if let Some(key) = spec["channel"].as_str() {
        let id = match args
            .get(key)
            .cloned()
            .and_then(|v| serde_json::from_value::<tauri::ipc::JavaScriptChannelId>(v).ok())
        {
            Some(id) => id,
            None => {
                invoke
                    .resolver
                    .reject(failure(&Error::new("invalid_request")));
                return;
            }
        };
        if let Some(args) = args.as_object_mut() {
            args.remove(key);
        }
        Some((key.to_owned(), id.channel_on::<_, Value>(webview)))
    } else {
        None
    };
    let resolver = Arc::new(Mutex::new(Some(invoke.resolver)));
    let worker = resolver.clone();
    let queued = name == "set_active_workspace";
    // Se adopta al clic: adoptado al contestar el motor, lo pedido entretanto
    // sale con el workspace anterior y el motor lo devuelve como activo.
    let adopted = if queued {
        args["id"].as_str().map(str::to_owned)
    } else {
        None
    };
    if let Some(id) = &adopted {
        *state.workspace.lock().unwrap_or_else(|p| p.into_inner()) = Some(id.clone());
    }
    let job = move || {
        let _slot = slot;
        if let Some((key, channel)) = channel {
            stream(state, &name, args, workspace, key, channel, worker);
            return;
        }
        let mut sent = state
            .client()
            .invoke(&name, workspace.clone(), args.clone());
        // `app_unavailable` es no haber conectado: reintentar no duplica la acción.
        if matches!(&sent, Err(e) if e.code == "app_unavailable")
            && WAKES.contains(&name.as_str())
            && state.wake().is_ok()
        {
            sent = state
                .client()
                .invoke(&name, workspace.clone(), args.clone());
        }
        let mut result = sent.map_err(|e| failure(&e)).and_then(reply);
        if name == "check_environment" {
            if let Ok(value) = &mut result {
                value["engineBuild"] = json!(super::startup::engine_build(state.client().status()));
            }
        }
        if let Ok(value) = &result {
            if name == "unwatch_task_tree" {
                if let Some((_, cancel)) = args["id"].as_str().and_then(|id| {
                    state
                        .watchers
                        .lock()
                        .unwrap_or_else(|p| p.into_inner())
                        .remove(id)
                }) {
                    cancel.store(true, Ordering::SeqCst);
                }
            }

            let target = match name.as_str() {
                // La ventana abre con `list_workspaces` sin esperar al arranque,
                // que migra dentro y tarda: la primera respuesta fija el ámbito.
                "workspaces_startup" | "list_workspaces" if state.workspace().is_none() => {
                    value["active"].as_str()
                }
                _ => None,
            };
            if let Some(target) = target {
                *state.workspace.lock().unwrap_or_else(|p| p.into_inner()) =
                    Some(target.to_owned());
            }
            if name == "remove_workspace" && workspace.as_deref() == args["id"].as_str() {
                *state.workspace.lock().unwrap_or_else(|p| p.into_inner()) = None;
            }
        }
        if let (Err(_), Some(id)) = (&result, &adopted) {
            let mut current = state.workspace.lock().unwrap_or_else(|p| p.into_inner());
            if current.as_deref() == Some(id.as_str()) {
                *current = workspace.clone();
            }
        }
        resolve(&worker, result);
    };
    let spawned = if queued {
        ordered(Box::new(job))
    } else {
        std::thread::Builder::new().spawn(job).map(|_| ())
    };
    if spawned.is_err() {
        resolve(&resolver, Err(failure(&Error::new("service_busy"))));
    }
}
fn machine_off() -> Value {
    json!({"what":{"clave":"shell.service.machine_off"},"detail":"machine_off"})
}
fn resolve(
    resolver: &Arc<Mutex<Option<tauri::ipc::InvokeResolver>>>,
    result: Result<Value, Value>,
) {
    if let Some(resolver) = resolver.lock().unwrap_or_else(|p| p.into_inner()).take() {
        match result {
            Ok(value) => resolver.resolve(value),
            Err(error) => resolver.reject(error),
        }
    }
}
/// Una orden con canal, con el workspace del sobre.
fn stream(
    state: Arc<State>,
    name: &str,
    arguments: Value,
    workspace: Option<String>,
    key: String,
    channel: tauri::ipc::Channel<Value>,
    resolver: Arc<Mutex<Option<tauri::ipc::InvokeResolver>>>,
) {
    let client = state.client();
    let clone_operation = if name == "clone_project" {
        arguments["operation"].as_str().map(str::to_owned)
    } else {
        None
    };
    if let Some(operation) = &clone_operation {
        state
            .clones
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .insert(operation.clone(), workspace.clone());
    }
    let id = uuid::Uuid::new_v4().to_string();
    let start = client.request(
        "service stream start",
        workspace.clone(),
        json!({"command":name,"arguments":arguments,"stream_id":id,"channel":key}),
        Duration::from_secs(30),
    );
    if !start.as_ref().is_ok_and(|value| value["stream_id"] == id) {
        if let Some(operation) = &clone_operation {
            state
                .clones
                .lock()
                .unwrap_or_else(|p| p.into_inner())
                .remove(operation);
        }
    }
    match start {
        Ok(value) if value["stream_id"] == id => {}
        Ok(_) => {
            resolve(&resolver, Err(failure(&Error::new("invalid_request"))));
            return;
        }
        Err(e) => {
            resolve(&resolver, Err(failure(&e)));
            return;
        }
    }
    state
        .streams
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .push((id.clone(), workspace.clone()));
    let cancel = Arc::new(AtomicBool::new(false));
    let mut cursor = None;
    let result = (|| -> Result<(), Value> {
        while !state.closed.load(Ordering::SeqCst) && !cancel.load(Ordering::SeqCst) {
            let value = client
                .request(
                    "service stream read",
                    workspace.clone(),
                    json!({"stream_id":id,"cursor":cursor}),
                    Duration::from_secs(10),
                )
                .map_err(|e| failure(&e))?;
            let page: StreamPage = serde_json::from_value(value)
                .map_err(|_| failure(&Error::new("invalid_request")))?;
            if page.stream_id != id || page.gap || cursor.is_some_and(|c| page.cursor < c) {
                return Err(failure(&Error::new("io")));
            }
            let mut latest = cursor.unwrap_or(0);
            for event in page.events {
                if event.seq <= latest || event.seq > page.cursor {
                    return Err(failure(&Error::new("invalid_request")));
                }
                channel
                    .send(event.payload)
                    .map_err(|_| failure(&Error::new("io")))?;
                latest = event.seq;
            }
            cursor = Some(page.cursor);
            if let Some(completion) = page.completion {
                if name == "watch_task_tree" {
                    if let Some(watcher) = completion["value"].as_str() {
                        state
                            .watchers
                            .lock()
                            .unwrap_or_else(|p| p.into_inner())
                            .entry(watcher.to_owned())
                            .or_insert_with(|| (workspace.clone(), cancel.clone()));
                    }
                }
                resolve(&resolver, reply(completion));
            }
            if page.done {
                return Ok(());
            }
            std::thread::sleep(Duration::from_millis(100));
        }
        if cancel.load(Ordering::SeqCst) {
            Ok(())
        } else {
            Err(failure(&Error::new("app_unavailable")))
        }
    })();
    if let Err(error) = result {
        state.stream_gap.store(true, Ordering::SeqCst);
        resolve(&resolver, Err(error.clone()));
        log::warn!("[transport] stream={name} code={}", error["detail"]);
    }
    let _ = client.request(
        "service stream cancel",
        workspace,
        json!({"stream_id":id}),
        Duration::from_secs(2),
    );
    if let Some(operation) = &clone_operation {
        state
            .clones
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .remove(operation);
    }
    state
        .watchers
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .retain(|_, (_, value)| !Arc::ptr_eq(value, &cancel));
    state
        .streams
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .retain(|(key, _)| key != &id);
}

#[tauri::command(async)]
pub(super) fn service_poll(
    app: tauri::AppHandle,
    cursor: Option<u64>,
    workspace: Option<String>,
    replay: bool,
    runtime: Option<String>,
    setup: Option<bool>,
) -> Result<Value, Value> {
    let state = app
        .try_state::<Arc<State>>()
        .ok_or_else(|| failure(&Error::new("app_unavailable")))?;
    if state.woke.swap(false, Ordering::SeqCst) {
        if let Some(window) = app.get_window("main") {
            let _ = window.set_title(&super::title(&app));
        }
        return Ok(
            json!({"cursor":null,"gap":false,"replay":true,"runtime":state.client().runtime(),"reset":true}),
        );
    }
    if runtime
        .as_ref()
        .is_some_and(|id| id != state.client().runtime())
    {
        return Err(failure(&Error::new("version_mismatch")));
    }
    let client = state.client();
    // Configuración sondea a la vez que la app: con su propio cursor, por el camino de siempre.
    if client.push_stream() && setup != Some(true) {
        return pushed(&app, &state, client, cursor, replay, runtime);
    }
    let polled = client.request(
        "service events",
        workspace.clone(),
        json!({"cursor":cursor,"workspace":workspace,"replay":replay,"desktop":true,"desktop_pid":std::process::id(),"tail":setup==Some(true)&&cursor.is_none()}),
        Duration::from_secs(3),
    );
    let page = match polled {
        // Otra ventana pudo relanzarlo ya: su selección nueva invalida este cliente antes de conectar.
        Err(error)
            if error.code == "app_unavailable" || state.client().check_selection().is_err() =>
        {
            return restarted(&app, &state, error);
        }
        other => other.map_err(|e| failure(&e))?,
    };
    if let Some(events) = page["events"].as_array() {
        for event in events {
            let Some(name) = event["name"].as_str() else {
                return Err(failure(&Error::new("invalid_request")));
            };
            if !known_event(name) {
                return Err(failure(&Error::new("invalid_request")));
            }
            // El alta (Setup) conecta cuentas e integraciones: necesita `account`, `install`, `mcp`…
            // App no está montada mientras sondea, así que nada llega dos veces.
            let _ = app.emit(name, &event["payload"]);
        }
    }
    // Un stream de comando cortado no pierde eventos del diario: va aparte de `gap`.
    Ok(
        json!({"cursor":page["cursor"],"gap":page["gap"] == true,"streams":state.stream_gap.swap(false, Ordering::SeqCst),"replay":page["replay"],"runtime":state.client().runtime(),"reset":false}),
    )
}
fn known_event(name: &str) -> bool {
    manifest()["events"]
        .as_array()
        .is_some_and(|names| names.iter().any(|v| v == name))
}
fn restarted(app: &tauri::AppHandle, state: &State, error: Error) -> Result<Value, Value> {
    if state.remote() {
        return Err(machine_off());
    }
    // Sin motor que relanzar (un antivirus puede apartarlo), el aviso dice eso y no «no responde».
    if let Err(restart) = state.restart() {
        let shown = if matches!(
            restart.code.as_str(),
            "engine_missing"
                | "managed_service_unavailable"
                | "managed_profile_invalid"
                | "version_mismatch"
                | "invalid_token"
        ) {
            restart
        } else {
            error
        };
        return Err(failure(&shown));
    }
    if let Some(window) = app.get_window("main") {
        let _ = window.set_title(&super::title(app));
    }
    Ok(
        json!({"cursor":null,"gap":false,"replay":true,"runtime":state.client().runtime(),"reset":true}),
    )
}
/// Lo empujado desde la última llamada, en lotes que la ventana reparte a sus
/// oyentes. La suscripción sigue al cursor que manda la ventana: otro, una recarga.
fn pushed(
    app: &tauri::AppHandle,
    state: &State,
    client: Arc<Client>,
    cursor: Option<u64>,
    replay: bool,
    runtime: Option<String>,
) -> Result<Value, Value> {
    let feed = {
        let mut fed = state.feed.lock().unwrap_or_else(|p| p.into_inner());
        let current = fed
            .as_ref()
            .filter(|fed| Arc::ptr_eq(&fed.client, &client) && fed.delivered == cursor)
            .map(|fed| fed.feed.clone());
        match current {
            Some(feed) => feed,
            None => {
                if let Some(old) = fed.take() {
                    old.feed.stop();
                }
                let sessions = state
                    .sessions
                    .lock()
                    .unwrap_or_else(|p| p.into_inner())
                    .clone();
                let feed = Feed::start(
                    client.clone(),
                    Start {
                        cursor,
                        replay,
                        runtime,
                        sessions,
                    },
                );
                *fed = Some(Fed {
                    client: client.clone(),
                    feed: feed.clone(),
                    delivered: cursor,
                });
                feed
            }
        }
    };
    let page = feed.next(PUSH_WAIT);
    if let Some(error) = page.failure {
        if error.code == "app_unavailable" || client.check_selection().is_err() {
            state.stop_feed();
            return restarted(app, state, error);
        }
        return Err(failure(&error));
    }
    if let Some(fed) = state
        .feed
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .as_mut()
        .filter(|fed| Arc::ptr_eq(&fed.client, &client))
    {
        fed.delivered = page.cursor;
    }
    let mut batches = page.batches;
    for batch in &mut batches {
        if let Some(events) = batch["events"].as_array_mut() {
            events.retain(|event| event["name"].as_str().is_some_and(known_event));
        }
    }
    Ok(
        json!({"cursor":page.cursor,"gap":page.gap,"streams":state.stream_gap.swap(false, Ordering::SeqCst),"replay":false,"runtime":client.runtime(),"reset":false,"push":true,"batches":batches}),
    )
}
/// Las tareas cuyo flujo token a token quiere la ventana: las visibles y las que corren.
#[tauri::command]
pub(super) fn service_filter(
    app: tauri::AppHandle,
    sessions: Option<Vec<String>>,
) -> Result<(), Value> {
    let state = app
        .try_state::<Arc<State>>()
        .ok_or_else(|| failure(&Error::new("app_unavailable")))?;
    *state.sessions.lock().unwrap_or_else(|p| p.into_inner()) = sessions.clone();
    if let Some(fed) = state
        .feed
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .as_ref()
    {
        fed.feed.filter(sessions);
    }
    Ok(())
}
/// Una tarea con sus últimos turnos (`service history`) y su lugar en la
/// transcripción entera. Un motor sin el stream empujado la manda entera.
#[tauri::command(async)]
pub(super) fn load_history(
    app: tauri::AppHandle,
    project: String,
    id: String,
    before: Option<u64>,
) -> Result<Value, Value> {
    let state = app
        .try_state::<Arc<State>>()
        .ok_or_else(|| failure(&Error::new("app_unavailable")))?;
    let client = state.client();
    let workspace = state.workspace();
    read_history(&client, workspace, &project, &id, before).map_err(|e| failure(&e))
}
fn read_history(
    client: &Client,
    workspace: Option<String>,
    project: &str,
    id: &str,
    before: Option<u64>,
) -> Result<Value, Error> {
    if client.status()["service_features"]
        .as_array()
        .is_some_and(|features| features.iter().any(|f| f == "bounded_history_v1"))
    {
        let reply = client.invoke(
            "load_session",
            workspace,
            json!({"project":project,"id":id,"history_request":{"version":1,"before":before}}),
        )?;
        if let Some(value) = reply.get("value") {
            return Ok(value.clone());
        }
        let mut error = Error::new("operation_failed");
        error.detail = reply.get("error").cloned().unwrap_or_default();
        return Err(error);
    }
    if !client.push_stream() {
        let reply = client.invoke(
            "load_session",
            workspace,
            json!({"project":project,"id":id}),
        )?;
        let Some(mut session) = reply.get("value").cloned() else {
            let mut error = Error::new("operation_failed");
            error.detail = reply.get("error").cloned().unwrap_or_default();
            return Err(error);
        };
        let total = session["turns"].as_array().map_or(0, Vec::len);
        session["history"] =
            json!({"total":total,"start":0,"end":total,"limit":total,"has_more":false});
        return Ok(session);
    }
    client.request(
        "service history",
        workspace,
        json!({"project":project,"id":id,"turns":HISTORY_TURNS,"before":before}),
        Duration::from_secs(30),
    )
}
#[tauri::command]
pub(super) fn service_prepare_update() -> Result<(), Value> {
    // El cliente y el host se actualizan por separado; Windows ya no reemplaza el ejecutable del host.
    Ok(())
}
#[tauri::command]
pub(super) fn service_cancel_update() -> Result<(), Value> {
    Ok(())
}

/// El token de cliente de vida corta de la cuenta de Danil, con el que la ventana
/// lista las otras computadoras de la persona y les abre una sesión del relay. La
/// credencial de la máquina no sale del motor; uno sin `danil_client_token` lo rechaza.
/// `account` nombra la sesión de la cuenta del workspace; sin él, la principal.
#[tauri::command(async)]
pub(super) fn account_relay_token(
    app: tauri::AppHandle,
    account: Option<String>,
) -> Result<Value, Value> {
    let state = app
        .try_state::<Arc<State>>()
        .ok_or_else(|| failure(&Error::new("app_unavailable")))?;
    let args = match account.filter(|a| !a.trim().is_empty()) {
        Some(account) => json!({ "account": account }),
        None => json!({}),
    };
    invoke(&state, "danil_client_token", args)
}

/// Una orden del motor pedida desde el Rust de la ventana (`agents_session.rs`).
pub(super) fn engine_call(
    app: &tauri::AppHandle,
    command: &str,
    args: Value,
) -> Result<Value, Value> {
    let state = app
        .try_state::<Arc<State>>()
        .ok_or_else(|| failure(&Error::new("app_unavailable")))?;
    invoke(&state, command, args)
}

/// La máquina de esta ventana. Las otras de la cuenta las suma la ventana por el
/// relay (`features/machines/router.ts`).
#[tauri::command(async)]
pub(super) fn machine_list(app: tauri::AppHandle) -> Result<Value, Value> {
    let state = app
        .try_state::<Arc<State>>()
        .ok_or_else(|| failure(&Error::new("app_unavailable")))?;
    let client = state.client();
    let on = answers(&client);
    let features = client.status()["service_features"].clone();
    let features = if features.is_array() {
        features
    } else {
        json!([])
    };
    Ok(
        json!([{"id": "local", "local": !state.remote(), "active": true, "on": on, "hosts": true, "features": features}]),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn un_destino_no_local_no_pasa_al_ipc_nativo() {
        use tauri::http::{HeaderMap, HeaderValue};
        let mut headers = HeaderMap::new();
        assert!(local_machine_header(&headers));
        headers.insert("x-terminus-machine", HeaderValue::from_static("local"));
        assert!(local_machine_header(&headers));
        for id in ["lima:vm", "wsl:Ubuntu", "cmp_remote", ""] {
            headers.insert("x-terminus-machine", HeaderValue::from_str(id).unwrap());
            assert!(!local_machine_header(&headers), "{id}");
        }
        headers.insert("x-terminus-machine", HeaderValue::from_static("local"));
        headers.append("x-terminus-machine", HeaderValue::from_static("lima:vm"));
        assert!(!local_machine_header(&headers));
    }

    /// Todo comando que la ventana registra en `generate_handler!` tiene que
    /// pasar `desktop_command`; si no, `with_desktop` lo manda al motor y la
    /// llamada falla. Pasó con `harness_org_fetch`, `typst_live_complete` y
    /// `wsl_detect`.
    #[test]
    fn todo_comando_registrado_se_queda_en_la_ventana() {
        let source = include_str!("mod.rs");
        let start = source.find("generate_handler![").expect("generate_handler");
        let rest = &source[start + "generate_handler![".len()..];
        let body = &rest[..rest.find(']').expect("cierre")];
        let names: Vec<&str> = body
            .split(',')
            .map(|item| item.trim().rsplit("::").next().unwrap_or("").trim())
            .filter(|name| !name.is_empty())
            .collect();
        assert!(names.len() > 40, "se leyeron {} comandos", names.len());
        let missing: Vec<&str> = names
            .into_iter()
            .filter(|name| !desktop_command(name))
            .collect();
        assert!(
            missing.is_empty(),
            "comandos registrados que la ventana no atiende: {missing:?}"
        );
    }

    #[test]
    fn conserva_el_diagnostico_de_un_rechazo_del_motor() {
        let error = Error {
            detail: json!({"provider": "codex", "reason": "permissions_ceiling"}),
            ..Error::new("handler_limit_unenforceable")
        };
        let shown = failure(&error);
        assert_eq!(shown["detail"]["code"], error.code);
        assert_eq!(shown["detail"]["detail"], error.detail);
    }

    #[test]
    fn una_respuesta_demasiado_grande_lo_dice() {
        let f = failure(&Error::new("response_too_large"));
        assert_eq!(f["what"]["clave"], "shell.service.too_large");
        assert_eq!(f["detail"], "response_too_large");
    }
}
