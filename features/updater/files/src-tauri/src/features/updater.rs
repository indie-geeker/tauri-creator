use serde::{Deserialize, Serialize};

const TAURI_CONFIG: &str = include_str!("../../tauri.conf.json");

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdaterStatus {
    pub configured: bool,
    pub status: String,
    pub reason: String,
    pub endpoints: Vec<String>,
    pub endpoint_configured: bool,
    pub public_key_configured: bool,
    pub missing: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UpdaterConfigSnapshot {
    pub endpoints: Vec<String>,
    pub pubkey: Option<String>,
}

fn is_placeholder(value: &str) -> bool {
    let trimmed = value.trim();
    let upper = trimmed.to_ascii_uppercase();
    trimmed.is_empty()
        || trimmed.contains("{{")
        || trimmed.contains("}}")
        || upper.contains("UPDATER_PUBLIC_KEY")
        || upper.contains("PUBLIC_KEY_HERE")
}

fn parse_config(raw: &str) -> Result<UpdaterConfigSnapshot, String> {
    let config: serde_json::Value = serde_json::from_str(raw)
        .map_err(|error| format!("failed to parse tauri config: {error}"))?;
    let updater = config
        .get("plugins")
        .and_then(|plugins| plugins.get("updater"));

    let endpoints = updater
        .and_then(|value| value.get("endpoints"))
        .and_then(|value| value.as_array())
        .map(|values| {
            values
                .iter()
                .filter_map(|value| value.as_str().map(ToString::to_string))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    let pubkey = updater
        .and_then(|value| value.get("pubkey"))
        .and_then(|value| value.as_str())
        .map(ToString::to_string);

    Ok(UpdaterConfigSnapshot { endpoints, pubkey })
}

pub fn get_updater_status_from_config(config: UpdaterConfigSnapshot) -> UpdaterStatus {
    let endpoint_configured = config
        .endpoints
        .iter()
        .any(|endpoint| endpoint.starts_with("https://") && !is_placeholder(endpoint));
    let public_key_configured = config
        .pubkey
        .as_deref()
        .is_some_and(|pubkey| !is_placeholder(pubkey));
    let configured = endpoint_configured && public_key_configured;
    let mut missing = Vec::new();

    if !endpoint_configured {
        missing.push("endpoint".to_string());
    }
    if !public_key_configured {
        missing.push("publicKey".to_string());
    }

    let reason = if configured {
        "Updater is configured with an HTTPS endpoint and public key.".to_string()
    } else if missing.len() == 2 {
        "Updater endpoint and public key are not configured.".to_string()
    } else if missing.contains(&"endpoint".to_string()) {
        "Updater endpoint is not configured.".to_string()
    } else {
        "Updater public key is not configured.".to_string()
    };

    UpdaterStatus {
        configured,
        status: if configured { "ready" } else { "disabled" }.to_string(),
        reason,
        endpoints: config.endpoints,
        endpoint_configured,
        public_key_configured,
        missing,
    }
}

#[tauri::command]
pub fn get_updater_status() -> Result<UpdaterStatus, String> {
    parse_config(TAURI_CONFIG).map(get_updater_status_from_config)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_endpoint_reports_not_configured() {
        let status = get_updater_status_from_config(UpdaterConfigSnapshot {
            endpoints: vec![],
            pubkey: Some("REPLACE_WITH_UPDATER_PUBLIC_KEY".to_string()),
        });

        assert!(!status.configured);
        assert_eq!(status.status, "disabled");
        assert!(!status.endpoint_configured);
        assert!(!status.public_key_configured);
        assert!(status.missing.contains(&"endpoint".to_string()));
    }

    #[test]
    fn configured_updater_reports_endpoint_and_public_key_status() {
        let status = get_updater_status_from_config(UpdaterConfigSnapshot {
            endpoints: vec!["https://example.com/releases/latest/download/latest.json".to_string()],
            pubkey: Some("real-public-key".to_string()),
        });

        assert!(status.configured);
        assert_eq!(status.status, "ready");
        assert!(status.endpoint_configured);
        assert!(status.public_key_configured);
        assert_eq!(
            status.endpoints,
            vec!["https://example.com/releases/latest/download/latest.json"]
        );
        assert!(status.missing.is_empty());
    }

    #[test]
    fn placeholder_public_key_is_actionable_disabled_status() {
        let status = get_updater_status_from_config(UpdaterConfigSnapshot {
            endpoints: vec![
                "https://github.com/example/app/releases/latest/download/latest.json".to_string(),
            ],
            pubkey: Some("REPLACE_WITH_UPDATER_PUBLIC_KEY".to_string()),
        });

        assert!(!status.configured);
        assert_eq!(status.status, "disabled");
        assert!(status.reason.contains("public key"));
        assert!(status.missing.contains(&"publicKey".to_string()));
    }

    #[test]
    fn command_returns_actionable_status_from_embedded_tauri_config() {
        let status = get_updater_status().expect("updater status should parse tauri config");

        assert_eq!(status.status, "disabled");
        assert!(status.endpoint_configured);
        assert!(!status.public_key_configured);
        assert!(status.reason.contains("public key"));
    }
}
