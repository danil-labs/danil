use super::*;

const PATH: &str = "/v1/workspaces/promo/redeem";

#[test]
fn promo_route_is_exact_and_post_only() {
    assert!(allowed("POST", PATH));
    for method in ["GET", "PUT", "DELETE"] {
        assert!(!allowed(method, PATH));
    }
    for path in [
        "/v1/workspaces/promo/redeem?code=test",
        "/v1/workspaces/promo/redeem/",
        "/v1/workspaces/promo/redeem/extra",
        "/v1/workspaces/promo/redeem/../redeem",
        "/v1/workspaces/promo/redeem?",
        "/v1/workspaces/promo/redeem#fragment",
    ] {
        assert!(!allowed("POST", path));
    }
}

#[test]
fn promo_uses_the_web_body_idempotency_key_and_the_selected_family() {
    let vault = VaultSet::default();
    catalog(&vault);
    let (edge, seen) = serve(Arc::new(|req, _| match req.path.as_str() {
        "/v1/identity/desk/refresh" => (200, refresh_for(req)),
        PATH => {
            assert_eq!(req.body, json!({"code":"PROMO_TEST"}));
            assert_eq!(req.idempotency_key.as_deref(), Some("redeem-intent"));
            assert_eq!(req.context.as_deref(), Some("context_b"));
            assert_eq!(req.authorization.as_deref(), Some("Bearer access_family_b"));
            (
                200,
                json!({"__echo":"context_b","machine":{"state":"ready"}}),
            )
        }
        _ => (404, Value::Null),
    }));
    let families = Families::new(edge, vault, || {});
    let reply = families
        .fetch(
            "POST",
            PATH,
            Some(&json!({"code":"PROMO_TEST"})),
            "redeem-intent",
            Some("context_b"),
        )
        .unwrap();
    let value = super::super::super::edge_reply("POST", &reply, "redeem-intent");
    assert_eq!(value["body"]["machine"]["state"], "ready");
    assert_eq!(value["idempotency_key"], "redeem-intent");
    assert_eq!(count(&seen, PATH), 1);
}

#[test]
fn successful_promo_without_the_exact_context_echo_discards_the_response() {
    for echo in [None, Some("other_context")] {
        let vault = VaultSet::default();
        catalog(&vault);
        let (edge, _) = serve(Arc::new(move |req, _| match req.path.as_str() {
            "/v1/identity/desk/refresh" => (200, refresh_for(req)),
            PATH => (200, json!({"__echo":echo,"private":"never forward"})),
            _ => (404, Value::Null),
        }));
        let families = Families::new(edge, vault, || {});
        assert_eq!(
            families
                .fetch(
                    "POST",
                    PATH,
                    Some(&json!({"code":"PROMO_TEST"})),
                    "key",
                    Some("context_a")
                )
                .unwrap_err()
                .code(),
            "session_echo_mismatch"
        );
    }
}

#[test]
fn scoped_promo_rejections_expose_only_the_validated_problem_code() {
    for (status, code) in [
        (422, "invalid_code"),
        (409, "already_redeemed"),
        (409, "organization_has_machine"),
        (403, "promotion_not_allowed"),
    ] {
        let vault = VaultSet::default();
        catalog(&vault);
        let (edge, _) = serve(Arc::new(move |req, _| match req.path.as_str() {
            "/v1/identity/desk/refresh" => (200, refresh_for(req)),
            PATH => (
                status,
                json!({"code":code,"detail":"private error detail","other_org":"must not escape"}),
            ),
            _ => (404, Value::Null),
        }));
        let families = Families::new(edge, vault, || {});
        let reply = families
            .fetch(
                "POST",
                PATH,
                Some(&json!({"code":"PROMO_TEST"})),
                "key",
                Some("context_a"),
            )
            .unwrap();
        assert!(reply.body.is_null());
        let value = super::super::super::edge_reply("POST", &reply, "key");
        assert_eq!(value["status"], status);
        assert_eq!(value["body"], json!({"code":code}));
    }
}

