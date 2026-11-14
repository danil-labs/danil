//! Sin `--external-host`, la ventana usa el motor que viaja con ella: reutiliza
//! uno vivo sobre su carpeta de datos o lanza `danil-engine` junto al
//! ejecutable. Un release abre la raíz de `ai.danil.terminus`, la de 0.2.74; el
//! laboratorio usa `ai.danil.seldon.dev` y nunca esa raíz. Un candado evita que
//! dos ventanas arranquen dos motores. Ver `docs/engine-client.md`.
use std::{
    fs::{File, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    time::{Duration, Instant},
};
use terminus_engine_protocol::{Error, Result, Selection, VERSION};

pub const PRODUCTION: &str = "ai.danil.terminus";
pub const LAB_IDENTITY: &str = "ai.danil.seldon.dev";
// Un motor que rechaza o muere sale enseguida por `try_wait`; este plazo solo corta a uno vivo y lento.
const START_TIMEOUT: Duration = Duration::from_secs(300);
// Adoptar una raíz real de 0.2.74 tardó unos 25 s; el traspaso enseña el paso mientras tanto.
const ADOPT_TIMEOUT: Duration = Duration::from_secs(600);

#[derive(Clone)]
pub struct Paths {
    pub identity: String,
    pub root: PathBuf,
    pub data: PathBuf,
    pub resources: PathBuf,
    pub window: PathBuf,
    selection: PathBuf,
    pub launch_log: PathBuf,
}

/// Con la identidad de producción los datos son la raíz de 0.2.74 y lo de la
/// ventana vive al lado, en `ai.danil.terminus-window`: dentro no se admite.
pub fn paths() -> Result<Paths> {
    let base = dirs::data_local_dir().ok_or_else(|| Error::new("invalid_request"))?;
    let Some((identity, root)) = lab(&base) else {
        let root = base.join(format!("{PRODUCTION}-window"));
        return Ok(Paths {
            identity: PRODUCTION.into(),
            data: base.join(PRODUCTION),
            resources: installed_resources(&root)?,
            window: root.join("window"),
            selection: root.join("selection.json"),
            launch_log: root.join("engine-launch.log"),
            root,
        });
    };
    Ok(Paths {
        identity,
        data: root.join("engine"),
        resources: installed_resources(&root)?,
        window: root.join("window"),
        selection: root.join("selection.json"),
        launch_log: root.join("engine-launch.log"),
        root,
    })
}

/// El laboratorio: `TERMINUS_LAB_ROOT` o `TERMINUS_LAB_IDENTITY` en cualquier build, o
/// un build de desarrollo. Nunca con la identidad de producción.
fn lab(base: &Path) -> Option<(String, PathBuf)> {
    let identity = std::env::var("TERMINUS_LAB_IDENTITY")
        .ok()
        .filter(|i| !i.is_empty() && i != PRODUCTION);
    let root = std::env::var_os("TERMINUS_LAB_ROOT")
        .map(PathBuf::from)
        .filter(|root| root.is_absolute());
    if identity.is_none() && root.is_none() && !cfg!(debug_assertions) {
        return None;
    }
    let identity = identity.unwrap_or_else(|| LAB_IDENTITY.into());
    let root = root.unwrap_or_else(|| base.join(&identity));
    Some((identity, root))
}

/// Los recursos de la instalación (`lenguas/`, `work-tools/`), los mismos que `resource_dir()` de Tauri.
/// Dentro de un AppImage el montaje desaparece con la ventana: se copian a `<root>/resource-versions/<clave>`.
fn installed_resources(root: &Path) -> Result<PathBuf> {
    let exe = std::env::current_exe()?;
    let dir = exe.parent().ok_or_else(|| Error::new("invalid_request"))?;
    if cfg!(target_os = "macos") && dir.ends_with("Contents/MacOS") {
        return Ok(dir.join("../Resources").canonicalize()?);
    }
    #[cfg(target_os = "linux")]
    if let Some(appdir) =
        std::env::var_os("APPDIR").filter(|_| std::env::var_os("APPIMAGE").is_some())
    {
        let appdir = PathBuf::from(appdir);
        // `work-tools.py` deja ahí los recursos con su inventario, fuera del alcance de linuxdeploy.
        // Carpeta y productName coinciden; `scripts/guards/product-name.mjs` lo exige.
        let prepared = appdir.join("usr/share/Danil");
        if prepared.join(super::resources::INVENTORY).is_file() {
            return Ok(super::resources::materialize(&prepared, root)?);
        }
        // productName de tauri.conf.json: el bundle de Linux pone ahí los recursos.
        let mounted = appdir.join("usr/lib/Danil");
        let copy = root.join("resources");
        super::legacy::mirror(&mounted, &copy)?;
        return Ok(copy);
    }
    let _ = root;
    Ok(dir.to_path_buf())
}

/// Las carpetas de la ventana, antes de abrirla aunque el motor todavía no exista.
pub fn prepare(paths: &Paths) -> Result<()> {
    for dir in [&paths.root, &paths.window] {
        private_dir(dir)?;
    }
    Ok(())
}

/// La selección del motor de esta ventana: el vivo sobre la raíz o uno recién lanzado.
/// `adopt` pasa `--adopt-existing`: solo tras el traspaso que la persona aceptó.
pub fn ensure(paths: &Paths, adopt: bool) -> Result<PathBuf> {
    if super::engine_profile::managed(&paths.data)? {
        if adopt {
            return Err(Error::new("managed_service_unavailable"));
        }
        return attach_managed(paths, START_TIMEOUT);
    }
    prepare(paths)?;
    // La raíz de 0.2.74 ya existe y es del motor validarla; una nueva la crea él.
    if paths.identity != PRODUCTION {
        private_dir(&paths.data)?;
    }
    let lock = File::create(paths.root.join("launch.lock"))?;
    lock.lock()?;
    // El CLI arranca bajo este mismo candado; sin él, el de la raíz evita igual un segundo motor.
    let _starting = super::engine_profile::start_lock(&paths.data, START_TIMEOUT);
    let endpoint = paths.data.join("seldon-endpoint.json");
    let patience = Instant::now() + START_TIMEOUT;
    let mut waited = false;
    // Una ventana apartada por el instalador sigue con el motor de su versión y nunca toma el nuevo.
    let aside = super::legacy::set_aside(std::process::id());
    loop {
        // Cualquier contrato: la ventana tolera un motor que hable otro, como con las máquinas remotas.
        let probed = previous(&endpoint);
        if let Some((found, status)) = probed.as_ref().ok().filter(|(found, _)| ours(paths, found))
        {
            if other_version(paths, &found.contract) {
                if aside {
                    return Err(Error::new("window_replaced"));
                }
                // Tras actualizar el motor es de la versión anterior: se para en cuanto quede libre.
                if working(&status["busy"]) || !retire(&endpoint, found.pid) {
                    return Err(Error {
                        detail: serde_json::json!({"turns": status["busy"]["turns"], "pid": found.pid}),
                        ..Error::new("previous_engine_busy")
                    });
                }
            } else if aside
                // Uno que trabaja sigue con su versión; la nueva entra cuando lo dejen parar.
                || !super::legacy::engine_replaced(found.pid, true)
                || !retire(&endpoint, found.pid)
            {
                if waited {
                    log::info!("[engine] answered after waiting: pid={}", found.pid);
                }
                return selected(paths, &endpoint, found, status);
            }
        }
        // El candado de la raíz es la prueba de vida: un motor que arranca, se cierra o está saturado lo retiene.
        if !root_held(&paths.data) {
            break;
        }
        match &probed {
            // Un descriptor que no es privado no se arregla esperando.
            Err(error) if error.code == "invalid_token" => return Err(error.clone()),
            Err(error) if !waited => log::info!("[engine] root held, {}: waiting", error.code),
            _ => {}
        }
        if Instant::now() >= patience {
            return Err(Error {
                detail: serde_json::json!({"reason": "root_locked"}),
                ..Error::new("service_busy")
            });
        }
        waited = true;
        std::thread::sleep(Duration::from_millis(500));
    }
    if aside {
        return Err(Error::new("window_replaced"));
    }
    let offset = std::fs::metadata(&paths.launch_log).map_or(0, |m| m.len());
    let mut child = spawn(paths, adopt)?;
    let deadline = Instant::now() + if adopt { ADOPT_TIMEOUT } else { START_TIMEOUT };
    while Instant::now() < deadline {
        if child.try_wait()?.is_some() {
            return Err(failed(paths, offset));
        }
        // El que acaba de lanzar es el motor empaquetado, hable el contrato que hable.
        if let Ok((found, status)) = previous(&endpoint) {
            if found.pid == child.id() {
                remember_bundled_contract(paths, &found.contract);
                return selected(paths, &endpoint, &found, &status);
            }
        }
        std::thread::sleep(Duration::from_millis(200));
    }
    Err(failed(paths, offset))
}

/// Un supervisor administra esta raíz: se espera su descriptor, sin arrancar ni adoptar.
fn attach_managed(paths: &Paths, within: Duration) -> Result<PathBuf> {
    prepare(paths)?;
    let deadline = Instant::now() + within;
    loop {
        match managed_endpoint(&paths.data) {
            Ok((found, status)) => {
                return write_selection(
                    paths,
                    &paths.data.join("seldon-endpoint.json"),
                    &found,
                    &status,
                )
            }
            Err(error)
                if error.code == "managed_service_unavailable" && Instant::now() < deadline =>
            {
                std::thread::sleep(Duration::from_millis(500));
            }
            Err(error) => return Err(error),
        }
    }
}

fn managed_endpoint(
    data: &Path,
) -> Result<(terminus_engine_protocol::Endpoint, serde_json::Value)> {
    let (found, status) = terminus_engine_client::probe(&data.join("seldon-endpoint.json"))
        .map_err(|error| match error.code.as_str() {
            "io" | "app_unavailable" => Error::new("managed_service_unavailable"),
            _ => error,
        })?;
    if super::engine_profile::canonical(&found.data_directory)
        != super::engine_profile::canonical(data)
    {
        return Err(Error::new("invalid_token"));
    }
    Ok((found, status))
}

/// Recupera sólo el cliente del servicio; cada nuevo descriptor y token se validan de nuevo.
pub fn reconnect_managed(
    current: &terminus_engine_client::Client,
) -> Result<terminus_engine_client::Client> {
    let previous = current.selection();
    let (found, status) = managed_endpoint(&previous.data_directory)?;
    let file = previous.window_data.join("managed-selection.json");
    write_selection_at(
        &previous.window_data,
        &file,
        &previous.data_directory.join("seldon-endpoint.json"),
        &found,
        &status,
    )?;
    terminus_engine_client::Client::select(&file)
}

/// Un descriptor dentro de la raíz que nombra otra (una raíz copiada) no es de esta ventana.
fn ours(paths: &Paths, found: &terminus_engine_protocol::Endpoint) -> bool {
    use super::engine_profile::canonical;
    canonical(&found.data_directory) == canonical(&paths.data)
}

/// Como `running()` del motor: abre `seldon-runtime.lock` sin crearlo y prueba a tomarlo.
fn root_held(data: &Path) -> bool {
    let Ok(file) = File::open(data.join("seldon-runtime.lock")) else {
        return false;
    };
    matches!(file.try_lock(), Err(std::fs::TryLockError::WouldBlock))
}

/// La selección, y `engine.json` para el CLI; un fallo de este no impide abrir la ventana.
fn selected(
    paths: &Paths,
    endpoint: &Path,
    found: &terminus_engine_protocol::Endpoint,
    status: &serde_json::Value,
) -> Result<PathBuf> {
    let selection = write_selection(paths, endpoint, found, status)?;
    let engine = match bundled_engine() {
        Ok(bundled) => installed_engine(paths, bundled),
        Err(error) => {
            log::warn!("[engine] engine.json not written: {}", error.code);
            return Ok(selection);
        }
    };
    let production = paths.identity == PRODUCTION;
    let profile = super::engine_profile::Profile {
        name: if production {
            super::engine_profile::DESKTOP
        } else {
            super::engine_profile::LAB
        },
        engine: &engine,
        data: &paths.data,
        resources: &paths.resources,
        identity: &paths.identity,
        production,
    };
    match super::engine_profile::publish(&profile, &paths.root.join("engine-mark.json")) {
        Ok(written) => log::info!(
            "[engine] engine.json profile={} written={written}",
            profile.name
        ),
        Err(error) => log::warn!("[engine] engine.json not written: {error}"),
    }
    Ok(selection)
}

pub enum Stopped {
    /// Aceptó y salió.
    Done,
    /// Se negó con `task_busy` por trabajo: turnos, descargas u operaciones.
    Busy,
    /// No contestó, no salió, o solo lo retienen observadores: el instalador lo para.
    Unanswered,
}

/// Para el instalador: pide `service stop` al motor de esta raíz, que se niega si trabaja.
pub fn stop() -> Stopped {
    let Ok(paths) = paths() else {
        return Stopped::Unanswered;
    };
    if !matches!(super::engine_profile::managed(&paths.data), Ok(false)) {
        return Stopped::Busy;
    }
    let endpoint = paths.data.join("seldon-endpoint.json");
    // Una orden de una ventana que se acaba de cerrar termina sola; un turno o una descarga, no.
    let settle = Instant::now() + Duration::from_secs(20);
    loop {
        match terminus_engine_client::request_any_contract(
            &endpoint,
            "service stop",
            Duration::from_secs(5),
        ) {
            Ok((found, _)) => {
                let deadline = Instant::now() + Duration::from_secs(30);
                while Instant::now() < deadline {
                    if !super::legacy::alive(found.pid) {
                        return Stopped::Done;
                    }
                    std::thread::sleep(Duration::from_millis(200));
                }
                return Stopped::Unanswered;
            }
            Err(error) if error.code == "task_busy" && working(&error.detail) => {
                if !only_operations(&error.detail) || Instant::now() >= settle {
                    return Stopped::Busy;
                }
                std::thread::sleep(Duration::from_secs(1));
            }
            Err(_) => return Stopped::Unanswered,
        }
    }
}

/// Con otra versión instalada, el motor viejo se para en cuanto queda sin trabajo;
/// la ventana arranca el nuevo en su siguiente sondeo, como tras cualquier caída.
/// Una ventana apartada no lo para: sigue con él hasta que se reinicie.
pub fn retire_if_replaced(paths: &Paths) {
    if !matches!(super::engine_profile::managed(&paths.data), Ok(false))
        || super::legacy::set_aside(std::process::id())
    {
        return;
    }
    let endpoint = paths.data.join("seldon-endpoint.json");
    let Ok((found, status)) = previous(&endpoint) else {
        return;
    };
    if super::legacy::engine_replaced(found.pid, false) && !working(&status["busy"]) {
        retire(&endpoint, found.pid);
    }
}

/// «Detener y entrar ya» con el motor anterior trabajando: corta sus turnos y apunta sus
/// tareas para que el nuevo las retome. Uno sin esa orden se niega y se termina su proceso.
pub fn force_previous(paths: &Paths) -> Result<()> {
    if super::engine_profile::managed(&paths.data)? {
        return Err(Error::new("managed_service_unavailable"));
    }
    let endpoint = paths.data.join("seldon-endpoint.json");
    let (found, _) = previous(&endpoint)?;
    let asked = terminus_engine_client::force_stop_any_contract(&endpoint, Duration::from_secs(5));
    log::info!(
        "[engine] update now: previous pid={} force_stop={}",
        found.pid,
        asked.is_ok()
    );
    if asked.is_err() {
        super::legacy::terminate(found.pid);
    }
    // El motor corta los turnos con hasta 10 s para guardar cada transcripción.
    let deadline = Instant::now() + Duration::from_secs(60);
    while Instant::now() < deadline {
        if !super::legacy::alive(found.pid) {
            return Ok(());
        }
        std::thread::sleep(Duration::from_millis(200));
    }
    super::legacy::terminate(found.pid);
    Err(Error::new("service_busy"))
}

/// El motor vivo sobre la raíz aunque sea de otro contrato, con su `status`.
fn previous(endpoint: &Path) -> Result<(terminus_engine_protocol::Endpoint, serde_json::Value)> {
    let (found, status) =
        terminus_engine_client::request_any_contract(endpoint, "status", Duration::from_secs(3))?;
    if status["runtime"] != found.runtime.as_str() || status["service"] != true {
        return Err(Error::new("version_mismatch"));
    }
    Ok((found, status))
}

/// Otra versión del motor: no habla el contrato del que viaja con la ventana. Hasta que la
/// ventana lo lance una vez no lo sabe y compara con el suyo, como antes de tolerar otros.
fn other_version(paths: &Paths, contract: &str) -> bool {
    differs(
        contract,
        bundled_contract(paths).as_deref(),
        &terminus_engine_client::contract(),
    )
}

fn differs(running: &str, bundled: Option<&str>, window: &str) -> bool {
    running != bundled.unwrap_or(window)
}

fn bundled_contract_file(paths: &Paths) -> PathBuf {
    paths.root.join("bundled-contract.json")
}

/// Tamaño y fechas del binario: si cambian, se instaló otro y su contrato se aprende de nuevo.
fn engine_stamp() -> Option<serde_json::Value> {
    let engine = bundled_engine().ok()?;
    let meta = std::fs::metadata(&engine).ok()?;
    let nanos = |time: std::io::Result<std::time::SystemTime>| {
        time.ok()
            .and_then(|time| time.duration_since(std::time::SystemTime::UNIX_EPOCH).ok())
            .map(|elapsed| elapsed.as_nanos().to_string())
    };
    Some(serde_json::json!({
        "engine": engine,
        "len": meta.len(),
        "modified": nanos(meta.modified()),
        "created": nanos(meta.created()),
    }))
}

/// El contrato del motor empaquetado, el que contestó la última vez que esta ventana lo lanzó.
fn bundled_contract(paths: &Paths) -> Option<String> {
    let saved: serde_json::Value =
        serde_json::from_slice(&std::fs::read(bundled_contract_file(paths)).ok()?).ok()?;
    if saved["stamp"] != engine_stamp()? {
        return None;
    }
    saved["contract"].as_str().map(str::to_owned)
}

fn remember_bundled_contract(paths: &Paths, contract: &str) {
    let window = terminus_engine_client::contract();
    if contract != window {
        log::warn!(
            "[engine] bundled engine speaks contract {contract}, window {window}: tolerated"
        );
    }
    let Some(stamp) = engine_stamp() else {
        return;
    };
    let bytes = serde_json::json!({"stamp": stamp, "contract": contract}).to_string();
    let file = bundled_contract_file(paths);
    let temporary = file.with_extension("json.tmp");
    let _ = std::fs::remove_file(&temporary);
    let written = private_file(&temporary)
        .and_then(|mut output| Ok(output.write_all(bytes.as_bytes())?))
        .and_then(|()| Ok(std::fs::rename(&temporary, &file)?));
    if let Err(error) = written {
        log::warn!("[engine] bundled contract not saved: {}", error.code);
    }
}

/// Una sola petición: al abrir la ventana no se espera a que acaben las órdenes.
fn retire(endpoint: &Path, pid: u32) -> bool {
    let stopped = terminus_engine_client::request_any_contract(
        endpoint,
        "service stop",
        Duration::from_secs(5),
    );
    log::info!(
        "[engine] replaced engine pid={pid} stop={}",
        stopped.is_ok()
    );
    if stopped.is_err() {
        return false;
    }
    let deadline = Instant::now() + Duration::from_secs(30);
    while Instant::now() < deadline {
        if !super::legacy::alive(pid) {
            return true;
        }
        std::thread::sleep(Duration::from_millis(200));
    }
    false
}

fn only_operations(busy: &serde_json::Value) -> bool {
    busy.is_object() && busy["turns"].as_u64().unwrap_or(0) == 0 && busy["downloading"] != true
}

// Un `watch_task_tree` de una ventana cerrada a la fuerza no caduca y retiene al motor; no es trabajo.
fn working(busy: &serde_json::Value) -> bool {
    !busy.is_object()
        || busy["turns"].as_u64().unwrap_or(0) > 0
        || busy["downloading"] == true
        || busy["operations"].as_array().is_some_and(|operations| {
            operations.iter().any(|operation| {
                !matches!(
                    operation["command"].as_str(),
                    Some("watch_task_tree" | "list_session_git")
                )
            })
        })
}

/// El motor junto al ejecutable de la ventana (`danil-engine`, o `seldon-runtime`).
fn bundled_engine() -> Result<PathBuf> {
    let exe = super::legacy::sibling_engine(&std::env::current_exe()?);
    if !exe.is_file() {
        return Err(Error {
            detail: serde_json::json!(exe),
            ..Error::new("engine_missing")
        });
    }
    Ok(exe)
}

/// El binario que arranca la ventana: en un AppImage, la copia estable que deja `stable_engine`.
fn engine_root(paths: &Paths) -> PathBuf {
    if paths.data == paths.root.join("engine") {
        paths.root.join("sidecar")
    } else {
        paths.root.clone()
    }
}

fn installed_engine(paths: &Paths, bundled: PathBuf) -> PathBuf {
    let copy = engine_root(paths).join("engine").join("seldon-runtime");
    if cfg!(target_os = "linux") && std::env::var_os("APPIMAGE").is_some() && copy.is_file() {
        return copy;
    }
    bundled
}

fn spawn(paths: &Paths, adopt: bool) -> Result<Child> {
    if super::engine_profile::managed(&paths.data)? {
        return Err(Error::new("managed_service_unavailable"));
    }
    let exe = super::legacy::stable_engine(&bundled_engine()?, &engine_root(paths))?;
    let mut log = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&paths.launch_log)?;
    // proceso largo: a propósito. El motor sobrevive a la ventana y se apaga solo sin clientes.
    let mut command = Command::new(&exe);
    #[cfg(target_os = "linux")]
    super::linux_engine::prepare(&mut command, &paths.root)?;
    crate::util::no_console_window(&mut command)
        .arg("--data-dir")
        .arg(&paths.data)
        .arg("--resource-dir")
        .arg(&paths.resources)
        .arg("--identity")
        .arg(&paths.identity)
        .stdin(Stdio::null())
        .stdout(log.try_clone()?)
        .stderr(log.try_clone()?);
    if paths.identity == PRODUCTION {
        command.arg("--production-identity");
    }
    if adopt {
        command.arg("--adopt-existing");
    }
    #[cfg(target_os = "macos")]
    let master_pipe = super::master_handoff::prepare(&exe, &paths.identity, &mut command);
    log::info!(
        "[engine] starting identity={} adopt={adopt}",
        paths.identity
    );
    let (child, outside) = spawn_detached(&mut command)?;
    #[cfg(target_os = "macos")]
    drop(master_pipe);
    let _ = writeln!(
        log,
        "window: launched pid={}{}",
        child.id(),
        launch_note(&child, outside)
    );
    Ok(child)
}

