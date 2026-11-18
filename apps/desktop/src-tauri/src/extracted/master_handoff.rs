use core_foundation::{base::TCFType, string::CFString, url::CFURL};
use security_framework::os::macos::{
    code_signing::{Flags, GuestAttributes, SecCode, SecRequirement, SecStaticCode},
    keychain::SecKeychain,
};
use std::{
    fs::File,
    io::{Read, Write},
    os::{
        fd::{AsRawFd, FromRawFd},
        unix::process::CommandExt,
    },
    path::Path,
    process::{Command, Stdio},
    time::{Duration, Instant},
};
use zeroize::Zeroizing;

// `danil-engine` se firma con `--identifier seldon-runtime` (`scripts/macos-codesign/codesign`);
// aceptar también `danil-engine` deja cambiar el identificador sin otra ventana.
const REQUIREMENT: &str = r#"(identifier "seldon-runtime" or identifier "danil-engine") and anchor apple generic and certificate leaf[subject.OU] = "ATG57AXYTS""#;
const WINDOW_REQUIREMENT: &str = r#"identifier "ai.danil.terminus" and anchor apple generic and certificate leaf[subject.OU] = "ATG57AXYTS""#;

pub fn prepare(exe: &Path, identity: &str, command: &mut Command) -> Option<File> {
    if !signed_window() || !trusted(exe) || !help_output_with_timeout(exe) {
        return None;
    }
    let master = read_master(identity)?;
    let (read, mut write) = pipe().ok()?;
    // Cabe en el pipe vacío: se borra la copia antes de crear el hijo.
    write.write_all(&master).ok()?;
    drop(master);
    drop(write);
    let fd = read.as_raw_fd();
    command.arg("--master-fd").arg(fd.to_string());
    // Solo el hijo quita CLOEXEC; el padre conserva el descriptor privado hasta spawn.
    unsafe {
        command.pre_exec(move || {
            if libc::fcntl(fd, libc::F_SETFD, 0) == -1 {
                return Err(std::io::Error::last_os_error());
            }
            Ok(())
        });
    }
    Some(read)
}

pub(super) fn signed_window() -> bool {
    let Ok(requirement) = WINDOW_REQUIREMENT.parse::<SecRequirement>() else {
        return false;
    };
    SecCode::for_self(Flags::NONE)
        .and_then(|code| code.check_validity(Flags::NONE, &requirement))
        .is_ok()
}

pub(super) fn trusted(exe: &Path) -> bool {
    let Some(url) = CFURL::from_path(exe, false) else {
        return false;
    };
    let Ok(requirement) = REQUIREMENT.parse::<SecRequirement>() else {
        return false;
    };
    SecStaticCode::from_path(&url, Flags::NONE)
        .and_then(|code| code.check_validity(Flags::CHECK_ALL_ARCHITECTURES, &requirement))
        .is_ok()
}

fn read_master(identity: &str) -> Option<Zeroizing<Vec<u8>>> {
    let allowed = SecKeychain::user_interaction_allowed().ok()?;
    let _interaction = if allowed {
        Some(SecKeychain::disable_user_interaction().ok()?)
    } else {
        None
    };
    let master = Zeroizing::new(
        security_framework::passwords::generic_password(noninteractive_options(identity)).ok()?,
    );
    (master.len() == 64 && master.iter().all(u8::is_ascii_hexdigit)).then(|| {
        let mut master = master;
        master.make_ascii_lowercase();
        master
    })
}

/// El padre no entrega nada hasta validar la firma del PID realmente lanzado.
pub(super) fn waiting_pipe(command: &mut Command) -> std::io::Result<(File, File)> {
    let (read, write) = pipe()?;
    let fd = read.as_raw_fd();
    command.arg("--master-fd").arg(fd.to_string());
    unsafe {
        command.pre_exec(move || {
            if libc::fcntl(fd, libc::F_SETFD, 0) == -1 {
                return Err(std::io::Error::last_os_error());
            }
            Ok(())
        });
    }
    Ok((read, write))
}

