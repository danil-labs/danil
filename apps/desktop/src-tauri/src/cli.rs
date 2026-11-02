use std::ffi::OsStr;
#[cfg(unix)]
use std::os::unix::process::CommandExt;

// Catálogo de args.rs del motor, más help y kn. `machines` es el grupo público
// de Danil Machines. Hasta el motor que lo tiene, el error es del motor, no
// abrir la ventana. No publicar este cliente antes de ese pin. `computers` es
// su alias oculto en el motor (lo llama el verify publicado); sale de aquí
// cuando el motor lo retire.
const COMMANDS: &[&str] = &[
    "account",
    "activity",
    "agent",
    "agent-context",
    "auth",
    "chat",
    "computers",
    "config",
    "context",
    "engine",
    "folder",
    "github",
    "guide",
    "handler",
    "harness",
    "help",
    "instances",
    "keep-awake",
    "kn",
    "machines",
    "mcp",
    "notify",
    "operation",
    "plugin",
    "portfolio",
    "run",
    "service",
    "skill",
    "space",
    "status",
    "task",
    "telegram",
    "vm",
    "workspace",
];
const GLOBAL_FLAGS: &[&str] = &[
    "--root",
    "--engine",
    "--profile",
    "--workspace",
    "--machine",
    "--folder",
    "--instance",
    "--request-id",
    "--timeout",
    "--no-wait",
    "--json",
    "--help",
    "-h",
    "--version",
    "-V",
];

pub fn requested(first: Option<&OsStr>) -> bool {
    first.and_then(OsStr::to_str).is_some_and(|arg| {
        COMMANDS.contains(&arg) || GLOBAL_FLAGS.contains(&arg.split('=').next().unwrap_or(arg))
    })
}

pub fn dispatch() {
    if !requested(std::env::args_os().nth(1).as_deref()) {
        return;
    }
    match forward() {
        Ok(code) => std::process::exit(code),
        Err(error) => {
            eprintln!("cli.error.engine_start_failed: {error}");
            std::process::exit(1);
        }
    }
}

// exec conserva los descriptores, las señales y el código de salida sin iniciar Tauri.
#[cfg(unix)]
fn forward() -> std::io::Result<i32> {
    let exe = std::env::current_exe()?.with_file_name("seldon-runtime");
    Err(std::process::Command::new(exe)
        .args(std::env::args_os().skip(1))
        .exec())
}

#[cfg(windows)]
fn forward() -> std::io::Result<i32> {
    use std::process::{Command, Stdio};
    let attached = attach_parent()?;
    let exe = std::env::current_exe()?.with_file_name("seldon-runtime.exe");
    let mut command = Command::new(exe);
    if !attached {
        crate::console::no_console_window(&mut command);
    }
    // proceso largo: a propósito. Una CLI puede observar un turno hasta que termine.
    let status = command
        .args(std::env::args_os().skip(1))
        .stdin(Stdio::inherit())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .status()?;
    Ok(status.code().unwrap_or(1))
}

#[cfg(windows)]
fn attach_parent() -> std::io::Result<bool> {
    use std::ffi::c_void;
    type Handle = *mut c_void;
    #[link(name = "kernel32")]
    extern "system" {
        fn AttachConsole(pid: u32) -> i32;
        fn GetStdHandle(which: u32) -> Handle;
        fn SetStdHandle(which: u32, handle: Handle) -> i32;
        fn GetFileType(handle: Handle) -> u32;
    }
    let streams = [-10i32 as u32, -11i32 as u32, -12i32 as u32];
    let saved = streams.map(|which| {
        let handle = unsafe { GetStdHandle(which) };
        let valid =
            !handle.is_null() && handle as isize != -1 && unsafe { GetFileType(handle) } != 0;
        (which, handle, valid)
    });
    // AttachConsole puede sustituir los handles; los pipes, archivos y NUL se conservan.
    let attached = unsafe { AttachConsole(u32::MAX) } != 0;
    if attached {
        for (which, handle, valid) in saved {
            if valid && unsafe { SetStdHandle(which, handle) } == 0 {
                return Err(std::io::Error::last_os_error());
            }
        }
    }
    Ok(attached)
}
