//! Ventana habitual conectada exclusivamente al motor privado seleccionado.
//! Sin argumentos usa el motor empaquetado, que se resuelve con la ventana ya abierta;
//! una raíz de 0.2.74 pasa antes por el traspaso.
mod agents_session;
mod appearance;
mod background_service;
mod desktop;
mod engine;
mod engine_profile;
pub mod env;
mod guests;
mod handler_policy;
mod instance;
mod launcher;
mod legacy;
#[cfg(target_os = "linux")]
mod linux_engine;
mod local_image;
#[cfg(target_os = "macos")]
mod master_handoff;
mod page_preview;
mod placement;
mod proxy;
#[cfg(target_os = "macos")]
mod relocate;
#[cfg(target_os = "linux")]
mod resources;
#[cfg(any(target_os = "macos", test))]
mod service_plan;
mod sites;
mod startup;
mod tray;
mod typst_live;
mod update;
pub mod util;
use std::{path::PathBuf, sync::Arc};
use tauri::{Emitter, Manager};
use terminus_engine_client::Client;
use terminus_engine_protocol::{Error, Result};

pub use background_service::dispatch as background_dispatch;

pub fn launch() -> Result<()> {
    let result = open();
    if let Err(error) = &result {
        startup::show(error);
    }
    result
}

fn open() -> Result<()> {
    let mut args: Vec<_> = std::env::args_os().collect();
    if args.len() == 2 && tray::is_notice(&args[1]) {
        if let Some(key) = tray::notice_key(&args[1]) {
            if instance::open_notice(&engine::paths()?.window, &key) {
                return Ok(());
            }
        }
        // Sin ventana abierta o sin clave legible, el enlace arranca Terminus como siempre.
        args.truncate(1);
    }
    let selection = match args.as_slice() {
        // La ventana abre ya; el motor se busca o se lanza detrás (`launcher::connect`).
        [_] => {
            #[cfg(target_os = "macos")]
            if relocate::offer() {
                return Ok(());
            }
            let found = engine::paths()?;
            engine::prepare(&found)?;
            let launcher = match launcher::reason(&found) {
                Some(reason) => launcher::Launcher::handoff(found, reason),
                None => launcher::Launcher::connecting(found),
            };
            start(None, true, launcher);
            return Ok(());
        }
        [_, flag, path] if flag == "--external-host" => PathBuf::from(path),
        [_, flag, path, wake, program] if flag == "--external-host" && wake == "--wake" => {
            let _ = proxy::WAKE.set((PathBuf::from(program), PathBuf::from(path)));
            PathBuf::from(path)
        }
        _ => return Err(Error::new("invalid_request")),
    };
    start(
        Some(Arc::new(connect(&selection)?)),
        false,
        launcher::Launcher::ready(None),
    );
    Ok(())
}

/// El cliente de una selección; la carpeta de la ventana no puede estar dentro de la del motor ni al revés.
fn connect(selection: &std::path::Path) -> Result<Client> {
    update::sweep();
    let client = Client::select(selection)?;
    let directory = &client.selection().window_data;
    terminus_engine_client::private_directory(directory)?;
    let window = std::fs::canonicalize(directory)?;
    let data = std::fs::canonicalize(&client.selection().data_directory)?;
    if window.starts_with(&data) || data.starts_with(&window) {
        return Err(Error::new("invalid_request"));
    }
    Ok(client)
}

/// `--stop-engine`, para el instalador: 0 paró, 3 trabaja (no se toca), 1 no contestó.
pub fn stop_engine() -> i32 {
    match engine::stop() {
        engine::Stopped::Done => 0,
        engine::Stopped::Busy => 3,
        engine::Stopped::Unanswered => 1,
    }
}

/// Lo de las máquinas locales (`guests/`) toca disco, red y `wsl.exe`: corre
/// fuera del hilo de la ventana.
async fn blocking<T: Send + 'static>(
    work: impl FnOnce() -> std::result::Result<T, serde_json::Value> + Send + 'static,
) -> std::result::Result<T, serde_json::Value> {
    tauri::async_runtime::spawn_blocking(work)
        .await
        .unwrap_or_else(|e| Err(serde_json::json!({ "code": "io", "detail": e.to_string() })))
}

#[tauri::command]
async fn wsl_state(
    app: tauri::AppHandle,
) -> std::result::Result<guests::wsl_setup::LinuxState, serde_json::Value> {
    blocking(move || Ok(guests::wsl_setup::state(&app))).await
}

#[tauri::command]
async fn wsl_catalog() -> std::result::Result<Vec<guests::wsl_setup::CatalogItem>, serde_json::Value>
{
    blocking(guests::wsl_setup::catalog).await
}