#[test]
fn malformed_promo_problem_codes_are_not_forwarded() {
    for code in [
        json!(""),
        json!("Invalid Code"),
        json!("bad\ncode"),
        json!("a".repeat(65)),
        json!(123),
    ] {
        let vault = VaultSet::default();
        catalog(&vault);
        let (edge, _) = serve(Arc::new(move |req, _| match req.path.as_str() {
            "/v1/identity/desk/refresh" => (200, refresh_for(req)),
            PATH => (422, json!({"code":code,"detail":"do not forward"})),
            _ => (404, Value::Null),
        }));
        let families = Families::new(edge, vault, || {});
        let reply = families
            .fetch(
                "POST",
                PATH,
                Some(&json!({"code":"PROMO_TEST"})),
                "key",
                Some("context_a"),
            )
            .unwrap();
        assert!(super::super::super::edge_reply("POST", &reply, "key")["body"].is_null());
    }
}

#[test]
fn promo_without_explicit_context_is_rejected_before_any_network_request() {
    let vault = VaultSet::default();
    catalog(&vault);
    let (edge, seen) = serve(Arc::new(|_, _| (500, Value::Null)));
    let families = Families::new(edge, vault, || {});
    assert_eq!(
        families
            .fetch(
                "POST",
                PATH,
                Some(&json!({"code":"PROMO_TEST"})),
                "key",
                None
            )
            .unwrap_err()
            .code(),
        "invalid_request"
    );
    assert!(seen.lock().unwrap().is_empty());
}

#[test]
fn malformed_promo_bodies_are_rejected_before_any_network_request() {
    let vault = VaultSet::default();
    catalog(&vault);
    let (edge, seen) = serve(Arc::new(|_, _| (500, Value::Null)));
    let families = Families::new(edge, vault, || {});
    for body in [
        None,
        Some(Value::Null),
        Some(json!([])),
        Some(json!("CODE")),
        Some(json!({})),
        Some(json!({"code":null})),
        Some(json!({"code":123})),
        Some(json!({"code":""})),
        Some(json!({"code":"x".repeat(65)})),
        Some(json!({"code":"OK","organization":"other_org"})),
    ] {
        assert_eq!(
            families
                .fetch("POST", PATH, body.as_ref(), "key", Some("context_a"))
                .unwrap_err()
                .code(),
            "invalid_request"
        );
    }
    assert!(seen.lock().unwrap().is_empty());
}

#[test]
fn promo_accepts_the_body_length_boundaries_and_keeps_the_explicit_context() {
    let vault = VaultSet::default();
    catalog(&vault);
    let (edge, seen) = serve(Arc::new(|req, _| match req.path.as_str() {
        "/v1/identity/desk/refresh" => (200, refresh_for(req)),
        PATH => {
            assert_eq!(req.context.as_deref(), Some("context_a"));
            (
                200,
                json!({"__echo":"context_a","machine":{"state":"ready"}}),
            )
        }
        _ => (404, Value::Null),
    }));
    let families = Families::new(edge, vault, || {});
    for code in ["x".to_owned(), "x".repeat(64)] {
        assert_eq!(
            families
                .fetch(
                    "POST",
                    PATH,
                    Some(&json!({"code":code})),
                    "key",
                    Some("context_a")
                )
                .unwrap()
                .status,
            200
        );
    }
    assert_eq!(count(&seen, PATH), 2);
}

#[test]
fn scoped_rate_limit_keeps_retry_after_without_forwarding_error_details() {
    let vault = VaultSet::default();
    catalog(&vault);
    let (edge, _) = serve(Arc::new(|req, _| match req.path.as_str() {
        "/v1/identity/desk/refresh" => (200, refresh_for(req)),
        _ => (
            429,
            json!({"__retry_after":"7","code":"rate_limited","detail":"private detail"}),
        ),
    }));
    let families = Families::new(edge, vault, || {});
    for path in [PATH, "/v1/workspaces/select"] {
        let body = if path == PATH {
            json!({"code":"TEST"})
        } else {
            json!({"workspace":"workspace_a"})
        };
        let reply = families
            .fetch("POST", path, Some(&body), "key", Some("context_a"))
            .unwrap();
        assert_eq!(reply.status, 429);
        assert!(reply.body.is_null());
        let value = super::super::super::edge_reply("POST", &reply, "key");
        assert_eq!(value["retry_after_ms"], 7000);
        assert!(!value.to_string().contains("private detail"));
    }
}