// Sale del job de quien lanzó la ventana para sobrevivirla; si ese job no lo permite, queda dentro.
#[cfg(windows)]
pub(super) fn spawn_detached(command: &mut Command) -> std::io::Result<(Child, bool)> {
    use std::os::windows::process::CommandExt;
    const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;
    const CREATE_BREAKAWAY_FROM_JOB: u32 = 0x0100_0000;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let flags = CREATE_NEW_PROCESS_GROUP | CREATE_NO_WINDOW;
    command.creation_flags(flags | CREATE_BREAKAWAY_FROM_JOB);
    match command.spawn() {
        Err(error) if error.kind() == std::io::ErrorKind::PermissionDenied => {
            command.creation_flags(flags);
            Ok((command.spawn()?, false))
        }
        other => Ok((other?, true)),
    }
}

/// Si la ventana y el motor quedaron en un Job Object: un job que mata al cerrarse se lleva al motor.
#[cfg(windows)]
fn launch_note(child: &Child, outside: bool) -> String {
    use std::os::windows::io::AsRawHandle;
    let window = in_job(unsafe { windows_sys::Win32::System::Threading::GetCurrentProcess() });
    let breakaway = if outside { "accepted" } else { "refused" };
    let engine = in_job(child.as_raw_handle() as _);
    format!(" window_in_job={window} breakaway={breakaway} engine_in_job={engine}")
}

