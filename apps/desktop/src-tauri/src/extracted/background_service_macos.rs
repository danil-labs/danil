use super::super::{engine_profile, master_handoff, service_plan};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    ffi::CStr,
    fs::{File, OpenOptions},
    io::{self, Read, Write},
    os::{
        fd::AsRawFd,
        unix::fs::{DirBuilderExt, MetadataExt, OpenOptionsExt},
    },
    path::{Path, PathBuf},
    process::{Child, Command, ExitStatus, Stdio},
    sync::atomic::{AtomicI32, Ordering},
    time::{Duration, Instant},
};

static SIGNAL: AtomicI32 = AtomicI32::new(0);
const IO_LIMIT: u64 = 1024 * 1024;

struct Installation {
    home: PathBuf,
    executable: PathBuf,
    engine: PathBuf,
    resources: PathBuf,
    data: PathBuf,
    config: PathBuf,
    sha256: String,
}

pub fn run(output: Option<&Path>) -> io::Result<i32> {
    install_signals()?;
    let installation = installation()?;
    let captured = capture(&installation.engine, &installation.home);
    if SIGNAL.load(Ordering::SeqCst) != 0 {
        return Ok(0);
    }
    let metadata = captured?;
    service_plan::metadata(&metadata, &terminus_engine_client::contract())?;
    let current = configuration(&installation.config, output.is_some())?;
    if let Some(output) = output {
        let profile = service_plan::profile(
            current,
            &installation.data,
            &installation.engine,
            &installation.resources,
            &installation.sha256,
        )?;
        prepare(&installation, output, &profile)?;
        return Ok(0);
    }
    service_plan::configured(
        &current,
        &installation.data,
        &installation.engine,
        &installation.resources,
        &installation.sha256,
    )?;
    launch(&installation)
}

fn installation() -> io::Result<Installation> {
    if unsafe { libc::geteuid() } == 0 || unsafe { libc::geteuid() != libc::getuid() } {
        return Err(io::Error::other("background_user_session_required"));
    }
    let home = account_home()?;
    let executable = std::env::current_exe()?.canonicalize()?;
    let macos = executable.parent().ok_or(io::ErrorKind::InvalidData)?;
    let bundle = macos
        .parent()
        .and_then(Path::parent)
        .ok_or(io::ErrorKind::InvalidData)?;
    if !macos.ends_with("Contents/MacOS")
        || bundle
            .extension()
            .is_none_or(|extension| extension != "app")
        || !(bundle.starts_with("/Applications") || bundle.starts_with(home.join("Applications")))
        || !master_handoff::signed_window()
    {
        return Err(io::Error::other("background_signed_installation_required"));
    }
    let engine = super::super::legacy::sibling_engine(&executable).canonicalize()?;
    let resources = bundle.join("Contents/Resources").canonicalize()?;
    if !engine.starts_with(macos)
        || !resources.starts_with(bundle)
        || !master_handoff::trusted(&engine)
    {
        return Err(io::Error::other("background_signature_invalid"));
    }
    let data = home
        .join("Library/Application Support")
        .join(service_plan::IDENTITY);
    terminus_engine_client::private_directory(&data)
        .map_err(|_| io::Error::other("background_existing_root_required"))?;
    let data = data.canonicalize()?;
    let config = home.join(".config/terminus");
    let mut hasher = Sha256::new();
    io::copy(&mut File::open(&engine)?, &mut hasher)?;
    let sha256 = format!("{:x}", hasher.finalize());
    Ok(Installation {
        home,
        executable,
        engine,
        resources,
        data,
        config,
        sha256,
    })
}

