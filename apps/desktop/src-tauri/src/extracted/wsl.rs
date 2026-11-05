//! Detección de WSL en Windows: lista de distros, su estado y el que viene por
//! omisión. `wsl.exe` escribe UTF-16LE salvo con `WSL_UTF8`; se decodifica
//! antes de parsear (`docs/wsl-onboarding.md`).
//!
//! En Linux sólo los tests usan el parser; la detección existe en Windows.
#![allow(dead_code)]

use serde::Serialize;

/// Una distro tal como la ve la ventana. `state` se guarda crudo: `wsl.exe` lo
/// traduce al idioma de Windows.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Distro {
    pub name: String,
    pub state: String,
    /// `None` si sólo se pudo leer la lista corta (`--list --quiet`).
    pub version: Option<u8>,
    pub default: bool,
}

impl Distro {
    pub fn running(&self) -> bool {
        state_is(&self.state, &["running", "en ejecución", "en ejecucion"])
    }

    pub fn stopped(&self) -> bool {
        state_is(&self.state, &["stopped", "detenido", "detenida"])
    }

    pub fn installing(&self) -> bool {
        state_is(&self.state, &["installing", "instalando"])
    }
}

fn state_is(state: &str, names: &[&str]) -> bool {
    let state = state.trim().to_lowercase();
    names.contains(&state.as_str())
}

/// Lo que `wsl.exe --status` alcanza a decir. Todo es opcional: el texto cambia
/// entre versiones y viene localizado.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
pub struct Status {
    pub default_distro: Option<String>,
    pub default_version: Option<u8>,
    pub kernel: Option<String>,
}

impl Status {
    fn is_empty(&self) -> bool {
        self.default_distro.is_none() && self.default_version.is_none() && self.kernel.is_none()
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Detection {
    pub distros: Vec<Distro>,
    pub default_distro: Option<String>,
    pub default_version: Option<u8>,
    pub status: Option<Status>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum WslError {
    /// La ventana no corre en Windows; aquí no hay WSL que detectar.
    Unsupported,
    /// `wsl.exe` no está en el PATH: falta el componente de Windows.
    NotInstalled,
    /// `wsl.exe` no contestó dentro del plazo.
    Timeout,
    Io(String),
    Failed {
        code: Option<i32>,
        detail: String,
    },
}

impl WslError {
    pub fn code(&self) -> &'static str {
        match self {
            Self::Unsupported => "unsupported",
            Self::NotInstalled => "wsl_missing",
            Self::Timeout => "wsl_timeout",
            Self::Io(_) => "io",
            Self::Failed { .. } => "wsl_failed",
        }
    }
}

impl std::fmt::Display for WslError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Unsupported => write!(f, "wsl is only available on windows"),
            Self::NotInstalled => write!(f, "wsl.exe was not found"),
            Self::Timeout => write!(f, "wsl.exe did not answer in time"),
            Self::Io(detail) => write!(f, "wsl: {detail}"),
            Self::Failed { code, detail } => write!(f, "wsl failed ({code:?}): {detail}"),
        }
    }
}

impl std::error::Error for WslError {}

/// Detecta los distros y su estado. En Windows corre tres comandos: la lista
/// larga, la corta (nombres) y `--status` para el default.
#[cfg(windows)]
pub fn detect() -> Result<Detection, WslError> {
    let verbose = run(&["--list", "--verbose"])?;
    let names = run(&["--list", "--quiet"])
        .map(|text| parse_names(&text))
        .unwrap_or_default();
    let status = run(&["--status"]).ok().and_then(|text| parse_status(&text));
    Ok(compose(&verbose, &names, status))
}

/// Junta lo que contestaron los tres comandos. El `*` de la lista manda sobre
/// el default de `--status`, que a su vez sirve cuando no hay lista.
#[cfg(any(windows, test))]
fn compose(verbose: &str, names: &[String], status: Option<Status>) -> Detection {
    let mut distros = parse_verbose(verbose, names);
    // Una lista larga que no se pudo leer no debe borrar los nombres que sí
    // llegaron: se muestran sin estado ni versión, que es lo que se sabe.
    if distros.is_empty() && !names.is_empty() {
        distros = names
            .iter()
            .map(|name| Distro {
                name: name.clone(),
                state: String::new(),
                version: None,
                default: false,
            })
            .collect();
    }

    let default_distro = distros
        .iter()
        .find(|distro| distro.default)
        .map(|distro| distro.name.clone())
        .or_else(|| {
            status
                .as_ref()
                .and_then(|status| status.default_distro.clone())
        });
    let default_version = status
        .as_ref()
        .and_then(|status| status.default_version)
        .or_else(|| distros.first().and_then(|distro| distro.version));

    Detection {
        distros,
        default_distro,
        default_version,
        status,
    }
}

