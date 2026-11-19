//! Familias independientes; el índice contiene solo metadatos públicos.
use super::session::{self, Desk, Fail, Reply, Vault};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};

pub(super) trait FamilyVault: Vault + Clone + 'static {
    fn family(&self, id: &str) -> Self;
    fn index(&self) -> Option<String>;
    fn save_index(&self, index: &str) -> bool;
}

#[derive(Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub(super) struct Context {
    pub context_id: String,
    pub org: String,
    pub org_name: Option<String>,
    pub plan: Option<String>,
    #[serde(
        default,
        deserialize_with = "super::context_role::deserialize",
        skip_serializing_if = "Option::is_none"
    )]
    pub role: Option<String>,
    #[serde(
        default,
        deserialize_with = "session::deserialize_empty_reason",
        skip_serializing_if = "Option::is_none"
    )]
    pub empty_reason: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workspaces: Option<String>,
}
#[derive(Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
struct Metadata {
    family: String,
    #[serde(default)]
    session_id: Option<String>,
    #[serde(default)]
    sub: Option<String>,
    #[serde(default)]
    available_contexts: Option<u64>,
    email: Option<String>,
    #[serde(
        default,
        deserialize_with = "session::deserialize_empty_reason",
        skip_serializing_if = "Option::is_none"
    )]
    empty_reason: Option<String>,
    contexts: Vec<Context>,
}
#[derive(Default, Serialize, Deserialize)]
struct Index {
    version: u8,
    #[serde(default)]
    legacy_retired: bool,
    #[serde(default)]
    legacy_family: Option<String>,
    items: Vec<Metadata>,
    default_family: Option<String>,
    default_context: Option<String>,
}
struct Family<V: FamilyVault> {
    metadata: Metadata,
    desk: Arc<Desk<V>>,
}
struct Set<V: FamilyVault> {
    families: Vec<Family<V>>,
    default_family: Option<String>,
    default_context: Option<String>,
    attempt: u64,
    legacy_family: Option<String>,
    removed: Vec<Value>,
}
pub(super) struct Families<V: FamilyVault> {
    edge: String,
    vault: V,
    set: Mutex<Set<V>>,
    mutations: Mutex<()>,
    changed: Arc<dyn Fn() + Send + Sync>,
}
fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(PoisonError::into_inner)
}
fn refused(code: &str) -> Fail {
    Fail::Refused {
        status: 400,
        code: code.into(),
    }
}
impl<V: FamilyVault> Families<V> {
    pub fn new(edge: String, vault: V, changed: impl Fn() + Send + Sync + 'static) -> Self {
        let mut index = vault
            .index()
            .and_then(|s| serde_json::from_str::<Index>(&s).ok())
            .filter(|i| i.version == 1)
            .unwrap_or_default();
        let mut legacy_family = None;
        if !index.legacy_retired {
            if let Some(stored) = vault.load() {
                let id = index
                    .legacy_family
                    .clone()
                    .filter(|id| session::opaque_id(id))
                    .unwrap_or_else(|| super::pkce::random(24).expect("OS randomness"));
                if !index.items.iter().any(|m| m.family == id) && index.items.len() < 20 {
                    index.items.push(Metadata {
                        family: id.clone(),
                        ..Metadata::default()
                    });
                    if index.default_family.is_none() {
                        index.default_family = Some(id.clone());
                    }
                }
                index.version = 1;
                index.legacy_retired = true;
                index.legacy_family = None;
                // El marcador evita resucitar el secreto anterior si falla su borrado.
                if index.items.iter().any(|m| m.family == id)
                    && vault.family(&id).save(&stored)
                    && vault.save_index(
                        &serde_json::to_string(&index).expect("public session metadata"),
                    )
                {
                    vault.clear();
                } else {
                    if index.items.iter().any(|m| m.family == id) {
                        vault.family(&id).clear();
                    }
                    index.legacy_retired = false;
                    index.legacy_family = Some(id.clone());
                    legacy_family = Some(id);
                }
            }
        }
        let changed: Arc<dyn Fn() + Send + Sync> = Arc::new(changed);
        let families = index
            .items
            .into_iter()
            .filter(|m| session::opaque_id(&m.family))
            .take(20)
            .map(|metadata| {
                let notify = changed.clone();
                let desk = Arc::new(Desk::new(
                    edge.clone(),
                    if legacy_family.as_ref() == Some(&metadata.family) {
                        vault.clone()
                    } else {
                        vault.family(&metadata.family)
                    },
                    move || notify(),
                ));
                Family { metadata, desk }
            })
            .collect();
        Self {
            edge,
            vault,
            set: Mutex::new(Set {
                families,
                default_family: index.default_family,
                default_context: index.default_context,
                attempt: 0,
                removed: Vec::new(),
                legacy_family,
            }),
            changed,
            mutations: Mutex::new(()),
        }
    }
    fn persist(&self, set: &Set<V>) {
        let index = Index {
            version: 1,
            legacy_retired: set.legacy_family.is_none(),
            legacy_family: set.legacy_family.clone(),
            items: set.families.iter().map(|f| f.metadata.clone()).collect(),
            default_family: set.default_family.clone(),
            default_context: set.default_context.clone(),
        };
        self.vault
            .save_index(&serde_json::to_string(&index).expect("public session metadata"));
    }
    fn selected(&self, family: Option<&str>, context: Option<&str>) -> Result<Arc<Desk<V>>, Fail> {
        let set = lock(&self.set);
        let found = if let Some(context) = context {
            let mut owners = set
                .families
                .iter()
                .filter(|f| f.metadata.contexts.iter().any(|c| c.context_id == context));
            let first = owners.next();
            if owners.next().is_some() {
                return Err(refused("session_not_in_set"));
            }
            first
        } else {
            let id = family.or(set.default_family.as_deref());
            set.families
                .iter()
                .find(|f| Some(f.metadata.family.as_str()) == id)
        };
        found
            .map(|f| f.desk.clone())
            .ok_or_else(|| refused("session_not_in_set"))
    }
    pub fn access(&self) -> Result<session::Live, Fail> {
        self.selected(None, None)?.access()
    }
    pub fn edge(&self) -> &str {
        &self.edge
    }
    pub fn begin_sign_in(&self) -> u64 {
        let mut set = lock(&self.set);
        set.attempt += 1;
        set.attempt
    }
    pub fn is_signing_in(&self, attempt: u64) -> bool {
        lock(&self.set).attempt == attempt
    }
    pub fn authorize_url(&self, challenge: &str, state: &str, redirect: &str, add: bool) -> String {
        let temp = Desk::new(&self.edge, self.vault.clone(), || {});
        let mut url = temp.authorize_url(challenge, state, redirect);
        if add {
            url.push_str("&mode=add");
        }
        url
    }
    pub fn prepare_authorize(&self, url: String, add: bool) -> Result<String, Fail> {
        if add {
            let disposable = super::pkce::random(32).ok_or_else(|| refused("unavailable"))?;
            let verifier = super::pkce::random(32).ok_or_else(|| refused("unavailable"))?;
            let mut probe = tauri::Url::parse(&url).map_err(|_| refused("invalid_request"))?;
            let pairs: Vec<_> = probe
                .query_pairs()
                .map(|(key, value)| {
                    let value = match key.as_ref() {
                        "state" => disposable.clone(),
                        "code_challenge" => super::pkce::challenge_of(&verifier),
                        _ => value.into_owned(),
                    };
                    (key.into_owned(), value)
                })
                .collect();
            probe.query_pairs_mut().clear().extend_pairs(pairs);
            let reply = session::request(probe.as_str(), "GET", None, None)?;
            if matches!(reply.status, 404 | 501) {
                return Err(session::failure(&reply, "not_available_yet"));
            }
        }
        Ok(url)
    }
    pub fn capabilities(&self) -> session::Capabilities {
        Desk::new(&self.edge, self.vault.clone(), || {}).capabilities()
    }
    pub fn exchange(
        &self,
        attempt: u64,
        code: &str,
        verifier: &str,
        redirect: &str,
        add: bool,
    ) -> Result<(), Fail> {
        let reply = session::request(
            &format!("{}/v1/identity/desk/token", self.edge),
            "POST",
            None,
            Some(
                &json!({"grant_type":"authorization_code", "code":code, "code_verifier":verifier,
                "redirect_uri":redirect, "client_id":session::CLIENT_ID}),
            ),
        )?;
        if reply.status != 200 {
            return Err(session::failure(&reply, "invalid_grant"));
        }
        let issued = session::tokens(&reply.body).ok_or_else(|| refused("invalid_response"))?;
        let server_id = match reply.body.get("session_id") {
            Some(value) => Some(
                value
                    .as_str()
                    .filter(|id| session::opaque_id(id))
                    .ok_or_else(|| refused("invalid_response"))?
                    .to_owned(),
            ),
            None => None,
        };
        let id = super::pkce::random(24).ok_or_else(|| refused("unavailable"))?;
        let mut contexts: Vec<Context> = match reply.body.get("contexts") {
            Some(value) => {
                serde_json::from_value(value.clone()).map_err(|_| refused("invalid_response"))?
            }
            None => Vec::new(),
        };
        if contexts.len() > 20
            || contexts
                .iter()
                .any(|c| !session::opaque_id(&c.context_id) || !session::opaque_id(&c.org))
        {
            return Err(refused("invalid_response"));
        }
        for context in &mut contexts {
            if !matches!(context.workspaces.as_deref(), Some("all" | "later")) {
                context.workspaces = None;
            }
        }
        let _mutation = lock(&self.mutations);
        let mut set = lock(&self.set);
        if set.attempt != attempt {
            return Err(refused("cancelled"));
        }
        if add && set.families.len() >= 20 && !set.families.iter().any(|f| f.metadata.family == id)
        {
            return Err(refused("too_many_sessions"));
        }
        let previous = if !add {
            set.legacy_family = None;
            set.default_family = None;
            set.default_context = None;
            std::mem::take(&mut set.families)
        } else {
            Vec::new()
        };
        drop(set);
        for old in previous {
            old.desk.sign_out();
        }
        let notify = self.changed.clone();
        let desk = Arc::new(Desk::new(&self.edge, self.vault.family(&id), move || {
            notify()
        }));
        desk.install(issued);
        let profile = desk.status();
        let mut set = lock(&self.set);
        if set.attempt != attempt {
            drop(set);
            desk.sign_out();
            return Err(refused("cancelled"));
        }
        set.families.retain(|f| f.metadata.family != id);
        set.families.push(Family {
            metadata: Metadata {
                family: id.clone(),
                session_id: server_id,
                sub: profile["account"].as_str().map(str::to_owned),
                email: profile["email"].as_str().map(str::to_owned),
                empty_reason: None,
                contexts,
                available_contexts: reply.body["available_contexts"].as_u64(),
            },
            desk,
        });
        if !add || set.default_family.is_none() {
            set.default_family = Some(id);
        }
        drop(set);
        self.prune_duplicates();
        self.persist(&lock(&self.set));
        (self.changed)();
        Ok(())
    }
    pub fn status(&self) -> Value {
        let _mutation = lock(&self.mutations);
        let before = {
            let set = lock(&self.set);
            (
                set.families
                    .iter()
                    .map(|f| f.metadata.clone())
                    .collect::<Vec<_>>(),
                set.default_context.clone(),
            )
        };
        let snapshot: Vec<_> = lock(&self.set)
            .families
            .iter()
            .map(|f| (f.metadata.clone(), f.desk.clone()))
            .collect();
        let mut value = super::disconnected();
        let mut supported = Vec::new();
        let mut fallback = None;
        let mut lost = Vec::new();
        for (metadata, desk) in snapshot {
            let id = metadata.family.clone();
            let state = desk.status();
            if state["state"] == "disconnected" {
                lost.push((id, desk));
                continue;
            }
            fallback.get_or_insert_with(|| json!({"state":"connected", "online":state["online"], "storage":state["storage"]}));
            if lock(&self.set).default_family.as_ref() == Some(&id) {
                value = state.clone();
            }
            if let Ok(reply) = desk.fetch("GET", "/v1/identity/sessions", None, "") {
                if reply.status == 200 {
                    if let Some(items) = reply.body["items"].as_array() {
                        // El portador solo puede describir su propia familia.
                        if let Some(item) = items
                            .iter()
                            .find(|i| {
                                metadata
                                    .session_id
                                    .as_deref()
                                    .is_some_and(|server| i["session_id"].as_str() == Some(server))
                            })
                            .or_else(|| (items.len() == 1).then(|| &items[0]))
                        {
                            if !item["session_id"].as_str().is_some_and(session::opaque_id) {
                                continue;
                            }
                            if let Some(contexts) = item["contexts"]
                                .as_array()
                                .and_then(|c| serde_json::from_value::<Vec<Context>>(json!(c)).ok())
                            {
                                let contexts: Vec<_> = contexts
                                    .into_iter()
                                    .filter(|c| {
                                        session::opaque_id(&c.context_id)
                                            && session::opaque_id(&c.org)
                                    })
                                    .take(20)
                                    .collect();
                                if let Some(first) = contexts.first() {
                                    if !desk
                                        .fetch_context(
                                            "GET",
                                            "/v1/identity/me",
                                            None,
                                            "",
                                            Some(&first.context_id),
                                        )
                                        .is_ok_and(|reply| (200..300).contains(&reply.status))
                                    {
                                        continue;
                                    }
                                }
                                let mut set = lock(&self.set);
                                if let Some(f) = set.families.iter_mut().find(|f| {
                                    f.metadata.family == id && Arc::ptr_eq(&f.desk, &desk)
                                }) {
                                    f.metadata.session_id = item["session_id"]
                                        .as_str()
                                        .filter(|s| session::opaque_id(s))
                                        .map(str::to_owned);
                                    f.metadata.empty_reason = item["empty_reason"]
                                        .as_str()
                                        .or(reply.body["empty_reason"].as_str())
                                        .and_then(session::empty_reason)
                                        .or(reply.empty_reason)
                                        .map(str::to_owned);
                                    f.metadata.email = item["email"]
                                        .as_str()
                                        .or(state["email"].as_str())
                                        .map(str::to_owned);
                                    f.metadata.sub = state["account"]
                                        .as_str()
                                        .map(str::to_owned)
                                        .or(f.metadata.sub.clone());
                                    f.metadata.available_contexts =
                                        desk.available_contexts().or(f.metadata.available_contexts);
                                    // Las listas viejas no traen la elección sellada en el canje.
                                    f.metadata.contexts = contexts
                                        .into_iter()
                                        .map(|mut c| {
                                            if c.workspaces.is_none() {
                                                c.workspaces = f
                                                    .metadata
                                                    .contexts
                                                    .iter()
                                                    .find(|old| old.context_id == c.context_id)
                                                    .and_then(|old| old.workspaces.clone());
                                            }
                                            c
                                        })
                                        .collect();
                                    supported.push(id.clone());
                                }
                                if set.default_family.as_ref() == Some(&id) {
                                    set.default_context = reply.body["default_context"]
                                        .as_str()
                                        .map(str::to_owned)
                                        .filter(|c| {
                                            set.families.iter().any(|f| {
                                                f.metadata.family == id
                                                    && f.metadata
                                                        .contexts
                                                        .iter()
                                                        .any(|x| &x.context_id == c)
                                            })
                                        });
                                }
                                self.persist(&set);
                            }
                        }
                    }
                }
            }
        }
        let mut set = lock(&self.set);
        if !lost.is_empty() {
            if set
                .legacy_family
                .as_ref()
                .is_some_and(|legacy| lost.iter().any(|(id, _)| id == legacy))
            {
                set.legacy_family = None;
            }
            set.families.retain(|f| {
                !lost
                    .iter()
                    .any(|(id, desk)| &f.metadata.family == id && Arc::ptr_eq(&f.desk, desk))
            });
            self.persist(&set);
        }
        drop(set);
        self.prune_duplicates();
        let mut set = lock(&self.set);
        if set
            .default_family
            .as_ref()
            .is_some_and(|id| !set.families.iter().any(|f| &f.metadata.family == id))
        {
            set.default_family = None;
            set.default_context = None;
        }
        if !set.families.is_empty() && value["state"] == "disconnected" {
            if let Some(connected) = fallback {
                value = connected;
            }
        }
        self.persist(&set);
        if !set.families.is_empty() && supported.len() == set.families.len() {
            value["sessions"] = json!(set
                .families
                .iter()
                .map(|f| {
                    let mut value = json!({"family":f.metadata.family,"email":f.metadata.email,"contexts":f.metadata.contexts});
                    if let Some(reason) = &f.metadata.empty_reason { value["empty_reason"] = json!(reason); }
                    if let Some(count) = f.metadata.available_contexts { value["available_contexts"] = json!(count); }
                    value
                })
                .collect::<Vec<_>>());
            value["default_context"] = json!(set.default_context);
        }
        let after = (
            set.families
                .iter()
                .map(|f| f.metadata.clone())
                .collect::<Vec<_>>(),
            set.default_context.clone(),
        );
        if !set.removed.is_empty() {
            value["removed"] = json!(std::mem::take(&mut set.removed));
        }
        drop(set);
        if before != after {
            (self.changed)();
        }
        value
    }
    pub fn fetch(
        &self,
        method: &str,
        path: &str,
        body: Option<&Value>,
        key: &str,
        context: Option<&str>,
    ) -> Result<Reply, Fail> {
        if !session::valid_promo_request(method, path, body, context) {
            return Err(refused("invalid_request"));
        }
        if context.is_some_and(|c| !session::opaque_id(c)) {
            return Err(refused("session_not_in_set"));
        }
        let desk = self.selected(None, context)?;
        let result = desk.fetch_context(method, path, body, key, context);
        match &result {
            Err(Fail::NoSession) => self.retire_family(&desk),
            Ok(reply)
                if context.is_some()
                    && ((reply.status == 401 && reply.code == Some("session_not_in_set"))
                        || (reply.status == 403
                            && reply.code == Some("organization_access_denied"))) =>
            {
                self.retire_context(&desk, context.expect("explicit context"), reply.code);
            }
            _ => {}
        }
        result
    }
    fn retire_family(&self, desk: &Arc<Desk<V>>) {
        desk.forget();
        let mut set = lock(&self.set);
        let family = set
            .families
            .iter()
            .find(|f| Arc::ptr_eq(&f.desk, desk))
            .map(|f| f.metadata.family.clone());
        let Some(family) = family else {
            return;
        };
        set.families.retain(|f| f.metadata.family != family);
        if set.default_family.as_ref() == Some(&family) {
            set.default_family = None;
            set.default_context = None;
        }
        if set.legacy_family.as_ref() == Some(&family) {
            set.legacy_family = None;
        }
        self.persist(&set);
        drop(set);
        (self.changed)();
    }
    fn retire_context(&self, desk: &Arc<Desk<V>>, context: &str, reason: Option<&str>) {
        let metadata = {
            let set = lock(&self.set);
            let Some(family) = set.families.iter().find(|f| Arc::ptr_eq(&f.desk, desk)) else {
                return;
            };
            family.metadata.clone()
        };
        let refreshed = desk.fetch("GET", "/v1/identity/sessions", None, "");
        let reply = match refreshed {
            Err(Fail::NoSession) => {
                self.retire_family(desk);
                return;
            }
            Ok(reply) if reply.status == 200 => reply,
            _ => return,
        };
        let Some(items) = reply.body["items"].as_array() else {
            return;
        };
        let item = items
            .iter()
            .find(|i| {
                metadata
                    .session_id
                    .as_deref()
                    .is_some_and(|id| i["session_id"] == id)
            })
            .or_else(|| (items.len() == 1).then(|| &items[0]));
        let Some(item) = item else {
            return;
        };
        let Ok(contexts) = serde_json::from_value::<Vec<Context>>(item["contexts"].clone()) else {
            return;
        };
        if contexts.iter().any(|c| c.context_id == context) {
            return;
        }
        let _mutation = lock(&self.mutations);
        let mut set = lock(&self.set);
        let Some(family) = set.families.iter_mut().find(|f| Arc::ptr_eq(&f.desk, desk)) else {
            return;
        };
        let removed = family
            .metadata
            .contexts
            .iter()
            .find(|c| c.context_id == context)
            .cloned();
        family.metadata.contexts = contexts
            .into_iter()
            .filter(|c| session::opaque_id(&c.context_id) && session::opaque_id(&c.org))
            .take(20)
            .map(|mut c| {
                if c.workspaces.is_none() {
                    c.workspaces = family
                        .metadata
                        .contexts
                        .iter()
                        .find(|old| old.context_id == c.context_id)
                        .and_then(|old| old.workspaces.clone());
                }
                c
            })
            .collect();
        if reason == Some("organization_access_denied") {
            if let Some(removed) = removed {
                set.removed.push(json!({"context_id":removed.context_id,"org":removed.org,"reason":"organization_access_denied"}));
            }
        }
        if set.default_context.as_deref() == Some(context) {
            set.default_context = None;
            set.default_family = None;
        }
        self.persist(&set);
        drop(set);
        (self.changed)();
    }
    fn prune_duplicates(&self) {
        let duplicates = {
            let set = lock(&self.set);
            let mut duplicates = Vec::new();
            for newer in (0..set.families.len()).rev() {
                for old in &set.families[..newer] {
                    let newest = &set.families[newer].metadata;
                    if !same_person(newest, &old.metadata) {
                        continue;
                    }
                    for context in &old.metadata.contexts {
                        if newest.contexts.iter().any(|c| c.org == context.org) {
                            duplicates.push((
                                old.metadata.family.clone(),
                                old.desk.clone(),
                                context.context_id.clone(),
                            ));
                        }
                    }
                }
            }
            duplicates
        };
        for (family, desk, id) in duplicates {
            let Some(key) = super::pkce::random(18) else {
                continue;
            };
            if desk
                .fetch(
                    "POST",
                    &format!("/v1/identity/contexts/{id}/logout"),
                    None,
                    &key,
                )
                .is_ok_and(|reply| matches!(reply.status, 200..=299 | 404))
            {
                let mut set = lock(&self.set);
                if let Some(old) = set
                    .families
                    .iter_mut()
                    .find(|f| f.metadata.family == family)
                {
                    old.metadata.contexts.retain(|c| c.context_id != id);
                }
                if set.default_context.as_ref() == Some(&id) {
                    set.default_context = None;
                    set.default_family = None;
                }
            }
        }
    }
    pub fn sign_out(
        &self,
        family: Option<&str>,
        context: Option<&str>,
        key: &str,
    ) -> Result<(), Fail> {
        let _mutation = lock(&self.mutations);
        if let Some(context) = context {
            if !session::opaque_id(context) {
                return Err(refused("session_not_in_set"));
            }
            let Ok(desk) = self.selected(None, Some(context)) else {
                return Ok(());
            };
            let reply = desk.fetch(
                "POST",
                &format!("/v1/identity/contexts/{context}/logout"),
                None,
                key,
            )?;
            if !matches!(reply.status, 200..=299 | 404) {
                return Err(session::failure(&reply, "request_failed"));
            }
            let mut set = lock(&self.set);
            for f in &mut set.families {
                f.metadata.contexts.retain(|c| c.context_id != context);
            }
            if set.default_context.as_deref() == Some(context) {
                set.default_context = None;
                set.default_family = None;
            }
            self.persist(&set);
        } else if let Some(id) = family {
            if !session::opaque_id(id) {
                return Err(refused("session_not_in_set"));
            }
            let selected = {
                let set = lock(&self.set);
                let Some(anchor) = set.families.iter().find(|f| f.metadata.family == id) else {
                    return Ok(());
                };
                set.families
                    .iter()
                    .filter(|f| {
                        same_person(&anchor.metadata, &f.metadata) || f.metadata.family == id
                    })
                    .map(|f| (f.metadata.clone(), f.desk.clone()))
                    .collect::<Vec<_>>()
            };
            let mut failure = None;
            for (metadata, desk) in selected {
                let result = match metadata.session_id.as_deref() {
                    Some(server) => desk
                        .fetch(
                            "POST",
                            &format!("/v1/identity/sessions/{server}/logout"),
                            None,
                            &format!("{key}-{}", metadata.family),
                        )
                        .map(|reply| (reply.status, Some(reply))),
                    None => Ok((404, None)),
                };
                match result {
                    Ok((404 | 501, _)) => {
                        desk.sign_out();
                    }
                    Ok((200..=299, _)) | Err(Fail::NoSession) => desk.forget(),
                    Ok((_, Some(reply))) => {
                        failure = Some(session::failure(&reply, "request_failed"));
                        continue;
                    }
                    Err(error) => {
                        failure = Some(error);
                        continue;
                    }
                    _ => continue,
                }
                let mut set = lock(&self.set);
                set.families
                    .retain(|f| f.metadata.family != metadata.family);
                if set.legacy_family.as_ref() == Some(&metadata.family) {
                    set.legacy_family = None;
                }
                if set.default_family.as_ref() == Some(&metadata.family) {
                    set.default_family = None;
                    set.default_context = None;
                }
                self.persist(&set);
            }
            if let Some(error) = failure {
                (self.changed)();
                return Err(error);
            }
        } else {
            let previous = {
                let mut set = lock(&self.set);
                set.attempt += 1;
                set.legacy_family = None;
                set.default_family = None;
                set.default_context = None;
                let previous = std::mem::take(&mut set.families);
                self.persist(&set);
                previous
            };
            for f in previous {
                f.desk.sign_out();
            }
            self.vault.clear();
        }
        (self.changed)();
        Ok(())
    }
}

fn same_person(a: &Metadata, b: &Metadata) -> bool {
    a.sub
        .as_deref()
        .zip(b.sub.as_deref())
        .is_some_and(|(a, b)| !a.is_empty() && a == b)
}