fn account_home() -> io::Result<PathBuf> {
    let mut record = std::mem::MaybeUninit::<libc::passwd>::uninit();
    let mut buffer = vec![0u8; 65536];
    let mut result = std::ptr::null_mut();
    let code = unsafe {
        libc::getpwuid_r(
            libc::geteuid(),
            record.as_mut_ptr(),
            buffer.as_mut_ptr().cast(),
            buffer.len(),
            &mut result,
        )
    };
    if code != 0 || result.is_null() {
        return Err(io::Error::other("background_user_session_required"));
    }
    let record = unsafe { record.assume_init() };
    if record.pw_dir.is_null() {
        return Err(io::ErrorKind::InvalidData.into());
    }
    use std::os::unix::ffi::OsStrExt;
    let home = Path::new(std::ffi::OsStr::from_bytes(
        unsafe { CStr::from_ptr(record.pw_dir) }.to_bytes(),
    ));
    if !home.is_absolute() {
        return Err(io::ErrorKind::InvalidData.into());
    }
    let home = home.canonicalize()?;
    owned_directory(&home)?;
    Ok(home)
}

fn owned_directory(path: &Path) -> io::Result<()> {
    let metadata = std::fs::symlink_metadata(path)?;
    if !metadata.is_dir()
        || metadata.file_type().is_symlink()
        || metadata.uid() != unsafe { libc::geteuid() }
        || metadata.mode() & 0o022 != 0
    {
        return Err(io::Error::other("background_path_not_private"));
    }
    Ok(())
}

fn configuration(folder: &Path, optional: bool) -> io::Result<Value> {
    let read = || -> io::Result<Value> {
        owned_directory(folder)?;
        let file = OpenOptions::new()
            .read(true)
            .custom_flags(libc::O_NOFOLLOW)
            .open(folder.join("engine.json"))?;
        private_file(&file)?;
        let mut bytes = Vec::new();
        file.take(IO_LIMIT + 1).read_to_end(&mut bytes)?;
        if bytes.len() as u64 > IO_LIMIT {
            return Err(io::ErrorKind::InvalidData.into());
        }
        Ok(serde_json::from_slice(&bytes)?)
    };
    match read() {
        Err(error) if optional && error.kind() == io::ErrorKind::NotFound => {
            Ok(json!({"version":1,"profiles":{}}))
        }
        other => other,
    }
}

fn private_file(file: &File) -> io::Result<()> {
    let metadata = file.metadata()?;
    if !metadata.is_file()
        || metadata.uid() != unsafe { libc::geteuid() }
        || metadata.mode() & 0o077 != 0
        || metadata.nlink() != 1
    {
        return Err(io::Error::other("background_path_not_private"));
    }
    Ok(())
}

fn clean_command(engine: &Path, home: &Path) -> Command {
    // proceso largo: a propósito. El wrapper conserva y recoge únicamente este hijo, sin detach.
    let mut command = Command::new(engine);
    crate::util::no_console_window(&mut command);
    command
        .env_clear()
        .env("HOME", home)
        .env("PATH", "/usr/bin:/bin:/usr/sbin:/sbin")
        .env("TMPDIR", "/tmp")
        .env("LANG", "en_US.UTF-8")
        .current_dir(home)
        .stdin(Stdio::null());
    command
}

fn capture(engine: &Path, home: &Path) -> io::Result<Value> {
    let mut child = clean_command(engine, home)
        .args(["agent-context", "--json"])
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()?;
    let result = (|| -> io::Result<Value> {
        let mut stdout = child.stdout.take().ok_or(io::ErrorKind::BrokenPipe)?;
        if unsafe { libc::fcntl(stdout.as_raw_fd(), libc::F_SETFL, libc::O_NONBLOCK) } == -1 {
            return Err(io::Error::last_os_error());
        }
        let until = Instant::now() + Duration::from_secs(5);
        let mut bytes = Vec::new();
        let mut buffer = [0u8; 4096];
        let mut status = None;
        loop {
            if SIGNAL.load(Ordering::SeqCst) != 0 {
                return Err(io::Error::other("background_start_interrupted"));
            }
            match stdout.read(&mut buffer) {
                Ok(0) if status.is_some() => {
                    if !status.is_some_and(|s: ExitStatus| s.success()) {
                        return Err(io::Error::other("background_engine_incompatible"));
                    }
                    return Ok(serde_json::from_slice(&bytes)?);
                }
                Ok(count) => bytes.extend_from_slice(&buffer[..count]),
                Err(error) if error.kind() == io::ErrorKind::WouldBlock => {}
                Err(error) => return Err(error),
            }
            if bytes.len() as u64 > IO_LIMIT || Instant::now() >= until {
                return Err(io::Error::other("background_preflight_timeout"));
            }
            if status.is_none() {
                status = child.try_wait()?;
            }
            std::thread::sleep(Duration::from_millis(10));
        }
    })();
    if child.try_wait()?.is_none() {
        child.kill()?;
    }
    child.wait()?;
    result
}

