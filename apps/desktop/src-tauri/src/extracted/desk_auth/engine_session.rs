//! La interfaz única de la sesión de la persona (decisión «la sesión vive en el motor»).
//! Si el motor anuncia `person_session_v1`, el login, el estado, la salida y las
//! llamadas al borde son suyos; si no, sigue la sesión de Desk (`session.rs`).

use serde_json::{json, Value};

pub(crate) const FEATURE: &str = "person_session_v1";
const STATUS: &str = "person_session_status";
const LOGIN: &str = "person_session_login";
const LOGIN_COMPLETE: &str = "person_session_login_complete";
const LOGOUT: &str = "person_session_logout";
const SELECT: &str = "person_session_select_organization";
const FETCH: &str = "person_session_fetch";
const SELECT_PATH: &str = "/v1/identity/organizations/select";

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

/// Decisión cuando la ventana puede estar arrancando todavía su motor (`Phase::Connecting`).
/// Sin motor conectado aún (`attached == false`), no se cae al llavero viejo de Desk: se espera.
pub(crate) enum Resolved<E: Engine> {
    Engine(E),
    Desk,
    Waiting,
}

pub(crate) fn owner<E: Engine>(engine: Option<E>) -> Owner<E> {
    match engine {
        Some(e) if announces(&e.features()) => Owner::Engine(e),
        _ => Owner::Desk,
    }
}

pub(crate) fn resolve<E: Engine>(attached: bool, engine: Option<E>) -> Resolved<E> {
    if !attached {
        return Resolved::Waiting;
    }
    match owner(engine) {
        Owner::Engine(e) => Resolved::Engine(e),
        Owner::Desk => Resolved::Desk,
    }
}

fn announces(features: &Value) -> bool {
    features
        .as_array()
        .is_some_and(|list| list.iter().any(|f| f.as_str() == Some(FEATURE)))
}