/// Los tres arrancan un trabajo y vuelven enseguida; si ya hay uno, devuelven
/// ese para que la pantalla se enganche en vez de lanzar otro.
#[tauri::command]
fn wsl_enable(app: tauri::AppHandle) -> guests::child::Job {
    guests::wsl_setup::start_enable(&app).unwrap_or_else(|running| running)
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
fn wsl_install(
    app: tauri::AppHandle,
    name: String,
    label: String,
    url: String,
    sha256: String,
    user: String,
    password: String,
    workspace: Option<String>,
    workspace_name: Option<String>,
) -> guests::child::Job {
    let workspace = workspace.map(|id| {
        let n = workspace_name.unwrap_or_else(|| id.clone());
        (id, n)
    });
    let request = guests::wsl_setup::InstallRequest {
        name,
        label,
        url,
        sha256,
        user,
        password,
        workspace,
    };
    guests::wsl_setup::start_install(&app, request).unwrap_or_else(|running| running)
}

#[tauri::command]
fn wsl_connect(
    app: tauri::AppHandle,
    distro: String,
    user: Option<String>,
    password: Option<String>,
    workspace: Option<String>,
    workspace_name: Option<String>,
) -> guests::child::Job {
    let workspace = workspace.map(|id| {
        let n = workspace_name.unwrap_or_else(|| id.clone());
        (id, n)
    });
    guests::child::start_connect(&app, &distro, &distro, user, password, workspace)
        .unwrap_or_else(|running| running)
}

#[tauri::command]
fn wsl_job_pause(paused: bool) {
    guests::child::pause(paused);
}

#[tauri::command]
fn wsl_job_dismiss(app: tauri::AppHandle) {
    guests::child::dismiss(&app);
}

#[tauri::command]
fn wsl_resume_forget(app: tauri::AppHandle) {
    guests::child::forget_resume(&app);
}

#[tauri::command]
async fn wsl_distro_user(
    distro: String,
) -> std::result::Result<guests::wsl_setup::DistroUser, serde_json::Value> {
    blocking(move || guests::wsl_setup::distro_user(&distro)).await
}

#[tauri::command]
fn wsl_reboot() -> std::result::Result<(), serde_json::Value> {
    guests::wsl_setup::reboot()
}

/// Los canales de máquinas locales de este equipo: `["wsl"]` en Windows.
#[tauri::command]
fn guest_channels() -> Vec<guests::ChannelKind> {
    guests::channels()
}

/// Los huéspedes de un canal, tengan o no motor de Danil.
#[tauri::command]
async fn guest_list(
    channel: guests::ChannelKind,
) -> std::result::Result<Vec<guests::Guest>, serde_json::Value> {
    blocking(move || guests::channel(channel).list()).await
}

#[tauri::command]
async fn guest_children(
    app: tauri::AppHandle,
    fresh: Option<bool>,
) -> std::result::Result<Vec<guests::child::ChildInfo>, serde_json::Value> {
    blocking(move || Ok(guests::child::children(&app, fresh.unwrap_or(false)))).await
}

#[tauri::command]
async fn guest_remove(
    app: tauri::AppHandle,
    machine: String,
) -> std::result::Result<(), serde_json::Value> {
    blocking(move || {
        let entry = guests::child::lookup(&app, &machine)?;
        guests::child::remove(&app, &entry.distro)
    })
    .await
}

#[tauri::command]
async fn guest_start(
    app: tauri::AppHandle,
    machine: String,
) -> std::result::Result<bool, serde_json::Value> {
    blocking(move || {
        let entry = guests::child::lookup(&app, &machine)?;
        guests::channel(entry.channel()).start(&entry.distro)?;
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(60);
        while std::time::Instant::now() < deadline {
            if guests::child::status(&entry, true).online {
                return Ok(true);
            }
            std::thread::sleep(std::time::Duration::from_secs(1));
        }
        Ok(false)
    })
    .await
}

#[tauri::command]
async fn guest_call(
    app: tauri::AppHandle,
    machine: String,
    command: String,
    workspace: Option<String>,
    folder: Option<String>,
    args: Option<serde_json::Value>,
    timeout_ms: Option<u64>,
) -> std::result::Result<serde_json::Value, serde_json::Value> {
    blocking(move || {
        let entry = guests::child::lookup(&app, &machine)?;
        let timeout =
            std::time::Duration::from_millis(timeout_ms.unwrap_or(120_000).clamp(1_000, 1_800_000));
        if command == "materialize_workspace" {
            // La máquina hija no tiene cuenta: el workspace se crea local con el mismo id.
            let id = args
                .as_ref()
                .and_then(|a| a["id"].as_str().map(String::from))
                .or(workspace.clone())
                .unwrap_or_default();
            guests::child::ensure_workspace(&entry.distro, &entry.home, &id, &id)?;
            return Ok(serde_json::Value::Null);
        }
        guests::child::invoke(
            &entry.distro,
            &entry.home,
            &command,
            args.unwrap_or_else(|| serde_json::json!({})),
            workspace.as_deref(),
            folder.as_deref(),
            timeout,
        )
    })
    .await
}

/// Los espacios de esta PC, con el mismo id, en la distribución.
#[tauri::command]
async fn guest_sync_spaces(
    app: tauri::AppHandle,
    machine: String,
    workspace: String,
    spaces: Vec<serde_json::Value>,
) -> std::result::Result<(), serde_json::Value> {
    blocking(move || {
        let entry = guests::child::lookup(&app, &machine)?;
        guests::child::sync_spaces(&entry, &workspace, &spaces)
    })
    .await
}

/// Copia una carpeta de esta PC a la distribución y la registra con el mismo id.
#[tauri::command]
async fn guest_copy_folder(
    app: tauri::AppHandle,
    machine: String,
    project: String,
    name: String,
    path: String,
    workspace: Option<String>,
) -> std::result::Result<String, serde_json::Value> {
    blocking(move || {
        let entry = guests::child::lookup(&app, &machine)?;
        guests::child::copy_folder(&entry, &project, &name, &path, workspace.as_deref())
    })
    .await
}

#[tauri::command]
async fn guest_events(
    app: tauri::AppHandle,
    machine: String,
    cursor: Option<u64>,
) -> std::result::Result<serde_json::Value, serde_json::Value> {
    blocking(move || {
        let entry = guests::child::lookup(&app, &machine)?;
        guests::child::events(&entry.distro, &entry.home, cursor)
    })
    .await
}

pub fn run(client: Arc<Client>) {
    start(Some(client), false, launcher::Launcher::ready(None));
}

fn title(app: &tauri::AppHandle) -> String {
    app.config()
        .app
        .windows
        .first()
        .map_or("Danil", |w| w.title.as_str())
        .to_owned()
}

/// Sin cliente, la ventana abre en el traspaso y el lanzador registra el estado al conectar.
fn start(client: Option<Arc<Client>>, autostart: bool, launcher: launcher::Launcher) {
    let _ = desktop::STARTED.set(std::time::Instant::now());
    let state = client.map(|client| Arc::new(proxy::State::new(client, autostart)));
    let context = tauri::generate_context!();
    let Some(window_data) = state
        .as_ref()
        .map(|state| state.client().selection().window_data.clone())
        .or_else(|| launcher.window())
    else {
        return;
    };
    let listener = match instance::claim(&window_data) {
        instance::Claim::Shown => return,
        instance::Claim::First(listener) => Some(listener),
        instance::Claim::Alone => None,
    };
    let launcher = Arc::new(launcher);
    let starting = launcher.clone();
    let placed = window_data.clone();
    let placed_on_exit = window_data.clone();
    appearance::remember(&window_data);
    // Con TRACE y 40 KB, rustls y el updater borraban los avisos de `[transport]` en un minuto.
    let log = tauri_plugin_log::Builder::default()
        .level(log::LevelFilter::Info)
        .max_file_size(2_000_000)
        .targets([tauri_plugin_log::Target::new(
            tauri_plugin_log::TargetKind::Folder {
                path: window_data.clone(),
                file_name: Some("window".into()),
            },
        )])
        .build();
    tauri::Builder::default()
        .manage(launcher)
        // Tauri guarda un solo manejador: colocación y cierre van juntos.
        .on_window_event(move |window, event| {
            placement::track(window, event, &placed);
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                desktop::on_close_requested(window, api);
            }
        })
        .setup(move |app| {
            if let Some(state) = state {
                app.manage(state);
            }
            #[cfg(target_os = "macos")]
            desktop::configure_close_menu(app)?;
            let mut config = app.config().app.windows[0].clone();
            config.url = tauri::WebviewUrl::App("index.html".into());
            if app.try_state::<Arc<proxy::State>>().is_some() {
                config.title = title(app.handle());
            }
            let saved = placement::read(&window_data);
            if saved.is_some() {
                config.visible = false;
            }
            let handle = app.handle().clone();
            let mut builder = tauri::WebviewWindowBuilder::from_config(app.handle(), &config)?;
            // Del color del tema desde el primer cuadro: sin esto la ventana abre en blanco y salta.
            if let Some(color) = appearance::background(&window_data) {
                builder = builder.background_color(color);
            }
            let window = builder
                // Sin incógnito: `localStorage`, con el tema, debe durar entre arranques.
                .data_directory(window_data.join("webview"))
                .on_navigation(move |url| {
                    if url.scheme() == "tauri"
                        || url.host_str() == Some("tauri.localhost")
                        || url.as_str() == "about:srcdoc"
                        // El iframe aislado nace vacío antes de recibir su documento.
                        || url.as_str() == "about:blank"
                        // El marco de la vista previa de un `.html`: en macOS y Linux esto también filtra marcos.
                        || url.scheme() == page_preview::SCHEME
                        || url.host_str() == Some("terminus-page.localhost")
                    {
                        return true;
                    }
                    let _ = handle.emit("sitio-pedido", url.to_string());
                    false
                })
                .build()?;
            if let Some(saved) = saved {
                placement::restore(&window, saved);
            }
            #[cfg(windows)]
            tray::register_notice_scheme();
            if let Err(error) = tray::initialize(app.handle()) {
                log::warn!("[tray] not initialized: {error}");
            }
            launcher::start(app.handle().clone(), starting.clone());
            if let Some(listener) = listener {
                let handle = app.handle().clone();
                instance::serve(listener, move |key| {
                    tray::show_window(&handle);
                    if let Some(key) = key {
                        let _ = handle.emit("notice-clicked", key);
                    }
                });
            }
            Ok(())
        })
        .register_asynchronous_uri_scheme_protocol(
            local_image::SCHEME,
            |_ctx, request, responder| local_image::atender(request, responder),
        )
        .register_asynchronous_uri_scheme_protocol(
            page_preview::SCHEME,
            |ctx, request, responder| {
                page_preview::atender(ctx.app_handle().clone(), request, responder)
            },
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(log)
        .invoke_handler(proxy::with_desktop(tauri::generate_handler![
            desktop::request_close,
            tray::window_to_background,
            tray::tray_update,
            tray::quit_completely,
            tray::restart_app,
            tray::tray_notify,
            desktop::window_ready,
            desktop::window_vitals,
            desktop::window_painted,
            appearance::window_background,
            launcher::launcher_state,
            launcher::launcher_continue,
            proxy::service_poll,
            proxy::machine_list,
            proxy::account_relay_token,
            agents_session::agents_session_status,
            agents_session::agents_session_connect,
            agents_session::agents_session_sign_out,
            agents_session::danil_sign_in,
            agents_session::danil_sign_out,
            agents_session::agents_session_directory,
            agents_session::agents_session_link,
            agents_session::agents_session_unlink,
            agents_session::agents_session_create_danil_workspace,
            agents_session::agents_session_refresh,
            agents_session::agents_bff_fetch,
            agents_session::harness_org_fetch,
            proxy::service_filter,
            proxy::load_history,
            handler_policy::handler_action,
            proxy::service_prepare_update,
            proxy::service_cancel_update,
            sites::site_sweep,
            sites::site_open,
            sites::site_place,
            sites::site_hide,
            sites::site_close,
            sites::site_go,
            sites::site_navigate,
            sites::site_reload,
            sites::site_open_external,
            sites::site_open_local,
            sites::site_zoom,
            typst_live::typst_live_open,
            typst_live::typst_live_change,
            typst_live::typst_live_close_doc,
            typst_live::typst_live_reveal,
            typst_live::typst_live_complete,
            typst_live::typst_live_stop,
            update::update_install,
            update::update_pending,
            wsl_state,
            wsl_catalog,
            wsl_enable,
            wsl_install,
            wsl_connect,
            wsl_job_pause,
            wsl_job_dismiss,
            wsl_resume_forget,
            wsl_distro_user,
            wsl_reboot,
            guest_channels,
            guest_list,
            guest_children,
            guest_remove,
            guest_start,
            guest_call,
            guest_copy_folder,
            guest_sync_spaces,
            guest_events
        ]))
        .build(context)
        .expect("tauri extracted client")
        .run(move |app, event| {
            if let tauri::RunEvent::ExitRequested {
                code: None,
                ref api,
                ..
            } = event
            {
                api.prevent_exit();
                desktop::request_quit(app);
            }
            #[cfg(target_os = "macos")]
            if matches!(event, tauri::RunEvent::Reopen { .. }) {
                tray::show_window(app);
            }
            if matches!(event, tauri::RunEvent::Exit) {
                instance::exiting();
                placement::write(&placed_on_exit);
                if let Some(state) = app.try_state::<Arc<proxy::State>>() {
                    state.close();
                }
            }
        });
}
