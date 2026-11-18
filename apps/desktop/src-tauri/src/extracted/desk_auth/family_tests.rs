use super::super::families::{Families, FamilyVault};
use super::*;
use std::collections::HashMap;

#[derive(Clone, Default)]
struct VaultSet {
    records: Arc<Mutex<HashMap<String, String>>>,
    account: String,
    fail_save: bool,
    fail_index: bool,
}
impl Vault for VaultSet {
    fn load(&self) -> Option<Stored> {
        Stored::from_record(self.records.lock().unwrap().get(&self.account)?)
    }
    fn save(&self, stored: &Stored) -> bool {
        if self.fail_save {
            return false;
        }
        self.records
            .lock()
            .unwrap()
            .insert(self.account.clone(), stored.to_record());
        true
    }
    fn clear(&self) {
        self.records.lock().unwrap().remove(&self.account);
    }
}
impl FamilyVault for VaultSet {
    fn family(&self, id: &str) -> Self {
        Self {
            account: format!("session:{id}"),
            ..self.clone()
        }
    }
    fn index(&self) -> Option<String> {
        self.records.lock().unwrap().get("index").cloned()
    }
    fn save_index(&self, index: &str) -> bool {
        if self.fail_index {
            return false;
        }
        self.records
            .lock()
            .unwrap()
            .insert("index".into(), index.into());
        true
    }
}
fn catalog(vault: &VaultSet) {
    vault.save_index(&json!({"version":1,"items":[
        {"family":"family_a","session_id":"family_a","sub":"same_person","email":"same@example.test","contexts":[{"context_id":"context_a","org":"org_a"}]},
        {"family":"family_b","session_id":"family_b","sub":"same_person","email":"same@example.test","contexts":[{"context_id":"context_b","org":"org_b"}]}
    ], "default_family":"family_a", "default_context":"context_a"}).to_string());
    for id in ["family_a", "family_b"] {
        vault.family(id).save(&Stored {
            sid: id.into(),
            refresh_token: format!("refresh_{id}"),
        });
    }
}
fn refresh_for(req: &Req) -> Value {
    let family = req.body["refresh_token"]
        .as_str()
        .unwrap()
        .strip_prefix("refresh_")
        .unwrap();
    json!({"access_token":format!("access_{family}"),"refresh_token":format!("refresh_{family}"),"sid":family,"expires_in":300})
}
#[test]
fn legacy_keychain_migrates_without_authorization_and_survives_restart() {
    let vault = VaultSet::default();
    let stored = Stored {
        sid: "family_a".into(),
        refresh_token: "refresh_family_a".into(),
    };
    vault.save(&stored);
    let (edge, seen) = serve(Arc::new(|req, _| match req.path.as_str() {
        "/v1/identity/desk/refresh" => (200, refresh_for(req)),
        _ => (404, json!({})),
    }));
    let families = Families::new(edge.clone(), vault.clone(), || {});
    assert!(vault.load().is_none());
    let index = vault.index().unwrap();
    let parsed: Value = serde_json::from_str(&index).unwrap();
    let local = parsed["items"][0]["family"].as_str().unwrap();
    assert_ne!(local, "family_a");
    assert_eq!(vault.family(local).load(), Some(stored));
    assert!(!index.contains("refresh"));
    assert!(!index.contains("access_token"));
    assert!(families.access().is_ok());
    drop(families);
    let restarted = Families::new(edge, vault, || {});
    assert!(restarted.access().is_ok());
    assert_eq!(count(&seen, "/v1/identity/desk/token"), 0);
}
#[test]
fn context_selects_own_bearer_and_requires_exact_echo_before_body() {
    let vault = VaultSet::default();
    catalog(&vault);
    let (edge, seen) = serve(Arc::new(|req, _| match req.path.as_str() {
        "/v1/identity/desk/refresh" => (200, refresh_for(req)),
        "/v1/workspaces" => {
            assert_eq!(req.authorization.as_deref(), Some("Bearer access_family_b"));
            assert_eq!(req.context.as_deref(), Some("context_b"));
            (200, json!({"__echo":"context_b","items":["org_b"]}))
        }
        "/v1/machines" => (
            200,
            json!({"__echo":"context_a","secret":"wrong organization"}),
        ),
        _ => (404, json!({})),
    }));
    let families = Families::new(edge, vault, || {});
    let response = families
        .fetch("GET", "/v1/workspaces", None, "key", Some("context_b"))
        .unwrap();
    assert_eq!(response.body, json!({"items":["org_b"]}));
    assert_eq!(
        families
            .fetch("GET", "/v1/machines", None, "key", Some("context_b"))
            .unwrap_err()
            .code(),
        "session_echo_mismatch"
    );
    assert_eq!(
        families
            .fetch("GET", "/v1/workspaces", None, "key", Some("unknown"))
            .unwrap_err()
            .code(),
        "session_not_in_set"
    );
    assert_eq!(count(&seen, "/v1/workspaces"), 1);
}
#[test]
fn missing_echo_discards_body_but_default_client_remains_compatible() {
    let vault = VaultSet::default();
    catalog(&vault);
    let (edge, seen) = serve(Arc::new(|req, _| match req.path.as_str() {
        "/v1/identity/desk/refresh" => (200, refresh_for(req)),
        _ => (200, json!({"items":[]})),
    }));
    let families = Families::new(edge, vault, || {});
    assert_eq!(
        families
            .fetch("GET", "/v1/workspaces", None, "key", Some("context_a"))
            .unwrap_err()
            .code(),
        "session_echo_mismatch"
    );
    assert!(families
        .fetch("GET", "/v1/workspaces", None, "key", None)
        .is_ok());
    let seen = seen.lock().unwrap();
    let requests: Vec<_> = seen.iter().filter(|r| r.path == "/v1/workspaces").collect();
    assert_eq!(requests[0].context.as_deref(), Some("context_a"));
    assert_eq!(requests[1].context, None);
}
#[test]
fn failed_refresh_only_closes_its_family() {
    let vault = VaultSet::default();
    catalog(&vault);
    let (edge, _) = serve(Arc::new(|req, _| match req.path.as_str() {
        "/v1/identity/desk/refresh" if req.body["refresh_token"] == "refresh_family_a" => {
            (401, json!({"code":"invalid_grant"}))
        }
        "/v1/identity/desk/refresh" => (200, refresh_for(req)),
        _ => (200, json!({"__echo":"context_b","items":[]})),
    }));
    let families = Families::new(edge, vault.clone(), || {});
    assert!(families
        .fetch("GET", "/v1/workspaces", None, "key", Some("context_a"))
        .is_err());
    assert!(families
        .fetch("GET", "/v1/workspaces", None, "key", Some("context_b"))
        .is_ok());
    assert!(vault.family("family_a").load().is_none());
    assert!(vault.family("family_b").load().is_some());
}
#[test]
fn concurrent_calls_share_one_refresh_per_family() {
    let vault = VaultSet::default();
    catalog(&vault);
    let (edge, seen) = serve(Arc::new(|req, _| match req.path.as_str() {
        "/v1/identity/desk/refresh" => {
            std::thread::sleep(Duration::from_millis(30));
            (200, refresh_for(req))
        }
        _ => (200, json!({"__echo":"context_b"})),
    }));
    let families = Arc::new(Families::new(edge, vault, || {}));
    let threads: Vec<_> = (0..8)
        .map(|_| {
            let f = families.clone();
            std::thread::spawn(move || {
                f.fetch("GET", "/v1/workspaces", None, "key", Some("context_b"))
                    .unwrap()
            })
        })
        .collect();
    for thread in threads {
        thread.join().unwrap();
    }
    assert_eq!(count(&seen, "/v1/identity/desk/refresh"), 1);
}
#[test]
fn different_families_do_not_wait_for_another_refresh() {
    let vault = VaultSet::default();
    catalog(&vault);
    let (entered_tx, entered_rx) = mpsc::channel();
    let (release_tx, release_rx) = mpsc::channel();
    let release_rx = Mutex::new(release_rx);
    let (edge, _) = serve(Arc::new(move |req, _| match req.path.as_str() {
        "/v1/identity/desk/refresh" => {
            if req.body["refresh_token"] == "refresh_family_a" {
                entered_tx.send(()).unwrap();
                release_rx
                    .lock()
                    .unwrap()
                    .recv_timeout(Duration::from_secs(5))
                    .unwrap();
            }
            (200, refresh_for(req))
        }
        _ => (200, json!({"__echo":req.context})),
    }));
    let families = Arc::new(Families::new(edge, vault, || {}));
    let a = families.clone();
    let first = std::thread::spawn(move || {
        a.fetch("GET", "/v1/workspaces", None, "key", Some("context_a"))
    });
    entered_rx.recv_timeout(Duration::from_secs(5)).unwrap();
    let (done_tx, done_rx) = mpsc::channel();
    let second = std::thread::spawn(move || {
        done_tx
            .send(
                families
                    .fetch("GET", "/v1/workspaces", None, "key", Some("context_b"))
                    .is_ok(),
            )
            .unwrap()
    });
    let independent = done_rx.recv_timeout(Duration::from_secs(2));
    release_tx.send(()).unwrap();
    first.join().unwrap().unwrap();
    second.join().unwrap();
    assert_eq!(independent.unwrap(), true);
}
#[test]
fn routes_are_exact_and_opaque() {
    assert!(!allowed("GET", "/v1/identity/sessions"));
    assert!(!allowed("POST", "/v1/identity/contexts"));
    for id in ["a/b", "../x", "x%2fy", "x?y", "", "a.b"] {
        assert!(!allowed(
            "POST",
            &format!("/v1/identity/contexts/{id}/logout")
        ));
    }
    assert!(!allowed("POST", "/v1/identity/sessions/family_a/logout"));
    assert!(!allowed("POST", "/v1/identity/contexts/context_a/logout"));
    assert!(!allowed("GET", "/v1/identity/sessions/family_a/logout"));
}
#[test]
fn add_login_uses_mode_without_email_in_url() {
    let families = Families::new(
        "https://edge.example.test".into(),
        VaultSet::default(),
        || {},
    );
    let url = families.authorize_url("challenge", "state", "http://127.0.0.1:1234", true);
    assert!(url.ends_with("&mode=add"));
    assert!(!url.contains("login_hint"));
}