fn prepare(installation: &Installation, output: &Path, profile: &Value) -> io::Result<()> {
    if !output.is_absolute() {
        return Err(io::ErrorKind::InvalidInput.into());
    }
    let output = engine_profile::canonical(output);
    for protected in [
        installation.data.clone(),
        installation.config.clone(),
        installation.home.join("Library/LaunchAgents"),
        installation
            .home
            .join("Library/Application Support/ai.danil.terminus-window"),
        installation
            .executable
            .ancestors()
            .nth(3)
            .ok_or(io::ErrorKind::InvalidData)?
            .to_owned(),
    ] {
        let protected = engine_profile::canonical(&protected);
        if output.starts_with(&protected) || protected.starts_with(&output) {
            return Err(io::Error::other("background_output_must_be_staging"));
        }
    }
    std::fs::DirBuilder::new().mode(0o700).create(&output)?;
    let write = |name: &str, bytes: &[u8]| -> io::Result<()> {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .mode(0o600)
            .custom_flags(libc::O_NOFOLLOW)
            .open(output.join(name))?;
        file.write_all(bytes)?;
        file.sync_all()
    };
    write("engine.json", &serde_json::to_vec_pretty(profile)?)?;
    write(
        &format!("{}.plist", service_plan::LABEL),
        service_plan::plist(&installation.executable)?.as_bytes(),
    )?;
    Ok(())
}

fn launch(installation: &Installation) -> io::Result<i32> {
    // El candado coincide con el CLI por raíz canónica, pero no depende de HOME/XDG heredados.
    let lock_dir = installation.config.join("locks");
    match std::fs::DirBuilder::new().mode(0o700).create(&lock_dir) {
        Err(error) if error.kind() != io::ErrorKind::AlreadyExists => return Err(error),
        _ => {}
    }
    owned_directory(&lock_dir)?;
    let digest = Sha256::digest(installation.data.to_string_lossy().as_bytes());
    let lock = OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(false)
        .mode(0o600)
        .custom_flags(libc::O_NOFOLLOW)
        .open(lock_dir.join(format!("{digest:x}.lock")))?;
    let metadata = lock.metadata()?;
    if !metadata.is_file()
        || metadata.uid() != unsafe { libc::geteuid() }
        || metadata.mode() & 0o022 != 0
        || metadata.nlink() != 1
    {
        return Err(io::Error::other("background_path_not_private"));
    }
    lock.try_lock()
        .map_err(|_| io::Error::other("background_start_busy"))?;
    if SIGNAL.load(Ordering::SeqCst) != 0 {
        return Ok(0);
    }
    let mut command = clean_command(&installation.engine, &installation.home);
    command
        .arg("--data-dir")
        .arg(&installation.data)
        .arg("--resource-dir")
        .arg(&installation.resources)
        .args([
            "--identity",
            service_plan::IDENTITY,
            "--production-identity",
            "--resident",
            "--require-master-fd",
            "--expected-contract",
        ])
        .arg(terminus_engine_client::contract())
        .stdout(Stdio::null())
        .stderr(Stdio::inherit());
    let (read, write) = master_handoff::waiting_pipe(&mut command)?;
    let mut child = command.spawn()?;
    drop(read);
    let delivery = master_handoff::deliver(write, child.id(), service_plan::IDENTITY);
    if let Err(error) = delivery {
        return failed_start(&mut child, error);
    }
    if let Err(error) = await_ready(&mut child, installation) {
        return failed_start(&mut child, error);
    }
    // El host ya acreditó su cerco y descriptor; el lock solo serializa los arranques.
    drop(lock);
    let status = match supervise(&mut child) {
        Ok(status) => status,
        Err(error) => {
            let _ = terminate(&mut child, libc::SIGTERM);
            return Err(error);
        }
    };
    Ok(status.code().unwrap_or(1))
}