#[cfg(not(windows))]
pub fn detect() -> Result<Detection, WslError> {
    Err(WslError::Unsupported)
}

/// `--list --quiet`: un nombre por línea, sin encabezado ni estado.
pub fn parse_names(text: &str) -> Vec<String> {
    clean_lines(text)
        .into_iter()
        .map(|line| line.trim_start_matches('*').trim().to_string())
        .filter(|line| !line.is_empty() && !is_no_distros(line))
        .collect()
}

/// `--list --verbose`: `* NOMBRE  ESTADO  VERSIÓN`. El nombre se busca en
/// `names` para tolerar espacios y estados de dos palabras («En ejecución»).
pub fn parse_verbose(text: &str, names: &[String]) -> Vec<Distro> {
    let mut distros = Vec::new();
    for line in clean_lines(text) {
        let (default, rest) = match line.strip_prefix('*') {
            Some(rest) => (true, rest.trim_start()),
            None => (false, line.as_str()),
        };
        let Some((name, state, version)) = split_row(rest, names) else {
            continue;
        };
        distros.push(Distro {
            name,
            state,
            version,
            default,
        });
    }
    distros
}

/// `--status`: etiquetas en inglés o español; lo que no se reconozca se ignora.
pub fn parse_status(text: &str) -> Option<Status> {
    let mut status = Status::default();
    for line in clean_lines(text) {
        let Some((label, value)) = line.split_once(':') else {
            continue;
        };
        let label = label.trim().to_lowercase();
        let value = value.trim().trim_matches('"').trim().to_string();
        if value.is_empty() {
            continue;
        }
        if label.contains("default distribution")
            || label.contains("distribución predeterminada")
            || label.contains("distribucion predeterminada")
        {
            status.default_distro = Some(value);
        } else if label.contains("default version")
            || label.contains("versión predeterminada")
            || label.contains("version predeterminada")
        {
            status.default_version = value.parse::<u8>().ok();
        } else if label.contains("kernel") || label.contains("núcleo") || label.contains("nucleo")
        {
            status.kernel = Some(value);
        }
    }
    (!status.is_empty()).then_some(status)
}

/// `wsl.exe` escribe UTF-16LE cuando la salida no va a una consola. Con
/// `WSL_UTF8=1` escribe UTF-8; se aceptan las dos.
pub fn decode(bytes: &[u8]) -> String {
    let (bom, body) = match bytes {
        [0xFF, 0xFE, rest @ ..] => (true, rest),
        _ => (false, bytes),
    };
    let text = if bom || looks_utf16le(body) {
        let units: Vec<u16> = body
            .chunks_exact(2)
            .map(|pair| u16::from_le_bytes([pair[0], pair[1]]))
            .collect();
        String::from_utf16_lossy(&units)
    } else if std::str::from_utf8(body).is_ok() {
        String::from_utf8_lossy(body).into_owned()
    } else if body.len() % 2 == 0 {
        // Un texto UTF-16LE con caracteres no latinos no siempre delata el NUL
        // de cada byte alto; si no es UTF-8 válido y el largo es par, es esto.
        let units: Vec<u16> = body
            .chunks_exact(2)
            .map(|pair| u16::from_le_bytes([pair[0], pair[1]]))
            .collect();
        String::from_utf16_lossy(&units)
    } else {
        String::from_utf8_lossy(body).into_owned()
    };
    text.trim_end_matches('\0').to_string()
}

fn looks_utf16le(bytes: &[u8]) -> bool {
    let pairs = bytes.len() / 2;
    if pairs < 2 {
        return false;
    }
    let zeros = bytes
        .iter()
        .skip(1)
        .step_by(2)
        .filter(|byte| **byte == 0)
        .count();
    zeros * 4 >= pairs * 3
}

fn clean_lines(text: &str) -> Vec<String> {
    text.split('\n')
        .map(|line| line.replace('\0', "").trim().to_string())
        .filter(|line| !line.is_empty())
        .collect()
}