#[test]
fn failed_migration_write_keeps_legacy_login_usable() {
    let vault = VaultSet::default();
    vault.save(&Stored {
        sid: "family_a".into(),
        refresh_token: "refresh_family_a".into(),
    });
    let vault = VaultSet {
        fail_save: true,
        ..vault
    };
    let (edge, _) = serve(Arc::new(|req, _| (200, refresh_for(req))));
    let families = Families::new(edge, vault.clone(), || {});
    assert!(vault.load().is_some());
    assert!(families.access().is_ok());
}

#[test]
fn logout_context_is_idempotent_and_does_not_reassign_default() {
    let vault = VaultSet::default();
    catalog(&vault);
    let (edge, seen) = serve(Arc::new(|req, _| match req.path.as_str() {
        "/v1/identity/desk/refresh" => (200, refresh_for(req)),
        "/v1/identity/contexts/context_a/logout" => (404, Value::Null),
        _ => (200, json!({"__echo":"context_b"})),
    }));
    let families = Families::new(edge, vault.clone(), || {});
    families
        .sign_out(None, Some("context_a"), "logout-key")
        .unwrap();
    families
        .sign_out(None, Some("context_a"), "logout-key")
        .unwrap();
    assert!(families
        .fetch("GET", "/v1/workspaces", None, "key", Some("context_b"))
        .is_ok());
    assert_eq!(
        families
            .fetch("GET", "/v1/workspaces", None, "key", None)
            .unwrap_err()
            .code(),
        "session_not_in_set"
    );
    assert!(vault.family("family_a").load().is_some());
    assert_eq!(families.status()["state"], "connected");
    assert!(!seen
        .lock()
        .unwrap()
        .iter()
        .any(|r| r.path == "/v1/identity/desk/logout"
            || r.path.starts_with("/v1/identity/sessions/")));
    assert_eq!(count(&seen, "/v1/identity/contexts/context_a/logout"), 1);
    assert_eq!(
        seen.lock()
            .unwrap()
            .iter()
            .find(|r| r.path.ends_with("/logout"))
            .unwrap()
            .idempotency_key
            .as_deref(),
        Some("logout-key")
    );
}