pub(super) fn deliver(mut write: File, pid: u32, identity: &str) -> std::io::Result<()> {
    let requirement = REQUIREMENT
        .parse::<SecRequirement>()
        .map_err(|_| std::io::Error::other("background_signature_invalid"))?;
    let mut attributes = GuestAttributes::new();
    attributes.set_pid(
        i32::try_from(pid).map_err(|_| std::io::Error::other("background_signature_invalid"))?,
    );
    SecCode::copy_guest_with_attribues(None, &attributes, Flags::NONE)
        .and_then(|code| code.check_validity(Flags::NONE, &requirement))
        .map_err(|_| std::io::Error::other("background_signature_invalid"))?;
    let master = read_master(identity)
        .ok_or_else(|| std::io::Error::other("background_existing_master_unavailable"))?;
    // 64 bytes caben en el pipe vacío; nonblock convierte cualquier anomalía en fallo sin espera.
    if unsafe { libc::fcntl(write.as_raw_fd(), libc::F_SETFL, libc::O_NONBLOCK) } == -1 {
        return Err(std::io::Error::last_os_error());
    }
    write.write_all(&master)
}

fn noninteractive_options(identity: &str) -> security_framework::passwords::PasswordOptions {
    use security_framework_sys::item::{kSecUseAuthenticationUI, kSecUseAuthenticationUISkip};
    let mut options =
        security_framework::passwords::PasswordOptions::new_generic_password(identity, "boveda");
    // PasswordOptions no expone un setter para impedir la UI en SecItemCopyMatching.
    #[allow(deprecated)]
    unsafe {
        options.query.push((
            CFString::wrap_under_get_rule(kSecUseAuthenticationUI),
            CFString::wrap_under_get_rule(kSecUseAuthenticationUISkip).into_CFType(),
        ));
    }
    options
}

fn pipe() -> std::io::Result<(File, File)> {
    let mut fds = [-1; 2];
    if unsafe { libc::pipe(fds.as_mut_ptr()) } == -1 {
        return Err(std::io::Error::last_os_error());
    }
    let original = unsafe { File::from_raw_fd(fds[0]) };
    let write = unsafe { File::from_raw_fd(fds[1]) };
    // Un stdio cerrado no puede hacer que el descriptor entregado sea 0, 1 o 2.
    let fd = unsafe { libc::fcntl(original.as_raw_fd(), libc::F_DUPFD_CLOEXEC, 3) };
    if fd == -1 {
        return Err(std::io::Error::last_os_error());
    }
    let read = unsafe { File::from_raw_fd(fd) };
    drop(original);
    if unsafe { libc::fcntl(write.as_raw_fd(), libc::F_SETFD, libc::FD_CLOEXEC) } == -1 {
        return Err(std::io::Error::last_os_error());
    }
    Ok((read, write))
}

#[cfg(target_os = "macos")]
fn help_output_with_timeout(exe: &Path) -> bool {
    let Ok(mut child) = Command::new(exe)
        .arg("--help")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
    else {
        return false;
    };
    let found = (|| -> std::io::Result<bool> {
        let Some(mut stdout) = child.stdout.take() else {
            return Ok(false);
        };
        let fd = stdout.as_raw_fd();
        if unsafe { libc::fcntl(fd, libc::F_SETFL, libc::O_NONBLOCK) } == -1 {
            return Err(std::io::Error::last_os_error());
        }
        let deadline = Instant::now() + Duration::from_secs(3);
        let mut output = Vec::new();
        let mut buffer = [0; 4096];
        let mut exited = None;
        loop {
            match stdout.read(&mut buffer) {
                Ok(0) if exited.is_some() => {
                    return Ok(exited
                        .is_some_and(|status: std::process::ExitStatus| status.success())
                        && String::from_utf8_lossy(&output).contains("--master-fd"));
                }
                Ok(n) => output.extend_from_slice(&buffer[..n]),
                Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {}
                Err(e) => return Err(e),
            }
            if output.len() > 65536 || Instant::now() >= deadline {
                return Ok(false);
            }
            if exited.is_none() {
                exited = child.try_wait()?;
            }
            std::thread::sleep(Duration::from_millis(10));
        }
    })()
    .unwrap_or(false);
    let _ = child.kill();
    let _ = child.wait();
    found
}

#[cfg(test)]
mod tests {
    use security_framework::os::macos::code_signing::SecRequirement;

    #[test]
    fn the_engine_requirement_accepts_both_identifiers() {
        assert!(super::REQUIREMENT.parse::<SecRequirement>().is_ok());
        assert!(super::WINDOW_REQUIREMENT.parse::<SecRequirement>().is_ok());
    }
}