/// `(nombre, estado, versión)`. Primero por nombre conocido; si no hay lista
/// corta, por la derecha: la versión es el último token.
fn split_row(rest: &str, names: &[String]) -> Option<(String, String, Option<u8>)> {
    if let Some((name, tail)) = match_name(rest, names) {
        let (state, version) = split_state_version(tail)?;
        return Some((name, state, Some(version)));
    }
    let tokens: Vec<&str> = rest.split_whitespace().collect();
    if tokens.len() < 3 {
        return None;
    }
    let version = tokens.last()?.parse::<u8>().ok()?;
    if version != 1 && version != 2 {
        return None;
    }
    let state = tokens.get(tokens.len() - 2)?.to_string();
    let name = tokens[..tokens.len() - 2].join(" ");
    (!name.is_empty()).then_some((name, state, Some(version)))
}

/// El nombre más largo de `names` que empieza `rest` y termina en un espacio.
fn match_name<'a>(rest: &'a str, names: &[String]) -> Option<(String, &'a str)> {
    let mut best: Option<&String> = None;
    for name in names {
        if name.is_empty() || !rest.starts_with(name.as_str()) {
            continue;
        }
        let boundary = rest.len() == name.len()
            || rest
                .get(name.len()..)
                .is_some_and(|tail| tail.starts_with(char::is_whitespace));
        if boundary && best.is_none_or(|current| name.len() > current.len()) {
            best = Some(name);
        }
    }
    best.map(|name| {
        (
            name.clone(),
            rest.get(name.len()..).unwrap_or_default().trim_start(),
        )
    })
}

fn split_state_version(tail: &str) -> Option<(String, u8)> {
    let (state, version) = tail.trim().rsplit_once(char::is_whitespace)?;
    let version = version.trim().parse::<u8>().ok()?;
    if version != 1 && version != 2 {
        return None;
    }
    let state = state.trim();
    (!state.is_empty()).then(|| (state.to_string(), version))
}

/// El plazo cubre a `wsl.exe`; se compila también en las pruebas de otras
/// plataformas para no dejar el camino de Windows sin type-check.
#[cfg(any(windows, test))]
fn run(args: &[&str]) -> Result<String, WslError> {
    use std::process::{Command, Stdio};
    use std::time::{Duration, Instant};

    const PLAZO_SIN_AVANCE: Duration = Duration::from_secs(15);

    let mut command = Command::new("wsl.exe");
    crate::util::no_console_window(&mut command);
    command
        .args(args)
        .env("WSL_UTF8", "1")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut child = command.spawn().map_err(|error| match error.kind() {
        std::io::ErrorKind::NotFound => WslError::NotInstalled,
        _ => WslError::Io(error.to_string()),
    })?;

    // Los pipes se drenan en paralelo: si `wsl.exe` escribe más de lo que cabe
    // en el buffer, esperar sin leerlo lo dejaría bloqueado.
    let stdout = child
        .stdout
        .take()
        .map(|mut pipe| std::thread::spawn(move || read_all(&mut pipe)));
    let stderr = child
        .stderr
        .take()
        .map(|mut pipe| std::thread::spawn(move || read_all(&mut pipe)));

    let deadline = Instant::now() + PLAZO_SIN_AVANCE;
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if Instant::now() >= deadline => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(WslError::Timeout);
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(25)),
            Err(error) => return Err(WslError::Io(error.to_string())),
        }
    };

    let out = decode(
        &stdout
            .and_then(|handle| handle.join().ok())
            .unwrap_or_default(),
    );
    let err = decode(
        &stderr
            .and_then(|handle| handle.join().ok())
            .unwrap_or_default(),
    );
    if status.success() || is_no_distros(&out) || is_no_distros(&err) {
        return Ok(out);
    }
    if looks_unavailable(&out) || looks_unavailable(&err) {
        return Err(WslError::NotInstalled);
    }
    Err(WslError::Failed {
        code: status.code(),
        detail: first_line(&err)
            .or_else(|| first_line(&out))
            .unwrap_or_default(),
    })
}

#[cfg(any(windows, test))]
fn read_all(pipe: &mut impl std::io::Read) -> Vec<u8> {
    let mut bytes = Vec::new();
    let _ = pipe.read_to_end(&mut bytes);
    bytes
}

/// Un `wsl.exe` sin la característica habilitada contesta con el aviso de
/// copyright y el uso general, no con una lista.
fn looks_unavailable(text: &str) -> bool {
    let text = text.to_lowercase();
    // Sin el paquete de WSL, el `wsl.exe` de Windows contesta en el idioma del
    // sistema (y en UTF-16 aunque haya `WSL_UTF8`).
    text.contains("usage: wsl.exe")
        || text.contains("optional component is not enabled")
        || text.contains("wsl is not installed")
        || text.contains("windows subsystem for linux is not installed")
        || text.contains("subsistema de windows para linux no está instalado")
        || text.contains("subsistema de windows para linux no esta instalado")
}