#[test]
fn logout_family_only_removes_that_keychain_entry() {
    let vault = VaultSet::default();
    catalog(&vault);
    let mut index: Value = serde_json::from_str(&vault.index().unwrap()).unwrap();
    index["items"][1]["email"] = json!("different@example.test");
    index["items"][1]["sub"] = json!("other_person");
    vault.save_index(&index.to_string());
    let (edge, _) = serve(Arc::new(|req, _| match req.path.as_str() {
        "/v1/identity/desk/refresh" => (200, refresh_for(req)),
        p if p.ends_with("/logout") => (204, Value::Null),
        _ => (200, json!({"__echo":"context_b"})),
    }));
    let families = Families::new(edge, vault.clone(), || {});
    families.sign_out(Some("family_a"), None, "key").unwrap();
    families.sign_out(Some("family_a"), None, "key").unwrap();
    assert!(vault.family("family_a").load().is_none());
    assert!(families
        .fetch("GET", "/v1/workspaces", None, "key", Some("context_b"))
        .is_ok());
    assert!(!vault.index().unwrap().contains("family_a"));
}

#[test]
fn sessions_legacy_and_missing_echo_fall_back_then_recover_without_restart() {
    let vault = VaultSet::default();
    catalog(&vault);
    let (edge, _) = serve(Arc::new(|req, n| match req.path.as_str() {
        "/v1/identity/desk/refresh" => (200, refresh_for(req)),
        "/v1/capabilities" => (404, Value::Null),
        "/v1/identity/me" => (200, json!({"id":"person","__echo":req.context})),
        "/v1/identity/sessions" if n < 2 => (404, Value::Null),
        "/v1/identity/sessions" => {
            let family = req
                .authorization
                .as_deref()
                .unwrap()
                .strip_prefix("Bearer access_")
                .unwrap();
            let context = if family == "family_a" {
                "context_a"
            } else {
                "context_b"
            };
            (
                200,
                json!({"items":[{"session_id":family,"email":"same@example.test","contexts":[{"context_id":context,"org": if family == "family_a" { "org_a" } else { "org_b" }}]}],"default_context":context}),
            )
        }
        _ => (404, Value::Null),
    }));
    let families = Families::new(edge, vault, || {});
    assert!(families.status().get("sessions").is_none());
    let status = families.status();
    assert_eq!(status["sessions"].as_array().unwrap().len(), 2);
    assert_eq!(status["default_context"], "context_a");
}

