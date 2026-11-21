//! «Sincronizar credenciales»: la primera copia sellada de cada clave que esta
//! computadora guarda en su bóveda local hacia las máquinas de la persona.
//!
//! 1. `GET /v1/credentials/machine/assignments` con el Bearer de Desk: qué
//!    credencial (workspace y slot) espera qué máquina, con su llave pública.
//! 2. El motor local sella el secreto de su bóveda para esa llave
//!    (`seal_vault_credential`, `TERMINUS-SECRET/1`): el texto plano no sale del
//!    motor ni pasa por la webview.
//! 3. `PUT /v1/credentials/machine/sealed` con la copia.
//!
//! Las dos rutas del borde no están en `session::allowed`: la webview no las
//! alcanza por `danil_edge_fetch`. Un 404 o un 501 (el servicio aún no las
//! sirve) responde `unavailable` y el front reintenta solo. La respuesta lleva
//! conteos y códigos, nunca secretos.

use super::{coded, desk, error, pkce};
use serde_json::{json, Value};

const ASSIGNMENTS: &str = "/v1/credentials/machine/assignments";
const SEALED: &str = "/v1/credentials/machine/sealed";
/// Las asignaciones que se atienden por corrida; el resto, en la siguiente.
const MAX_ROWS: usize = 500;

/// Una asignación ya validada.
#[derive(Debug, PartialEq, Eq)]
struct Row {
    credential_id: String,
    machine_id: String,
    workspace_id: String,
    slot: String,
    version: i64,
    key: String,
}

fn text<'a>(row: &'a Value, field: &str) -> Option<&'a str> {
    row[field].as_str().filter(|s| !s.is_empty())
}

fn row_of(value: &Value) -> Option<Row> {
    let credential_id = text(value, "credential_id")?;
    let machine_id = text(value, "machine_id")?;
    let ok_id = credential_id.len() == 30
        && credential_id.strip_prefix("crd_").is_some_and(|rest| {
            rest.bytes()
                .all(|b| b.is_ascii_lowercase() || (b'2'..=b'7').contains(&b))
        });
    let ok_machine = machine_id.len() <= 128
        && machine_id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-');
    let key = text(value, "machine_public_key")?;
    let version = value["version"]
        .as_i64()
        .or_else(|| value["version"].as_f64().map(|v| v as i64))
        .filter(|v| *v > 0)?;
    if !(ok_id && ok_machine && key.len() == 44) {
        return None;
    }
    Some(Row {
        credential_id: credential_id.to_owned(),
        machine_id: machine_id.to_owned(),
        workspace_id: text(value, "workspace_id")?.to_owned(),
        slot: text(value, "slot")?.to_owned(),
        version,
        key: key.to_owned(),
    })
}

/// Conteos de una corrida.
#[derive(Debug, Default, PartialEq, Eq)]
struct Report {
    sent: usize,
    /// El borde ya tenía la copia (409) o no la acepta ya.
    already: usize,
    /// Sin secreto local para ese slot, o un slot que este motor no conoce.
    skipped: usize,
    failed: Vec<String>,
}

/// Recorre las asignaciones: `seal` pide la copia al motor y `put` sube el
/// cuerpo y devuelve el status del borde.
fn run(
    rows: &[Value],
    mut seal: impl FnMut(&Row) -> Result<String, String>,
    mut put: impl FnMut(&Value) -> Result<u16, String>,
) -> Report {
    let mut report = Report::default();
    for value in rows.iter().take(MAX_ROWS) {
        let Some(row) = row_of(value) else {
            report.skipped += 1;
            continue;
        };
        let sealed = match seal(&row) {
            Ok(sealed) => sealed,
            Err(code) if matches!(code.as_str(), "not_found" | "invalid_slot" | "workspace") => {
                report.skipped += 1;
                continue;
            }
            Err(code) => {
                report.failed.push(code);
                continue;
            }
        };
        let body = json!({
            "credential_id": row.credential_id,
            "machine_id": row.machine_id,
            "version": row.version,
            "sealed": sealed,
        });
        match put(&body) {
            Ok(204 | 200) => report.sent += 1,
            Ok(409) => report.already += 1,
            Ok(status) => report.failed.push(format!("sealed_{status}")),
            Err(code) => report.failed.push(code),
        }
    }
    report
}