#[cfg(windows)]
fn in_job(process: windows_sys::Win32::Foundation::HANDLE) -> &'static str {
    let mut result = 0;
    let ok = unsafe {
        windows_sys::Win32::System::JobObjects::IsProcessInJob(
            process,
            std::ptr::null_mut(),
            &mut result,
        )
    };
    match (ok != 0, result != 0) {
        (false, _) => "unknown",
        (true, true) => "yes",
        (true, false) => "no",
    }
}

#[cfg(unix)]
fn launch_note(_child: &Child, _outside: bool) -> String {
    " process_group=own".into()
}

#[cfg(unix)]
pub(super) fn spawn_detached(command: &mut Command) -> std::io::Result<(Child, bool)> {
    use std::os::unix::process::CommandExt;
    command.process_group(0);
    Ok((command.spawn()?, true))
}

/// La clave con que el motor rechazó el arranque, de lo que escribió en esta corrida.
fn failed(paths: &Paths, offset: u64) -> Error {
    let written = std::fs::read(&paths.launch_log).unwrap_or_default();
    let tail = String::from_utf8_lossy(written.get(offset as usize..).unwrap_or_default());
    let code = tail
        .rsplit_once("cli.error.")
        .map(|(_, rest)| {
            rest.chars()
                .take_while(|c| c.is_ascii_alphanumeric() || *c == '_')
                .collect::<String>()
        })
        .filter(|code| {
            matches!(
                code.as_str(),
                "adoption_required" | "service_busy" | "authority_incompatible"
            )
        })
        .unwrap_or_else(|| "engine_start_failed".into());
    Error {
        detail: serde_json::json!(paths.launch_log),
        ..Error::new(&code)
    }
}