#[test]
fn adding_login_keeps_other_families_and_logout_all_cancels_pending_login() {
    let vault = VaultSet::default();
    catalog(&vault);
    let (edge, _) = serve(Arc::new(|req, _| match req.path.as_str() {
        "/v1/identity/desk/token" => (
            200,
            json!({"access_token":"new_access","refresh_token":"new_refresh","sid":"workos_sid_c","session_id":"family_c","expires_in":300}),
        ),
        "/v1/identity/desk/refresh" => (200, refresh_for(req)),
        _ => (204, Value::Null),
    }));
    let families = Families::new(edge, vault.clone(), || {});
    let attempt = families.begin_sign_in();
    families
        .exchange(attempt, "code", "verifier", "loopback", true)
        .unwrap();
    assert!(vault.family("family_a").load().is_some());
    assert!(vault.family("family_b").load().is_some());
    let index: Value = serde_json::from_str(&vault.index().unwrap()).unwrap();
    let local = index["items"]
        .as_array()
        .unwrap()
        .iter()
        .find(|i| i["session_id"] == "family_c")
        .unwrap()["family"]
        .as_str()
        .unwrap()
        .to_owned();
    assert_eq!(
        vault.family(&local).load().unwrap().refresh_token,
        "new_refresh"
    );
    let attempt = families.begin_sign_in();
    families.sign_out(None, None, "key").unwrap();
    assert!(!families.is_signing_in(attempt));
    assert_eq!(
        families
            .exchange(attempt, "code", "verifier", "loopback", true)
            .unwrap_err()
            .code(),
        "cancelled"
    );
    assert!(vault.family(&local).load().is_none());
}

#[test]
fn missing_echo_keeps_status_in_single_session_mode_without_visible_failure() {
    let vault = VaultSet::default();
    catalog(&vault);
    let (edge, _) = serve(Arc::new(|req, _| match req.path.as_str() {
        "/v1/identity/desk/refresh" => (200, refresh_for(req)),
        "/v1/capabilities" => (404, Value::Null),
        "/v1/identity/me" => (200, json!({"id":"person"})),
        "/v1/identity/sessions" => {
            let family = req
                .authorization
                .as_deref()
                .unwrap()
                .strip_prefix("Bearer access_")
                .unwrap();
            (
                200,
                json!({"items":[{"session_id":family,"contexts":[{"context_id":"context_a","org":"org_a"}]}]}),
            )
        }
        _ => (501, Value::Null),
    }));
    let families = Families::new(edge, vault, || {});
    let status = families.status();
    assert_eq!(status["state"], "connected");
    assert!(status.get("sessions").is_none());
}