fn coded(code: &str) -> Value {
    json!({ "what": { "clave": format!("danil.error.{code}") }, "detail": code })
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

/// Primer paso: la liga que abre quien la muestra; el motor recibe la vuelta en su loopback.
pub(crate) fn start_login<E: Engine>(engine: &E, add: bool) -> Result<String, Value> {
    let started = engine.call(
        LOGIN,
        json!({ "mode": if add { Some("add") } else { None } }),
    )?;
    started["url"]
        .as_str()
        .filter(|url| url.starts_with("https://") || url.starts_with("http://127.0.0.1:"))
        .map(str::to_owned)
        .ok_or_else(|| coded("unavailable"))
}

/// `None` mientras el login sigue pendiente.
pub(crate) fn login_outcome(status: &Value) -> Option<Result<(), Value>> {
    match status["login"]["state"].as_str() {
        Some("done") => Some(Ok(())),
        Some("error") => Some(Err(coded(
            status["login"]["error"].as_str().unwrap_or("unavailable"),
        ))),
        Some(_) => None,
        // Sin `login` el motor ya no tiene un flujo abierto: vale el estado de la sesión.
        None if status["state"] == "connected" => Some(Ok(())),
        None => None,
    }
}

/// Segundo paso cuando la vuelta no llegó al loopback: la dirección o el código pegado.
pub(crate) fn complete_login<E: Engine>(engine: &E, pasted: &str) -> Result<Value, Value> {
    let pasted = pasted.trim();
    if pasted.is_empty() || pasted.len() > 4096 {
        return Err(coded("invalid_request"));
    }
    engine.call(LOGIN_COMPLETE, json!({ "pasted": pasted }))
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
    if (method, path) == ("POST", SELECT_PATH) {
        return select(engine, body, key, context);
    }
    let mut reply = engine.call(
        FETCH,
        json!({ "method": method, "path": path, "body": body, "idempotencyKey": key, "context": context }),
    )?;
    if !reply.get("status").is_some_and(Value::is_u64) {
        return Err(coded("unavailable"));
    }
    // El front lee la forma de `edge_reply`: `idempotency_key` solo en un POST.
    let echoed = reply
        .as_object_mut()
        .and_then(|o| o.remove("idempotencyKey"));
    if method == "POST" {
        reply["idempotency_key"] = echoed.unwrap_or_else(|| json!(key));
    }
    Ok(reply)
}

/// Elegir organización es una orden propia del motor; contesta con la forma de `edge_reply`.
fn select<E: Engine>(
    engine: &E,
    body: Option<&Value>,
    key: &str,
    context: Option<&str>,
) -> Result<Value, Value> {
    let Some(organization) = body
        .and_then(|b| b["organization_id"].as_str())
        .filter(|o| !o.is_empty())
    else {
        return Ok(
            json!({ "status": 400, "body": { "code": "invalid_request" }, "idempotency_key": key }),
        );
    };
    let answer = engine.call(
        SELECT,
        json!({ "organizationId": organization, "context": context }),
    )?;
    Ok(json!({ "status": 200, "body": answer, "idempotency_key": key }))
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
    fn sin_motor_conectado_espera_en_vez_de_caer_a_desk() {
        let with = fake(json!([FEATURE]), |_, _| Ok(json!({})));
        let empty = fake(json!([]), |_, _| Ok(json!({})));
        let legacy = fake(json!(["connected_machines_v1"]), |_, _| Ok(json!({})));
        assert!(matches!(resolve(false, Some(&empty)), Resolved::Waiting));
        assert!(matches!(resolve(false, Some(&with)), Resolved::Waiting));
        assert!(matches!(resolve::<&Fake>(false, None), Resolved::Waiting));
        assert!(matches!(resolve(true, Some(&with)), Resolved::Engine(_)));
        assert!(matches!(resolve(true, Some(&legacy)), Resolved::Desk));
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
    fn el_login_empieza_en_el_motor_y_devuelve_solo_una_liga_valida() {
        let e = fake(json!([FEATURE]), |_, _| {
            Ok(
                json!({"url": "https://edge.danil.ai/v1/identity/desk/authorize?x=1", "redirect_uri": "http://127.0.0.1:5000/callback", "expires_at": 1}),
            )
        });
        assert_eq!(
            start_login(&&e, false).unwrap(),
            "https://edge.danil.ai/v1/identity/desk/authorize?x=1"
        );
        start_login(&&e, true).unwrap();
        assert_eq!(e.calls.borrow()[0], (LOGIN.into(), json!({"mode": null})));
        assert_eq!(e.calls.borrow()[1], (LOGIN.into(), json!({"mode": "add"})));
        let bad = fake(json!([FEATURE]), |_, _| {
            Ok(json!({"url": "file:///etc/passwd"}))
        });
        assert_eq!(
            start_login(&&bad, false).unwrap_err()["detail"],
            "unavailable"
        );
        let fails = fake(json!([FEATURE]), |_, _| Err(coded("not_available_yet")));
        assert_eq!(
            start_login(&&fails, false).unwrap_err()["detail"],
            "not_available_yet"
        );
    }

    #[test]
    fn el_login_termina_cuando_el_motor_lo_dice() {
        assert!(
            login_outcome(&json!({"state": "disconnected", "login": {"state": "pending"}}))
                .is_none()
        );
        assert!(matches!(
            login_outcome(&json!({"state": "connected", "login": {"state": "done"}})),
            Some(Ok(()))
        ));
        let failed = login_outcome(
            &json!({"state": "disconnected", "login": {"state": "error", "error": "access_denied"}}),
        );
        assert_eq!(failed.unwrap().unwrap_err()["detail"], "access_denied");
        assert!(matches!(
            login_outcome(&json!({"state": "connected"})),
            Some(Ok(()))
        ));
        assert!(login_outcome(&json!({"state": "disconnected"})).is_none());
    }

    #[test]
    fn lo_pegado_se_manda_al_motor_recortado_y_con_limite() {
        let e = fake(json!([FEATURE]), |_, _| Ok(json!({"state": "connected"})));
        complete_login(&&e, "  http://127.0.0.1:5000/callback?code=abc&state=s  ").unwrap();
        assert_eq!(
            e.calls.borrow()[0],
            (
                LOGIN_COMPLETE.into(),
                json!({"pasted": "http://127.0.0.1:5000/callback?code=abc&state=s"})
            )
        );
        assert_eq!(
            complete_login(&&e, "   ").unwrap_err()["detail"],
            "invalid_request"
        );
        assert_eq!(
            complete_login(&&e, &"a".repeat(4097)).unwrap_err()["detail"],
            "invalid_request"
        );
        assert_eq!(e.calls.borrow().len(), 1);
    }

    #[test]
    fn salir_es_una_orden_del_motor() {
        let e = fake(json!([FEATURE]), |_, _| {
            Ok(json!({"state": "disconnected"}))
        });
        sign_out(&&e, Some("fam-1"), None).unwrap();
        assert_eq!(
            e.calls.borrow()[0],
            (LOGOUT.into(), json!({"family": "fam-1", "context": null}))
        );
    }

    #[test]
    fn una_llamada_al_borde_pasa_por_el_motor_con_la_llave_y_el_contexto() {
        let e = fake(json!([FEATURE]), |_, _| {
            Ok(json!({"status": 201, "body": {"id": "ws_1"}, "idempotencyKey": "k-1"}))
        });
        let body = json!({"name": "Nuevo"});
        let reply = fetch(
            &&e,
            "POST",
            "/v1/workspaces",
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
                json!({"method": "POST", "path": "/v1/workspaces", "body": body, "idempotencyKey": "k-1", "context": "ctx-1"})
            )
        );
        let get = fetch(&&e, "GET", "/v1/machines", None, "k-2", None).unwrap();
        assert!(get.get("idempotency_key").is_none());
        assert!(get.get("idempotencyKey").is_none());
    }

    #[test]
    fn elegir_organizacion_va_por_su_orden_del_motor() {
        let e = fake(json!([FEATURE]), |_, _| {
            Ok(json!({"default_context": "ctx-2"}))
        });
        let body = json!({"organization_id": "org_personal"});
        let reply = fetch(&&e, "POST", SELECT_PATH, Some(&body), "k-1", Some("ctx-1")).unwrap();
        assert_eq!(
            reply,
            json!({"status": 200, "body": {"default_context": "ctx-2"}, "idempotency_key": "k-1"})
        );
        assert_eq!(
            e.calls.borrow()[0],
            (
                SELECT.into(),
                json!({"organizationId": "org_personal", "context": "ctx-1"})
            )
        );
        let empty = fetch(&&e, "POST", SELECT_PATH, Some(&json!({})), "k-2", None).unwrap();
        assert_eq!(empty["status"], 400);
        assert_eq!(e.calls.borrow().len(), 1);
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
