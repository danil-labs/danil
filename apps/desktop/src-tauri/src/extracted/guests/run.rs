//! Procesos cortos de un canal (`wsl.exe` hoy): siempre con plazo, stdout y
//! stderr drenados en paralelo y sin consola en Windows.
#![cfg_attr(not(windows), allow(dead_code))]

use super::{fail, ChannelKind, Failure};
use std::io::{BufRead, BufReader, Read, Write};
use std::process::{Child, Command, ExitStatus, Stdio};
use std::time::{Duration, Instant};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RunError {
    /// El programa no está en el PATH.
    Missing,
    /// No terminó dentro del plazo; se mató.
    Timeout,
    Io(String),
}

pub struct Ran {
    pub status: ExitStatus,
    pub stdout: Vec<u8>,
    pub stderr: Vec<u8>,
}

/// Corre `command` hasta que termine o venza `timeout`, con `stdin` escrito
/// desde un hilo (sin él, stdin va vacío).
pub fn run(
    command: &mut Command,
    stdin: Option<Vec<u8>>,
    timeout: Duration,
) -> Result<Ran, RunError> {
    crate::util::no_console_window(command);
    command
        .stdin(if stdin.is_some() {
            Stdio::piped()
        } else {
            Stdio::null()
        })
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut child = command.spawn().map_err(|error| match error.kind() {
        std::io::ErrorKind::NotFound => RunError::Missing,
        _ => RunError::Io(error.to_string()),
    })?;
    if let (Some(bytes), Some(mut pipe)) = (stdin, child.stdin.take()) {
        std::thread::spawn(move || {
            let _ = pipe.write_all(&bytes);
        });
    }

    // Los pipes se drenan en paralelo: si el proceso escribe más de lo que cabe
    // en el buffer, esperar sin leerlo lo dejaría bloqueado.
    let stdout = child
        .stdout
        .take()
        .map(|mut pipe| std::thread::spawn(move || read_all(&mut pipe)));
    let stderr = child
        .stderr
        .take()
        .map(|mut pipe| std::thread::spawn(move || read_all(&mut pipe)));

    let deadline = Instant::now() + timeout;
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if Instant::now() >= deadline => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(RunError::Timeout);
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(25)),
            Err(error) => return Err(RunError::Io(error.to_string())),
        }
    };

    Ok(Ran {
        status,
        stdout: stdout
            .and_then(|handle| handle.join().ok())
            .unwrap_or_default(),
        stderr: stderr
            .and_then(|handle| handle.join().ok())
            .unwrap_or_default(),
    })
}

fn read_all(pipe: &mut impl Read) -> Vec<u8> {
    let mut bytes = Vec::new();
    let _ = pipe.read_to_end(&mut bytes);
    bytes
}

/// Corre un script de `sh` dentro del huésped, por stdin (nunca en la línea
/// de comandos del anfitrión, que otros procesos ven), y pasa cada línea de la
/// salida a `on_line`. Devuelve el código de salida y lo último de stderr.
/// `command` ya trae el programa del canal y sus argumentos.
pub fn stream(
    kind: ChannelKind,
    mut command: Command,
    body: &str,
    timeout: Duration,
    on_line: &mut dyn FnMut(&str),
) -> Result<(i32, String), Failure> {
    command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut child = command.spawn().map_err(|e| match e.kind() {
        std::io::ErrorKind::NotFound => fail(
            &format!("{}_missing", kind.as_str()),
            command.get_program().to_string_lossy(),
        ),
        _ => fail("io", e.to_string()),
    })?;
    if let Some(mut stdin) = child.stdin.take() {
        let body = body.replace("\r\n", "\n");
        let _ = stdin.write_all(body.as_bytes());
    }
    let err = child.stderr.take().map(|mut pipe| {
        std::thread::spawn(move || {
            let mut bytes = Vec::new();
            let _ = pipe.read_to_end(&mut bytes);
            String::from_utf8_lossy(&bytes).into_owned()
        })
    });
    // stdout se lee en otro hilo: el plazo corre aunque el script se quede
    // callado, no sólo cuando llega una línea.
    let (lines, received) = std::sync::mpsc::channel::<Vec<u8>>();
    if let Some(out) = child.stdout.take() {
        std::thread::spawn(move || {
            for line in BufReader::new(out).split(b'\n').map_while(|l| l.ok()) {
                if lines.send(line).is_err() {
                    break;
                }
            }
        });
    }
    let deadline = Instant::now() + timeout;
    let timed_out = |child: &mut Child| {
        let _ = child.kill();
        let _ = child.wait();
        fail(&format!("{}_timeout", kind.as_str()), "script")
    };
    loop {
        let left = deadline.saturating_duration_since(Instant::now());
        match received.recv_timeout(left) {
            Ok(line) => {
                let text = String::from_utf8_lossy(&line);
                for part in text.split('\r') {
                    let part = part.trim_end();
                    if !part.is_empty() {
                        on_line(part);
                    }
                }
            }
            Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => break,
            Err(std::sync::mpsc::RecvTimeoutError::Timeout) => return Err(timed_out(&mut child)),
        }
    }
    let status = loop {
        match child.try_wait().map_err(|e| fail("io", e.to_string()))? {
            Some(status) => break status,
            None if Instant::now() >= deadline => return Err(timed_out(&mut child)),
            None => std::thread::sleep(Duration::from_millis(50)),
        }
    };
    let stderr = err.and_then(|h| h.join().ok()).unwrap_or_default();
    let tail: Vec<&str> = stderr.lines().filter(|l| !l.trim().is_empty()).collect();
    let tail = tail[tail.len().saturating_sub(6)..].join("\n");
    Ok((status.code().unwrap_or(-1), tail))
}
