//! La interfaz única de la sesión de la persona (decisión 2026-11-20 «la sesión vive en el
//! motor»). Si el motor anuncia `person_session_v1`, el login, el estado, la salida y las
//! llamadas al borde son suyos; si no, sigue la sesión de Desk (`session.rs`).

use serde_json::{json, Value};

/// Lo fija T5 en `danil-engine`; provisional hasta que lo publique.
pub(crate) const FEATURE: &str = "person_session_v1";
const STATUS: &str = "person_session_status";
const LOGIN: &str = "person_session_login";
const LOGOUT: &str = "person_session_logout";
const FETCH: &str = "person_session_fetch";

/// El motor visto desde la ventana: sus rasgos y una orden.
pub(crate) trait Engine {
    fn features(&self) -> Value;
    fn call(&self, command: &str, args: Value) -> Result<Value, Value>;
}

/// Quién tiene la sesión. Se decide en cada llamada: el motor puede reiniciar con otro rasgo.
pub(crate) enum Owner<E: Engine> {
    Engine(E),
    Desk,
}

pub(crate) fn owner<E: Engine>(engine: Option<E>) -> Owner<E> {
    match engine {
        Some(e) if announces(&e.features()) => Owner::Engine(e),
        _ => Owner::Desk,
    }
}

fn announces(features: &Value) -> bool {
    features
        .as_array()
        .is_some_and(|list| list.iter().any(|f| f.as_str() == Some(FEATURE)))
}

/// Sin respuesta del motor, la ventana se ve sin sesión y muestra solo el login.
pub(crate) fn status<E: Engine>(engine: &E) -> Value {
    match engine.call(STATUS, json!({})) {
        Ok(value) if value.get("state").is_some_and(Value::is_string) => value,
        Ok(_) => json!({"state": "disconnected", "error": "invalid_status"}),
        Err(fail) => {
            json!({"state": "disconnected", "error": fail.get("detail").cloned().unwrap_or(Value::Null)})
        }
    }
}

pub(crate) fn sign_in<E: Engine>(engine: &E, add: bool) -> Result<Value, Value> {
    engine.call(
        LOGIN,
        json!({ "mode": if add { Some("add") } else { None } }),
    )
}

pub(crate) fn sign_out<E: Engine>(
    engine: &E,
    family: Option<&str>,
    context: Option<&str>,
) -> Result<Value, Value> {
    engine.call(LOGOUT, json!({ "family": family, "context": context }))
}