#[test]
fn family_limit_does_not_overwrite_any_existing_keychain_entry() {
    let vault = VaultSet::default();
    let items: Vec<_> = (0..20)
        .map(|n| {
            let family = format!("family_{n}");
            vault.family(&family).save(&Stored {
                sid: family.clone(),
                refresh_token: format!("refresh_{n}"),
            });
            json!({"family":family,"email":null,"contexts":[]})
        })
        .collect();
    vault.save_index(&json!({"version":1,"items":items,"default_family":"family_0"}).to_string());
    let (edge, _) = serve(Arc::new(|_, _| {
        (
            200,
            json!({"access_token":"new","refresh_token":"new","sid":"family_new"}),
        )
    }));
    let families = Families::new(edge, vault.clone(), || {});
    let attempt = families.begin_sign_in();
    assert_eq!(
        families
            .exchange(attempt, "code", "verifier", "redirect", true)
            .unwrap_err()
            .code(),
        "too_many_sessions"
    );
    assert!(vault.family("family_new").load().is_none());
    for n in 0..20 {
        assert_eq!(
            vault
                .family(&format!("family_{n}"))
                .load()
                .unwrap()
                .refresh_token,
            format!("refresh_{n}")
        );
    }
}

#[test]
fn closing_email_revokes_every_family_but_keeps_other_people() {
    let vault = VaultSet::default();
    catalog(&vault);
    let mut index: Value = serde_json::from_str(&vault.index().unwrap()).unwrap();
    index["items"]
        .as_array_mut()
        .unwrap()
        .push(json!({"family":"family_other","email":"other@example.test","contexts":[]}));
    vault.save_index(&index.to_string());
    vault.family("family_other").save(&Stored {
        sid: "other".into(),
        refresh_token: "refresh_other".into(),
    });
    let (edge, seen) = serve(Arc::new(|req, _| match req.path.as_str() {
        "/v1/identity/desk/refresh" => (200, refresh_for(req)),
        _ => (204, Value::Null),
    }));
    let families = Families::new(edge, vault.clone(), || {});
    families
        .sign_out(Some("family_a"), None, "close-email")
        .unwrap();
    assert!(vault.family("family_a").load().is_none());
    assert!(vault.family("family_b").load().is_none());
    assert!(vault.family("family_other").load().is_some());
    assert_eq!(count(&seen, "/v1/identity/sessions/family_a/logout"), 1);
    assert_eq!(count(&seen, "/v1/identity/sessions/family_b/logout"), 1);
    assert_eq!(count(&seen, "/v1/identity/sessions/family_other/logout"), 0);
}

