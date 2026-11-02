//! Contrato RPC1 conservado de harness-app 96dba061, Apache-2.0.
//! El contrato no importa el motor ni la ventana.

use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const VERSION: u32 = 1;
pub const MAX_FRAME: u64 = 16 * 1024 * 1024;

#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Request {
    pub version: u32,
    pub token: String,
    pub workspace: Option<String>,
    pub folder: Option<String>,
    pub command: String,
    pub args: Value,
    pub request_id: String,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct Error {
    pub code: String,
    pub message_key: String,
    pub detail: Value,
}

impl Error {
    pub fn new(code: &str) -> Self {
        Self {
            code: code.into(),
            message_key: format!("cli.error.{code}"),
            detail: Value::Null,
        }
    }
}
impl From<String> for Error {
    fn from(value: String) -> Self {
        Self {
            detail: Value::String(value),
            ..Self::new("operation_failed")
        }
    }
}
impl From<std::io::Error> for Error {
    fn from(_: std::io::Error) -> Self {
        Self::new("io")
    }
}
impl From<serde_json::Error> for Error {
    fn from(_: serde_json::Error) -> Self {
        Self::new("invalid_request")
    }
}

pub type Result<T> = std::result::Result<T, Error>;

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct Response {
    pub version: u32,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub request_id: String,
    pub result: Option<Value>,
    pub error: Option<Error>,
}
impl Response {
    pub fn new(id: String, result: Result<Value>) -> Self {
        let (result, error) = match result {
            Ok(v) => (Some(v), None),
            Err(e) => (None, Some(e)),
        };
        Self {
            version: VERSION,
            request_id: id,
            result,
            error,
        }
    }
}

pub const PRODUCT: &str = "plan-seldon-existing-runtime";
pub const MANIFEST: &str = include_str!("../commands.json");

/// Copias de los manifiestos de extensión del motor (`seldon-host`
/// `crates/engine-manifest/extensions/`): órdenes aditivas que no entran en la
/// huella. La ventana las despacha igual que las del contrato; con un motor que
/// no las conoce, la orden falla sola y esa función se apaga.
pub const EXTENSIONS: &[&str] = &[
    include_str!("../extensions/orchestrators.json"),
    include_str!("../extensions/engine_update_v1.json"),
    include_str!("../extensions/machine_usage_v1.json"),
    include_str!("../extensions/secrets_v1.json"),
    include_str!("../extensions/artifact_parts_v1.json"),
    include_str!("../extensions/task-lifecycle-v1.json"),
    include_str!("../extensions/attachment_documents_v1.json"),
    include_str!("../extensions/provider_handoff_v1.json"),
];

/// Las órdenes del contrato más las de las extensiones. La huella sigue siendo
/// solo de [`MANIFEST`].
pub fn full_manifest() -> serde_json::Value {
    let mut manifest: serde_json::Value =
        serde_json::from_str(MANIFEST).expect("frozen command manifest");
    for raw in EXTENSIONS {
        let ext: serde_json::Value = serde_json::from_str(raw).expect("extension manifest");
        let extra = ext["commands"].as_array().cloned().unwrap_or_default();
        if let Some(list) = manifest["commands"].as_array_mut() {
            for command in extra {
                if !list.iter().any(|c| c["name"] == command["name"]) {
                    list.push(command);
                }
            }
        }
    }
    manifest
}

#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(deny_unknown_fields)]
pub struct Endpoint {
    pub version: u32,
    pub product: String,
    pub runtime: String,
    pub pid: u32,
    pub executable: std::path::PathBuf,
    pub address: std::net::SocketAddr,
    pub contract: String,
    pub data_directory: std::path::PathBuf,
    pub token_file: std::path::PathBuf,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(deny_unknown_fields)]
pub struct Selection {
    pub version: u32,
    pub endpoint: std::path::PathBuf,
    pub credential: std::path::PathBuf,
    pub runtime: String,
    pub data_directory: std::path::PathBuf,
    pub contract: String,
    pub service_build: String,
    pub window_data: std::path::PathBuf,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(deny_unknown_fields)]
pub struct StreamEvent {
    pub seq: u64,
    pub payload: Value,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(deny_unknown_fields)]
pub struct StreamPage {
    pub stream_id: String,
    pub events: Vec<StreamEvent>,
    pub cursor: u64,
    pub gap: bool,
    pub completion: Option<Value>,
    pub done: bool,
}

/// Lo que el motor anuncia en `status.service_features` cuando habla el stream
/// empujado. Un motor sin esta marca cierra la conexión tras la primera respuesta.
pub const PUSH_STREAM_FEATURE: &str = "push_stream_v1";

/// Un marco que el motor manda sin petición por la conexión suscrita: trae
/// `push` y no `request_id`.
#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct Push {
    pub version: u32,
    pub push: String,
    pub subscription: String,
    #[serde(default)]
    pub events: Vec<Value>,
    #[serde(default)]
    pub cursor: Option<u64>,
    #[serde(default)]
    pub latest: Option<u64>,
    #[serde(default)]
    pub session: Option<String>,
    #[serde(default)]
    pub detail: Value,
}