fn is_no_distros(text: &str) -> bool {
    let text = text.to_lowercase();
    text.contains("no installed distributions")
        || text.contains("no distributions")
        || text.contains("no tiene distribuciones instaladas")
        || text.contains("no hay distribuciones instaladas")
}

#[cfg(any(windows, test))]
fn first_line(text: &str) -> Option<String> {
    clean_lines(text)
        .into_iter()
        .find(|line| !line.to_lowercase().starts_with("copyright (c)"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn utf16(text: &str) -> Vec<u8> {
        let mut bytes = vec![0xFF, 0xFE];
        for unit in text.encode_utf16() {
            bytes.extend_from_slice(&unit.to_le_bytes());
        }
        bytes
    }

    fn distro(name: &str, state: &str, version: u8, default: bool) -> Distro {
        Distro {
            name: name.into(),
            state: state.into(),
            version: Some(version),
            default,
        }
    }

    #[test]
    fn decodes_utf16le_with_bom() {
        let text = "  NAME  STATE  VERSION\r\n* Ubuntu  Running  2\r\n";
        assert_eq!(decode(&utf16(text)), text);
    }

    #[test]
    fn decodes_utf16le_without_bom() {
        let mut bytes = Vec::new();
        for unit in "Ubuntu".encode_utf16() {
            bytes.extend_from_slice(&unit.to_le_bytes());
        }
        assert_eq!(decode(&bytes), "Ubuntu");
    }

    #[test]
    fn decodes_utf8_when_wsl_utf8_is_set() {
        let text = "* Ubuntu  Running  2\n";
        assert_eq!(decode(text.as_bytes()), text);
    }

    #[test]
    fn decodes_accented_utf8() {
        let text = "Distribución predeterminada: Ubuntu\n";
        assert_eq!(decode(text.as_bytes()), text);
    }

    #[test]
    fn parses_verbose_list_and_marks_the_default() {
        let text = "  NAME            STATE           VERSION\n\
                    * Ubuntu          Running         2\n\
                      Debian          Stopped         2\n\
                      Legacy          Stopped         1\n";
        let distros = parse_verbose(text, &[]);
        assert_eq!(
            distros,
            vec![
                distro("Ubuntu", "Running", 2, true),
                distro("Debian", "Stopped", 2, false),
                distro("Legacy", "Stopped", 1, false),
            ]
        );
    }

    #[test]
    fn compose_prefers_the_star_over_status() {
        let names = vec!["Ubuntu".to_string(), "Debian".to_string()];
        let detection = compose(
            "* Ubuntu  Running  2\n  Debian  Stopped  2\n",
            &names,
            Some(Status {
                default_distro: Some("Debian".into()),
                default_version: Some(2),
                kernel: None,
            }),
        );
        assert_eq!(detection.default_distro.as_deref(), Some("Ubuntu"));
        assert_eq!(detection.default_version, Some(2));
    }

    #[test]
    fn compose_falls_back_to_status_without_a_star() {
        let names = vec!["Ubuntu".to_string()];
        let detection = compose(
            "  Ubuntu  Running  2\n",
            &names,
            Some(Status {
                default_distro: Some("Ubuntu".into()),
                default_version: Some(2),
                kernel: None,
            }),
        );
        assert_eq!(detection.default_distro.as_deref(), Some("Ubuntu"));
        assert_eq!(detection.default_version, Some(2));
    }

    #[test]
    fn compose_keeps_quiet_names_when_the_verbose_list_is_unreadable() {
        let names = vec!["Ubuntu".to_string(), "Debian".to_string()];
        let detection = compose("basura\n", &names, None);
        assert_eq!(detection.distros.len(), 2);
        assert_eq!(detection.distros[0].name, "Ubuntu");
        assert_eq!(detection.distros[0].version, None);
    }

    #[test]
    fn uses_quiet_names_to_keep_spaces_and_localized_states() {
        let names = vec!["Ubuntu Preview".to_string(), "Mi Distro".to_string()];
        let text = "  NAME            STATE           VERSION\n\
                    * Ubuntu Preview  Running         2\n\
                      Mi Distro       En ejecución    2\n";
        let distros = parse_verbose(text, &names);
        assert_eq!(distros[0].name, "Ubuntu Preview");
        assert!(distros[0].default);
        assert_eq!(distros[1].name, "Mi Distro");
        assert_eq!(distros[1].state, "En ejecución");
        assert!(distros[1].running());
    }

    #[test]
    fn a_longer_name_wins_over_its_prefix() {
        let names = vec!["Ubuntu".to_string(), "Ubuntu Preview".to_string()];
        let text = "* Ubuntu Preview  Running  2\n";
        let distros = parse_verbose(text, &names);
        assert_eq!(distros[0].name, "Ubuntu Preview");
        assert_eq!(distros[0].state, "Running");
    }

    #[test]
    fn ignores_headers_blank_lines_and_nul_padding() {
        let text = "\n  NAME  STATE  VERSION\n\n\0\n";
        assert!(parse_verbose(text, &[]).is_empty());
    }

    #[test]
    fn parse_names_reads_the_quiet_list() {
        assert_eq!(
            parse_names("Ubuntu-22.04\r\nDebian\r\n\r\n"),
            vec!["Ubuntu-22.04".to_string(), "Debian".to_string()]
        );
    }

    #[test]
    fn parse_names_drops_the_no_distros_message() {
        assert!(
            parse_names("Windows Subsystem for Linux has no installed distributions.\r\n")
                .is_empty()
        );
    }

    #[test]
    fn parses_status_in_english_and_spanish() {
        let english = parse_status(
            "Default Distribution: Ubuntu\nDefault Version: 2\n\nKernel version: 5.15.90.1\n",
        )
        .expect("status");
        assert_eq!(english.default_distro.as_deref(), Some("Ubuntu"));
        assert_eq!(english.default_version, Some(2));
        assert_eq!(english.kernel.as_deref(), Some("5.15.90.1"));

        let spanish =
            parse_status("Distribución predeterminada: Ubuntu\nVersión predeterminada: 2\n")
                .expect("status");
        assert_eq!(spanish.default_distro.as_deref(), Some("Ubuntu"));
        assert_eq!(spanish.default_version, Some(2));
    }

    #[test]
    fn unrecognized_status_is_none() {
        assert_eq!(parse_status("Windows Subsystem for Linux\n"), None);
        assert_eq!(parse_status(""), None);
    }

    #[test]
    fn recognizes_the_no_distros_messages() {
        assert!(is_no_distros(
            "Windows Subsystem for Linux has no installed distributions."
        ));
        assert!(is_no_distros(
            "El Subsistema de Windows para Linux no tiene distribuciones instaladas."
        ));
        assert!(!is_no_distros("Ubuntu  Running  2"));
    }

    #[test]
    fn usage_output_means_wsl_is_unavailable() {
        let text = "Copyright (c) Microsoft Corporation. All rights reserved.\n\nUsage: wsl.exe [Argument]\n";
        assert!(looks_unavailable(text));
        assert!(!looks_unavailable("Ubuntu  Running  2"));
    }

    #[test]
    fn the_inbox_stub_in_spanish_means_wsl_is_unavailable() {
        let stub = utf16(
            "El Subsistema de Windows para Linux no está instalado. Para instalar, ejecute \"wsl.exe --install\".\r\n\r\nPara obtener más información, visite https://aka.ms/wslinstall\r\n",
        );
        assert!(looks_unavailable(&decode(&stub)));
    }

    #[test]
    fn first_line_skips_the_copyright_banner() {
        let text = "Copyright (c) Microsoft Corporation. All rights reserved.\n\nUsage: wsl.exe [Argument]\n";
        assert_eq!(
            first_line(text).as_deref(),
            Some("Usage: wsl.exe [Argument]")
        );
    }

    #[test]
    fn a_verbose_row_without_a_known_version_is_skipped() {
        let text = "  NAME  STATE  VERSION\n  Raro  Running  preview\n";
        assert!(parse_verbose(text, &[]).is_empty());
    }

    #[cfg(not(windows))]
    #[test]
    fn detect_is_unsupported_off_windows() {
        assert_eq!(detect(), Err(WslError::Unsupported));
    }

    /// Prueba manual en una Windows con WSL y al menos una distro:
    /// `cargo test wsl::tests::detect_real_wsl -- --ignored --nocapture`.
    #[cfg(windows)]
    #[test]
    #[ignore = "necesita WSL con al menos una distro"]
    fn detect_real_wsl() {
        let detection = detect().expect("wsl");
        println!("{detection:#?}");
        assert!(!detection.distros.is_empty(), "WSL no tiene distros");
    }
}