fn write_selection(
    paths: &Paths,
    endpoint: &Path,
    found: &terminus_engine_protocol::Endpoint,
    status: &serde_json::Value,
) -> Result<PathBuf> {
    write_selection_at(&paths.window, &paths.selection, endpoint, found, status)
}

fn write_selection_at(
    window: &Path,
    file: &Path,
    endpoint: &Path,
    found: &terminus_engine_protocol::Endpoint,
    status: &serde_json::Value,
) -> Result<PathBuf> {
    let selection = Selection {
        version: VERSION,
        endpoint: endpoint.to_path_buf(),
        credential: found.token_file.clone(),
        runtime: found.runtime.clone(),
        data_directory: found.data_directory.clone(),
        contract: found.contract.clone(),
        service_build: status["service_build"]
            .as_str()
            .unwrap_or_default()
            .to_owned(),
        window_data: window.to_path_buf(),
    };
    let bytes = serde_json::to_vec(&selection)?;
    // Reescribirla igual invalidaría el cliente de las otras ventanas sobre el mismo motor.
    if std::fs::read(file).is_ok_and(|current| current == bytes) {
        return Ok(file.to_path_buf());
    }
    let temporary = file.with_extension("json.tmp");
    let _ = std::fs::remove_file(&temporary);
    let mut output = private_file(&temporary)?;
    output.write_all(&bytes)?;
    output.sync_all()?;
    drop(output);
    std::fs::rename(&temporary, file)?;
    Ok(file.to_path_buf())
}