#[test]
fn add_uses_local_family_id_keeps_new_context_and_exposes_sealed_choices() {
    let vault = VaultSet::default();
    catalog(&vault);
    let closed = Arc::new(std::sync::atomic::AtomicBool::new(false));
    let check_closed = closed.clone();
    let (edge, seen) = serve(Arc::new(move |req, _| match req.path.as_str() {
        "/v1/identity/desk/token" => (
            200,
            json!({"access_token":"access_family_c","refresh_token":"refresh_family_c","expires_in":1,"sid":"workos_sid_c","session_id":"server_family_c","contexts":[{"context_id":"context_new","org":"org_a","workspaces":"all"}]}),
        ),
        "/v1/identity/desk/refresh" => {
            let mut issued = refresh_for(req);
            issued["available_contexts"] = json!(7);
            (200, issued)
        }
        "/v1/capabilities" => (404, Value::Null),
        "/v1/identity/me" => (
            200,
            json!({"id":"same_person","email":"same@example.test","__echo":req.context}),
        ),
        "/v1/identity/contexts/context_a/logout" => {
            check_closed.store(true, Ordering::SeqCst);
            (404, Value::Null)
        }
        "/v1/identity/sessions" => {
            let family = req
                .authorization
                .as_deref()
                .unwrap()
                .strip_prefix("Bearer access_")
                .unwrap();
            let (server, contexts) = match family {
                "family_a" if check_closed.load(Ordering::SeqCst) => ("family_a", json!([])),
                "family_a" => (
                    "family_a",
                    json!([{"context_id":"context_a","org":"org_a"}]),
                ),
                "family_b" => (
                    "family_b",
                    json!([{"context_id":"context_b","org":"org_b"}]),
                ),
                _ => (
                    "server_family_c",
                    json!([{"context_id":"context_new","org":"org_a"}]),
                ),
            };
            (
                200,
                json!({"items":[{"session_id":server,"email":"same@example.test","contexts":contexts}]}),
            )
        }
        _ => (200, json!({"__echo":req.context})),
    }));
    let families = Families::new(edge, vault.clone(), || {});
    let attempt = families.begin_sign_in();
    families
        .exchange(attempt, "code", "verifier", "redirect", true)
        .unwrap();
    assert!(closed.load(Ordering::SeqCst));
    assert_eq!(count(&seen, "/v1/identity/contexts/context_a/logout"), 1);
    assert_eq!(
        families
            .fetch("GET", "/v1/workspaces", None, "key", Some("context_a"))
            .unwrap_err()
            .code(),
        "session_not_in_set"
    );
    assert!(families
        .fetch("GET", "/v1/workspaces", None, "key", Some("context_new"))
        .is_ok());
    let status = families.status();
    let sessions = status["sessions"].as_array().unwrap();
    assert_eq!(sessions.len(), 3);
    let new = sessions
        .iter()
        .find(|s| {
            s["contexts"]
                .as_array()
                .unwrap()
                .iter()
                .any(|c| c["context_id"] == "context_new")
        })
        .unwrap();
    let id = new["family"].as_str().unwrap();
    assert_ne!(id, "workos_sid_c");
    assert_ne!(id, "server_family_c");
    assert_eq!(new["contexts"][0]["workspaces"], "all");
    assert_eq!(new["available_contexts"], 7);
    assert!(vault.family(id).load().is_some());
}

#[test]
fn old_identity_cannot_replace_existing_families_when_adding() {
    for status in [404, 501] {
        let (edge, seen) = serve(Arc::new(move |_, _| (status, Value::Null)));
        let vault = VaultSet::default();
        catalog(&vault);
        let before = vault.records.lock().unwrap().clone();
        let families = Families::new(edge, vault.clone(), || {});
        families.begin_sign_in();
        let url = families.authorize_url(
            "real_challenge",
            "real_state",
            "http://127.0.0.1:1234/callback",
            true,
        );
        assert_eq!(
            families.prepare_authorize(url, true).unwrap_err().code(),
            "not_available_yet"
        );
        assert_eq!(*vault.records.lock().unwrap(), before);
        let seen = seen.lock().unwrap();
        assert_eq!(seen.len(), 1);
        assert!(!seen[0].path.contains("real_state"));
        assert!(!seen[0].path.contains("real_challenge"));
        assert!(seen[0].path.contains("mode=add"));
    }
}

#[test]
fn migration_with_an_existing_index_always_indexes_the_copied_refresh() {
    let vault = VaultSet::default();
    catalog(&vault);
    vault.save(&Stored {
        sid: "workos_legacy_sid".into(),
        refresh_token: "refresh_legacy".into(),
    });
    let (edge, _) = serve(Arc::new(|req, _| (200, refresh_for(req))));
    let families = Families::new(edge.clone(), vault.clone(), || {});
    let index: Value = serde_json::from_str(&vault.index().unwrap()).unwrap();
    let items = index["items"].as_array().unwrap();
    assert_eq!(items.len(), 3);
    let new = items
        .iter()
        .find(|i| i["family"] != "family_a" && i["family"] != "family_b")
        .unwrap();
    assert!(new["session_id"].is_null());
    let family = new["family"].as_str().unwrap();
    assert_eq!(
        vault.family(family).load().unwrap().refresh_token,
        "refresh_legacy"
    );
    assert!(vault.load().is_none());
    drop(families);
    let restored = Families::new(edge, vault, || {});
    assert!(restored.access().is_ok());
}

