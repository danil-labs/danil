use serde::{Deserialize, Deserializer};
use serde_json::Value;

pub(super) fn deserialize<'de, D: Deserializer<'de>>(
    deserializer: D,
) -> Result<Option<String>, D::Error> {
    let value = Value::deserialize(deserializer)?;
    Ok(value
        .as_str()
        .filter(|role| role.chars().count() <= 128)
        .map(str::to_owned))
}

#[cfg(test)]
mod tests {
    use crate::extracted::desk_auth::families::Context;
    use serde_json::json;

    #[test]
    fn session_context_list_preserves_roles_without_interpreting_them() {
        for role in [
            "owner",
            "admin",
            "member",
            "guest",
            "future-role",
            &"x".repeat(128),
        ] {
            let contexts: Vec<Context> = serde_json::from_value(json!([{
                "context_id":"ctx", "org":"org", "role":role
            }]))
            .unwrap();
            assert_eq!(contexts[0].role.as_deref(), Some(role));
            assert_eq!(serde_json::to_value(&contexts).unwrap()[0]["role"], role);
        }
    }

    #[test]
    fn session_context_discards_oversized_or_nontext_roles() {
        for role in [json!("x".repeat(129)), json!(false), json!(null), json!({})] {
            let contexts: Vec<Context> = serde_json::from_value(json!([{
                "context_id":"ctx", "org":"org", "role":role
            }]))
            .unwrap();
            assert!(contexts[0].role.is_none());
        }
        let missing: Context =
            serde_json::from_value(json!({"context_id":"ctx","org":"org"})).unwrap();
        assert!(missing.role.is_none());
    }
}