fn private_dir(dir: &Path) -> Result<()> {
    terminus_engine_client::make_private_directory(dir)
}

fn private_file(path: &Path) -> Result<File> {
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    Ok(options.open(path)?)
}

#[cfg(test)]
mod tests {
    use super::{differs, only_operations, working};
    use serde_json::json;

    #[test]
    fn an_engine_of_another_contract_is_old_only_against_the_bundled_one() {
        // El empaquetado habla otro contrato que la ventana: es el suyo, no uno viejo.
        assert!(!differs("old", Some("old"), "new"));
        // Tras actualizar, el que sigue vivo no habla el del empaquetado: es de la versión anterior.
        assert!(differs("old", Some("new"), "new"));
        // Sin haberlo lanzado nunca, se compara con el de la ventana, como antes.
        assert!(differs("old", None, "new"));
        assert!(!differs("new", None, "new"));
    }

    #[test]
    fn only_turns_downloads_and_real_operations_keep_the_installer_out() {
        let watchers = json!({"turns": null, "downloading": false, "operations": [
            {"command": "watch_task_tree", "since": 1}, {"command": "list_session_git", "since": 2}]});
        assert!(!working(&watchers));
        assert!(working(
            &json!({"turns": 1, "downloading": false, "operations": []})
        ));
        assert!(working(
            &json!({"turns": null, "downloading": true, "operations": []})
        ));
        assert!(working(
            &json!({"turns": null, "downloading": false, "operations": [
            {"command": "watch_task_tree"}, {"command": "clone_project"}]})
        ));
        assert!(working(&json!(null)));
        assert!(only_operations(
            &json!({"turns": null, "downloading": false, "operations": [{"command": "add_project"}]})
        ));
        assert!(!only_operations(
            &json!({"turns": 2, "downloading": false, "operations": []})
        ));
        assert!(!only_operations(
            &json!({"turns": null, "downloading": true, "operations": []})
        ));
    }
}