#[test]
fn full_index_does_not_copy_an_unindexed_legacy_refresh() {
    let vault = VaultSet::default();
    let items: Vec<_> = (0..20)
        .map(|n| json!({"family":format!("family_{n}"),"email":null,"contexts":[]}))
        .collect();
    vault.save_index(&json!({"version":1,"items":items}).to_string());
    vault.save(&Stored {
        sid: "legacy_sid".into(),
        refresh_token: "legacy_refresh".into(),
    });
    let _families = Families::new("http://127.0.0.1:1".into(), vault.clone(), || {});
    let records = vault.records.lock().unwrap();
    assert_eq!(records.len(), 2);
    assert!(records.contains_key(""));
}

#[test]
fn session_logout_falls_back_to_legacy_revocation_for_old_servers_or_missing_id() {
    for new_status in [Some(404), Some(501), None] {
        let vault = VaultSet::default();
        catalog(&vault);
        let mut index: Value = serde_json::from_str(&vault.index().unwrap()).unwrap();
        index["items"][1]["sub"] = json!("other_person");
        if new_status.is_none() {
            index["items"][0]["session_id"] = Value::Null;
        }
        vault.save_index(&index.to_string());
        let (edge, seen) = serve(Arc::new(move |req, _| match req.path.as_str() {
            "/v1/identity/desk/refresh" => (200, refresh_for(req)),
            "/v1/identity/sessions/family_a/logout" => (new_status.unwrap(), Value::Null),
            "/v1/identity/desk/logout" => (204, Value::Null),
            _ => (500, Value::Null),
        }));
        let families = Families::new(edge, vault.clone(), || {});
        families.sign_out(Some("family_a"), None, "key").unwrap();
        assert_eq!(count(&seen, "/v1/identity/desk/logout"), 1);
        assert_eq!(
            count(&seen, "/v1/identity/sessions/family_a/logout"),
            usize::from(new_status.is_some())
        );
        let log = seen.lock().unwrap();
        let logout = log
            .iter()
            .find(|r| r.path == "/v1/identity/desk/logout")
            .unwrap();
        assert_eq!(
            logout.authorization.as_deref(),
            Some("Bearer access_family_a")
        );
        assert!(vault.family("family_a").load().is_none());
        assert!(vault.family("family_b").load().is_some());
    }
}

#[test]
fn scoped_error_status_drops_body_and_401_still_renews() {
    for status in [401, 404, 501] {
        let vault = VaultSet::default();
        catalog(&vault);
        let (edge, seen) = serve(Arc::new(move |req, n| match req.path.as_str() {
            "/v1/identity/desk/refresh" => (200, refresh_for(req)),
            "/v1/workspaces" if status == 401 && n > 0 => {
                (200, json!({"__echo":"context_a","items":[]}))
            }
            _ => (
                status,
                json!({"sensitive":"foreign body","__location":"https://foreign.example.test"}),
            ),
        }));
        let families = Families::new(edge, vault, || {});
        let reply = families
            .fetch("GET", "/v1/workspaces", None, "key", Some("context_a"))
            .unwrap();
        if status == 401 {
            assert_eq!(reply.status, 200);
            assert_eq!(count(&seen, "/v1/identity/desk/refresh"), 2);
        } else {
            assert_eq!(reply.status, status);
            assert!(reply.body.is_null());
            assert!(reply.location.is_none());
        }
    }
}

#[test]
fn same_email_without_a_verified_sub_never_closes_another_family() {
    let vault = VaultSet::default();
    catalog(&vault);
    let mut index: Value = serde_json::from_str(&vault.index().unwrap()).unwrap();
    for item in index["items"].as_array_mut().unwrap() {
        item["sub"] = Value::Null;
    }
    vault.save_index(&index.to_string());
    let (edge, seen) = serve(Arc::new(|req, _| match req.path.as_str() {
        "/v1/identity/desk/refresh" => (200, refresh_for(req)),
        _ => (204, Value::Null),
    }));
    let families = Families::new(edge, vault.clone(), || {});
    families.sign_out(Some("family_a"), None, "key").unwrap();
    assert!(vault.family("family_b").load().is_some());
    assert_eq!(count(&seen, "/v1/identity/sessions/family_b/logout"), 0);
}