fn failed_start(child: &mut Child, error: io::Error) -> io::Result<i32> {
    let number = SIGNAL.load(Ordering::SeqCst);
    let status = terminate(child, if number == 0 { libc::SIGTERM } else { number })?;
    if number != 0 {
        Ok(status.code().unwrap_or(1))
    } else {
        Err(error)
    }
}

fn await_ready(child: &mut Child, installation: &Installation) -> io::Result<()> {
    let until = Instant::now() + Duration::from_secs(300);
    let endpoint = installation.data.join("seldon-endpoint.json");
    loop {
        if child.try_wait()?.is_some() {
            return Err(io::Error::other("background_engine_exited_before_ready"));
        }
        if SIGNAL.load(Ordering::SeqCst) != 0 {
            return Err(io::Error::other("background_start_interrupted"));
        }
        if let Ok((found, status)) = terminus_engine_client::probe(&endpoint) {
            return service_plan::ready(
                &found,
                &status,
                child.id(),
                &installation.data,
                &installation.engine,
                &terminus_engine_client::contract(),
            );
        }
        if Instant::now() >= until {
            return Err(io::Error::other("background_start_timeout"));
        }
        std::thread::sleep(Duration::from_millis(100));
    }
}

extern "C" fn signal(number: libc::c_int) {
    let _ = SIGNAL.compare_exchange(0, number, Ordering::SeqCst, Ordering::SeqCst);
}

fn install_signals() -> io::Result<()> {
    unsafe {
        let mut action: libc::sigaction = std::mem::zeroed();
        action.sa_sigaction = signal as *const () as usize;
        libc::sigemptyset(&mut action.sa_mask);
        for number in [libc::SIGTERM, libc::SIGINT, libc::SIGHUP] {
            if libc::sigaction(number, &action, std::ptr::null_mut()) == -1 {
                return Err(io::Error::last_os_error());
            }
        }
        libc::signal(libc::SIGPIPE, libc::SIG_IGN);
    }
    Ok(())
}

fn supervise(child: &mut Child) -> io::Result<ExitStatus> {
    loop {
        if let Some(status) = child.try_wait()? {
            return Ok(status);
        }
        let number = SIGNAL.load(Ordering::SeqCst);
        if number != 0 {
            return terminate(child, number);
        }
        std::thread::sleep(Duration::from_millis(100));
    }
}

fn terminate(child: &mut Child, number: i32) -> io::Result<ExitStatus> {
    if let Some(status) = child.try_wait()? {
        return Ok(status);
    }
    // PID propio no recogido: no puede reutilizarse antes de wait.
    if unsafe { libc::kill(child.id() as i32, number) } == -1 {
        let error = io::Error::last_os_error();
        if error.raw_os_error() != Some(libc::ESRCH) {
            return Err(error);
        }
    }
    let until = Instant::now() + Duration::from_secs(30);
    loop {
        if let Some(status) = child.try_wait()? {
            return Ok(status);
        }
        if Instant::now() >= until {
            break;
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    child.kill()?;
    let until = Instant::now() + Duration::from_secs(5);
    loop {
        if let Some(status) = child.try_wait()? {
            return Ok(status);
        }
        if Instant::now() >= until {
            return Err(io::Error::other("background_child_shutdown_timeout"));
        }
        std::thread::sleep(Duration::from_millis(50));
    }
}