/// La ruta ya pasó `session::allowed`; el motor vuelve a revisar con su propia lista.
pub(crate) fn fetch<E: Engine>(
    engine: &E,
    method: &str,
    path: &str,
    body: Option<&Value>,
    key: &str,
    context: Option<&str>,
) -> Result<Value, Value> {
    let mut reply = engine.call(
        FETCH,
        json!({ "method": method, "path": path, "body": body, "idempotencyKey": key, "context": context }),
    )?;
    if !reply.get("status").is_some_and(Value::is_u64) {
        return Err(
            json!({ "what": { "clave": "danil.error.unavailable" }, "detail": "unavailable" }),
        );
    }
    if method == "POST" && reply.get("idempotency_key").is_none() {
        reply["idempotency_key"] = json!(key);
    }
    Ok(reply)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;

    struct Fake {
        features: Value,
        calls: RefCell<Vec<(String, Value)>>,
        answer: fn(&str, &Value) -> Result<Value, Value>,
    }

    impl Engine for &Fake {
        fn features(&self) -> Value {
            self.features.clone()
        }
        fn call(&self, command: &str, args: Value) -> Result<Value, Value> {
            self.calls.borrow_mut().push((command.into(), args.clone()));
            (self.answer)(command, &args)
        }
    }

    fn fake(features: Value, answer: fn(&str, &Value) -> Result<Value, Value>) -> Fake {
        Fake {
            features,
            calls: RefCell::new(vec![]),
            answer,
        }
    }

    #[test]
    fn la_sesion_es_del_motor_solo_si_anuncia_el_rasgo() {
        let with = fake(json!(["connected_machines_v1", FEATURE]), |_, _| {
            Ok(json!({}))
        });
        let without = fake(json!(["connected_machines_v1"]), |_, _| Ok(json!({})));
        let odd = fake(json!({"person_session_v1": true}), |_, _| Ok(json!({})));
        assert!(matches!(owner(Some(&with)), Owner::Engine(_)));
        assert!(matches!(owner(Some(&without)), Owner::Desk));
        assert!(matches!(owner(Some(&odd)), Owner::Desk));
        assert!(matches!(owner::<&Fake>(None), Owner::Desk));
    }

    #[test]
    fn el_estado_viene_del_motor_y_sin_respuesta_queda_sin_sesion() {
        let ok = fake(json!([FEATURE]), |_, _| {
            Ok(json!({"state": "connected", "email": "ana@danil.ai", "sessions": []}))
        });
        assert_eq!(status(&&ok)["email"], "ana@danil.ai");
        assert_eq!(ok.calls.borrow()[0].0, STATUS);
        let down = fake(json!([FEATURE]), |_, _| {
            Err(json!({"detail": "engine_down"}))
        });
        assert_eq!(
            status(&&down),
            json!({"state": "disconnected", "error": "engine_down"})
        );
        let odd = fake(json!([FEATURE]), |_, _| Ok(json!({"token": "x"})));
        assert_eq!(status(&&odd)["state"], "disconnected");
        assert!(status(&&odd).get("token").is_none());
    }

    #[test]
    fn entrar_y_salir_son_ordenes_del_motor() {
        let e = fake(json!([FEATURE]), |_, _| Ok(json!({"state": "connected"})));
        sign_in(&&e, false).unwrap();
        sign_in(&&e, true).unwrap();
        sign_out(&&e, Some("fam-1"), None).unwrap();
        let calls = e.calls.borrow();
        assert_eq!(calls[0], (LOGIN.into(), json!({"mode": null})));
        assert_eq!(calls[1], (LOGIN.into(), json!({"mode": "add"})));
        assert_eq!(
            calls[2],
            (LOGOUT.into(), json!({"family": "fam-1", "context": null}))
        );
    }

    #[test]
    fn una_llamada_al_borde_pasa_por_el_motor_con_la_llave_y_el_contexto() {
        let e = fake(json!([FEATURE]), |_, _| {
            Ok(json!({"status": 201, "body": {"id": "ws_1"}}))
        });
        let body = json!({"organization_id": "org_1"});
        let reply = fetch(
            &&e,
            "POST",
            "/v1/identity/organizations/select",
            Some(&body),
            "k-1",
            Some("ctx-1"),
        )
        .unwrap();
        assert_eq!(
            reply,
            json!({"status": 201, "body": {"id": "ws_1"}, "idempotency_key": "k-1"})
        );
        assert_eq!(
            e.calls.borrow()[0],
            (
                FETCH.into(),
                json!({"method": "POST", "path": "/v1/identity/organizations/select", "body": body, "idempotencyKey": "k-1", "context": "ctx-1"})
            )
        );
        let get = fetch(&&e, "GET", "/v1/machines", None, "k-2", None).unwrap();
        assert!(get.get("idempotency_key").is_none());
    }

    #[test]
    fn una_respuesta_sin_status_o_un_fallo_del_motor_es_un_error() {
        let odd = fake(json!([FEATURE]), |_, _| Ok(json!({"body": {}})));
        assert_eq!(
            fetch(&&odd, "GET", "/v1/machines", None, "k", None).unwrap_err()["detail"],
            "unavailable"
        );
        let down = fake(json!([FEATURE]), |_, _| {
            Err(json!({"detail": "no_session"}))
        });
        assert_eq!(
            fetch(&&down, "GET", "/v1/machines", None, "k", None).unwrap_err()["detail"],
            "no_session"
        );
    }
}