#[test]
fn workos_sid_is_not_a_server_session_id() {
    let vault = VaultSet::default();
    let (edge, seen) = serve(Arc::new(|req, _| match req.path.as_str() {
        "/v1/identity/desk/token" => (
            200,
            json!({"access_token":"access","refresh_token":"refresh","expires_in":300,"sid":"workos_only"}),
        ),
        "/v1/identity/me" => (200, json!({"id":"person"})),
        "/v1/identity/desk/logout" => (204, Value::Null),
        _ => (404, Value::Null),
    }));
    let families = Families::new(edge, vault.clone(), || {});
    let attempt = families.begin_sign_in();
    families
        .exchange(attempt, "code", "verifier", "redirect", true)
        .unwrap();
    let index: Value = serde_json::from_str(&vault.index().unwrap()).unwrap();
    assert!(index["items"][0]["session_id"].is_null());
    families
        .sign_out(
            Some(index["items"][0]["family"].as_str().unwrap()),
            None,
            "key",
        )
        .unwrap();
    assert_eq!(count(&seen, "/v1/identity/desk/logout"), 1);
    assert!(!seen
        .lock()
        .unwrap()
        .iter()
        .any(|r| r.path.contains("/sessions/")));
}

#[test]
fn failed_index_write_rolls_back_the_migrated_copy() {
    let vault = VaultSet {
        fail_index: true,
        ..VaultSet::default()
    };
    vault.save(&Stored {
        sid: "workos_sid".into(),
        refresh_token: "refresh_legacy".into(),
    });
    let (edge, _) = serve(Arc::new(|req, _| (200, refresh_for(req))));
    let families = Families::new(edge, vault.clone(), || {});
    assert_eq!(vault.records.lock().unwrap().len(), 1);
    assert!(families.access().is_ok());
    assert!(vault.load().is_some());
}

#[test]
fn network_during_login_or_logout_does_not_hold_the_set_lock() {
    for adding in [false, true] {
        let vault = VaultSet::default();
        catalog(&vault);
        let mut index: Value = serde_json::from_str(&vault.index().unwrap()).unwrap();
        index["items"][1]["sub"] = json!("other_person");
        vault.save_index(&index.to_string());
        let (entered_tx, entered_rx) = mpsc::channel();
        let (release_tx, release_rx) = mpsc::channel();
        let release_rx = Mutex::new(release_rx);
        let (edge, _) = serve(Arc::new(move |req, _| {
            if (!adding && req.path == "/v1/identity/sessions/family_a/logout")
                || (adding
                    && req.path == "/v1/identity/me"
                    && req.authorization.as_deref() == Some("Bearer new_access"))
            {
                entered_tx.send(()).unwrap();
                release_rx
                    .lock()
                    .unwrap()
                    .recv_timeout(Duration::from_secs(5))
                    .unwrap();
                return if adding {
                    (200, json!({"id":"new_person"}))
                } else {
                    (204, Value::Null)
                };
            }
            match req.path.as_str() {
                "/v1/identity/desk/token" => (
                    200,
                    json!({"access_token":"new_access","refresh_token":"new_refresh","expires_in":300,"session_id":"server_new"}),
                ),
                "/v1/identity/desk/refresh" => (200, refresh_for(req)),
                "/v1/capabilities" => (404, Value::Null),
                _ => (200, json!({"__echo":req.context})),
            }
        }));
        let families = Arc::new(Families::new(edge, vault, || {}));
        let actor = families.clone();
        let first = std::thread::spawn(move || {
            if adding {
                let attempt = actor.begin_sign_in();
                actor.exchange(attempt, "code", "verifier", "redirect", true)
            } else {
                actor.sign_out(Some("family_a"), None, "key")
            }
        });
        entered_rx.recv_timeout(Duration::from_secs(5)).unwrap();
        let (done_tx, done_rx) = mpsc::channel();
        let second = std::thread::spawn(move || {
            done_tx
                .send(
                    families
                        .fetch("GET", "/v1/workspaces", None, "key", Some("context_b"))
                        .is_ok(),
                )
                .unwrap()
        });
        let result = done_rx.recv_timeout(Duration::from_secs(2));
        release_tx.send(()).unwrap();
        first.join().unwrap().unwrap();
        second.join().unwrap();
        assert_eq!(result.unwrap(), true);
    }
}

#[path = "family_death_tests.rs"]
mod family_death_tests;

#[path = "promo_tests.rs"]
mod promo_tests;
