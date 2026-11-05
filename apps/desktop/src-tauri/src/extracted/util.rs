//! Utilidades exclusivamente de escritorio, sin rutas ni autoridad del dominio.
pub fn ext_of(path: &std::path::Path) -> String {
    path.extension()
        .and_then(|s| s.to_str())
        .unwrap_or_default()
        .to_lowercase()
}
pub use crate::console::no_console_window;
/// Clave del catálogo que traduce quien la pinta; el guarda `locales` la busca en `Frase::new`.
pub struct Frase(pub &'static str);
impl Frase {
    pub const fn new(clave: &'static str) -> Self {
        Self(clave)
    }
}

/// Espera a `command` hasta `timeout` y lo mata al vencer. No lee su salida: stdout y stderr van a null.
pub fn output_with_timeout(
    command: &mut std::process::Command,
    timeout: std::time::Duration,
) -> std::io::Result<std::process::ExitStatus> {
    use std::process::Stdio;
    let mut child = command
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()?;
    let deadline = std::time::Instant::now() + timeout;
    loop {
        if let Some(status) = child.try_wait()? {
            return Ok(status);
        }
        if std::time::Instant::now() >= deadline {
            let _ = child.kill();
            let _ = child.wait();
            return Err(std::io::ErrorKind::TimedOut.into());
        }
        std::thread::sleep(std::time::Duration::from_millis(200));
    }
}

/// Como `output_with_timeout`, pero guarda stdout y stderr. Los pipes se drenan
/// en paralelo para que un hijo que escribe mucho no se bloquee esperando lector.
pub fn captured_output_with_timeout(
    command: &mut std::process::Command,
    timeout: std::time::Duration,
) -> std::io::Result<std::process::Output> {
    use std::io::Read;
    use std::process::Stdio;
    let mut child = command
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()?;
    let drain = |pipe: Option<Box<dyn Read + Send>>| {
        pipe.map(|mut pipe| {
            std::thread::spawn(move || {
                let mut bytes = Vec::new();
                let _ = pipe.read_to_end(&mut bytes);
                bytes
            })
        })
    };
    let stdout = drain(
        child
            .stdout
            .take()
            .map(|p| Box::new(p) as Box<dyn Read + Send>),
    );
    let stderr = drain(
        child
            .stderr
            .take()
            .map(|p| Box::new(p) as Box<dyn Read + Send>),
    );
    let deadline = std::time::Instant::now() + timeout;
    let status = loop {
        if let Some(status) = child.try_wait()? {
            break status;
        }
        if std::time::Instant::now() >= deadline {
            let _ = child.kill();
            let _ = child.wait();
            return Err(std::io::ErrorKind::TimedOut.into());
        }
        std::thread::sleep(std::time::Duration::from_millis(50));
    };
    let join = |h: Option<std::thread::JoinHandle<Vec<u8>>>| {
        h.and_then(|h| h.join().ok()).unwrap_or_default()
    };
    Ok(std::process::Output {
        status,
        stdout: join(stdout),
        stderr: join(stderr),
    })
}

/// Quita el `%XX` de un tramo de URL; una secuencia rota o que no sea UTF-8 no da ruta.
pub fn decodificar(s: &str) -> Option<String> {
    let bytes = s.as_bytes();
    let mut salida = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' {
            let par = s.get(i + 1..i + 3)?;
            salida.push(u8::from_str_radix(par, 16).ok()?);
            i += 3;
        } else {
            salida.push(bytes[i]);
            i += 1;
        }
    }
    String::from_utf8(salida).ok()
}