/// El código corto de un error del motor (la cadena o el `detail`).
fn engine_code(value: &Value) -> String {
    let raw = value
        .as_str()
        .or_else(|| value["detail"].as_str())
        .unwrap_or("engine_error");
    raw.rsplit('.')
        .next()
        .unwrap_or(raw)
        .chars()
        .filter(|c| c.is_ascii_lowercase() || *c == '_')
        .take(64)
        .collect()
}

pub(super) fn sync(app: &tauri::AppHandle, context: Option<&str>) -> Result<Value, Value> {
    let d = desk(app);
    let key = || pkce::random(18).ok_or_else(|| coded("unavailable"));
    let listing = d
        .fetch("GET", ASSIGNMENTS, None, &key()?, context)
        .map_err(|fail| error(&fail))?;
    if matches!(listing.status, 404 | 501) {
        return Ok(json!({ "state": "unavailable" }));
    }
    if listing.status != 200 {
        return Err(coded(&format!("assignments_{}", listing.status)));
    }
    let rows = listing
        .body
        .as_array()
        .ok_or_else(|| coded("invalid_response"))?;
    let report = run(
        rows,
        |row| {
            super::super::proxy::engine_call_in(
                app,
                &row.workspace_id,
                "seal_vault_credential",
                json!({
                    "workspace": row.workspace_id,
                    "slot": row.slot,
                    "recipientPublicKey": row.key,
                }),
            )
            .map_err(|e| engine_code(&e))
            .and_then(|v| {
                v["sealed"]
                    .as_str()
                    .map(str::to_owned)
                    .ok_or_else(|| "invalid_response".to_owned())
            })
        },
        |body| {
            let idempotency = pkce::random(18).ok_or_else(|| "unavailable".to_owned())?;
            d.fetch("PUT", SEALED, Some(body), &idempotency, context)
                .map(|reply| reply.status)
                .map_err(|fail| {
                    error(&fail)["detail"]
                        .as_str()
                        .unwrap_or("unavailable")
                        .to_owned()
                })
        },
    );
    Ok(json!({
        "state": "done",
        "sent": report.sent,
        "already": report.already,
        "skipped": report.skipped,
        "failed": report.failed,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn assignment(workspace: &str, slot: &str) -> Value {
        json!({
            "credential_id": "crd_aaaaaaaaaaaaaaaaaaaaaaaaaa",
            "machine_id": "mch_1",
            "workspace_id": workspace,
            "slot": slot,
            "version": 3.0,
            "machine_public_key": "A".repeat(43) + "=",
        })
    }

    #[test]
    fn sella_sube_y_cuenta_cada_resultado() {
        let rows = vec![
            assignment("w1", "env/*/A"),
            assignment("w2", "env/*/B"),
            assignment("w3", "env/*/C"),
            assignment("w4", "env/*/D"),
            json!({"credential_id": "malo"}),
        ];
        let mut puts = vec![];
        let report = run(
            &rows,
            |row| match row.workspace_id.as_str() {
                "w3" => Err("not_found".into()),
                "w4" => Err("storage".into()),
                _ => Ok(format!("sealed-{}", row.workspace_id)),
            },
            |body| {
                puts.push(body.clone());
                Ok(if body["sealed"] == "sealed-w1" {
                    204
                } else {
                    409
                })
            },
        );
        assert_eq!(
            report,
            Report {
                sent: 1,
                already: 1,
                skipped: 2,
                failed: vec!["storage".into()],
            }
        );
        assert_eq!(puts[0]["version"], 3);
        assert_eq!(puts[0]["machine_id"], "mch_1");
    }

    #[test]
    fn una_fila_con_llave_corta_no_se_atiende() {
        let mut row = assignment("w1", "env/*/A");
        row["machine_public_key"] = json!("corta");
        assert!(row_of(&row).is_none());
        assert!(row_of(&assignment("w1", "env/*/A")).is_some());
    }

    #[test]
    fn el_codigo_del_motor_se_reduce_a_letras() {
        assert_eq!(
            engine_code(&json!("credentials.error.not_found")),
            "not_found"
        );
        assert_eq!(
            engine_code(&json!({"what": {}, "detail": "storage"})),
            "storage"
        );
    }
}
