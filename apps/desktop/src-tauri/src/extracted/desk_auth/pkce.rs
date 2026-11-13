//! PKCE S256 con retorno por loopback (RFC 8252 § 7.3): el navegador del sistema
//! trae a `http://127.0.0.1:{puerto}/callback` un código que solo canjea quien
//! tiene el verificador. El puerto es efímero y se cierra con el primer callback
//! válido o al vencer el flujo.

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine as _;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::time::Duration;

/// Lo que trae el navegador al puerto local.
#[derive(Debug, PartialEq, Eq)]
pub(crate) enum Returned {
    Code(String),
    /// `identity` o AuthKit devolvieron `error=` (la persona canceló, por ejemplo).
    Denied(String),
}

pub(crate) struct Pkce {
    pub(crate) verifier: String,
    pub(crate) challenge: String,
    pub(crate) state: String,
    pub(crate) port: u16,
    listener: TcpListener,
}

pub(crate) fn random(len: usize) -> Option<String> {
    let mut bytes = vec![0u8; len];
    getrandom::fill(&mut bytes).ok()?;
    Some(URL_SAFE_NO_PAD.encode(bytes))
}

pub(crate) fn challenge_of(verifier: &str) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()))
}

impl Pkce {
    /// `state` de 256 bits y verificador de 256 bits; escucha solo en `127.0.0.1`.
    pub(crate) fn open() -> Option<Self> {
        let verifier = random(32)?;
        let challenge = challenge_of(&verifier);
        let state = random(32)?;
        let listener = TcpListener::bind("127.0.0.1:0").ok()?;
        let port = listener.local_addr().ok()?.port();
        listener.set_nonblocking(true).ok()?;
        Some(Self {
            verifier,
            challenge,
            state,
            port,
            listener,
        })
    }

    pub(crate) fn redirect_uri(&self) -> String {
        format!("http://127.0.0.1:{}/callback", self.port)
    }

    /// Una vuelta del navegador, sin bloquear. Otra petición (favicon, otro
    /// `state`) recibe un 400 y el flujo sigue esperando.
    pub(crate) fn poll(&self) -> std::io::Result<Option<Returned>> {
        match self.listener.accept() {
            Ok((mut stream, _)) => {
                let _ = stream.set_nonblocking(false);
                match callback(&mut stream) {
                    Some((returned, state)) if state == self.state => {
                        let ok = matches!(returned, Returned::Code(_));
                        answer_browser(&mut stream, ok);
                        Ok(Some(returned))
                    }
                    _ => {
                        answer_browser(&mut stream, false);
                        Ok(None)
                    }
                }
            }
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => Ok(None),
            Err(e) => Err(e),
        }
    }
}

/// Lee una petición del navegador; `Some((lo que trae, state))` si es `/callback`.
fn callback(stream: &mut TcpStream) -> Option<(Returned, String)> {
    stream.set_read_timeout(Some(Duration::from_secs(5))).ok()?;
    let mut buffer = [0u8; 8192];
    let read = stream.read(&mut buffer).ok()?;
    parse_request_line(&String::from_utf8_lossy(&buffer[..read]))
}

pub(crate) fn parse_request_line(head: &str) -> Option<(Returned, String)> {
    let target = head
        .lines()
        .next()?
        .strip_prefix("GET ")?
        .split(' ')
        .next()?;
    let query = url_query(target.strip_prefix("/callback?")?);
    let state = query.get("state")?.clone();
    if let Some(code) = query.get("code").filter(|c| !c.is_empty()) {
        return Some((Returned::Code(code.clone()), state));
    }
    let denied = query.get("error")?.clone();
    Some((Returned::Denied(denied), state))
}

pub(crate) fn url_query(query: &str) -> HashMap<String, String> {
    query
        .split('&')
        .filter_map(|pair| pair.split_once('='))
        .map(|(k, v)| (decode(k), decode(v)))
        .collect()
}

fn decode(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'%' if i + 3 <= bytes.len() => {
                let hex = std::str::from_utf8(&bytes[i + 1..i + 3]).unwrap_or("");
                match u8::from_str_radix(hex, 16) {
                    Ok(b) => {
                        out.push(b);
                        i += 3;
                        continue;
                    }
                    Err(_) => out.push(b'%'),
                }
            }
            b'+' => out.push(b' '),
            b => out.push(b),
        }
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Codifica un valor de query (RFC 3986: solo los no reservados quedan igual).
pub(crate) fn encode(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for b in value.bytes() {
        if b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.' | b'~') {
            out.push(b as char);
        } else {
            out.push_str(&format!("%{b:02X}"));
        }
    }
    out
}

fn answer_browser(stream: &mut TcpStream, ok: bool) {
    let text = if ok {
        "Listo. Vuelve a Danil. / Done. Go back to Danil."
    } else {
        "No se pudo conectar. / Could not connect."
    };
    let body = format!("<!doctype html><meta charset=utf-8><title>Danil</title><p style=\"font-family:system-ui;padding:48px\">{text}</p>");
    let _ = write!(
        stream,
        "HTTP/1.1 {}\r\nContent-Type: text/html; charset=utf-8\r\nCache-Control: no-store\r\nReferrer-Policy: no-referrer\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        if ok { "200 OK" } else { "400 Bad Request" },
        body.len()
    );
}
