use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PreferencesSnapshot {
    pub theme: String,
    #[serde(default = "default_language")]
    pub language: String,
    #[serde(default)]
    pub quick_pane_shortcut: Option<String>,
}

impl Default for PreferencesSnapshot {
    fn default() -> Self {
        Self {
            theme: "system".to_string(),
            language: default_language(),
            quick_pane_shortcut: None,
        }
    }
}

fn default_language() -> String {
    "system".to_string()
}

fn validate_theme(theme: &str) -> Result<(), String> {
    match theme {
        "system" | "light" | "dark" => Ok(()),
        other => Err(format!("invalid theme '{other}'")),
    }
}

fn validate_language(language: &str) -> Result<(), String> {
    match language {
        "system" | "en" | "zh-CN" => Ok(()),
        other => Err(format!("invalid language '{other}'")),
    }
}

fn validate_quick_pane_shortcut(shortcut: &Option<String>) -> Result<(), String> {
    if shortcut
        .as_deref()
        .is_some_and(|value| value.trim().is_empty())
    {
        return Err("quick-pane shortcut cannot be empty".to_string());
    }

    Ok(())
}

fn preferences_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("failed to resolve app data directory: {error}"))?;

    std::fs::create_dir_all(&app_data_dir)
        .map_err(|error| format!("failed to create app data directory: {error}"))?;

    Ok(app_data_dir.join("preferences.json"))
}

pub fn load_preferences_from_path(path: &Path) -> Result<PreferencesSnapshot, String> {
    if !path.exists() {
        return Ok(PreferencesSnapshot::default());
    }

    let contents = std::fs::read_to_string(path)
        .map_err(|error| format!("failed to read preferences file: {error}"))?;
    let preferences = serde_json::from_str::<PreferencesSnapshot>(&contents)
        .map_err(|error| format!("failed to parse preferences file: {error}"))?;

    validate_theme(&preferences.theme)?;
    validate_language(&preferences.language)?;
    validate_quick_pane_shortcut(&preferences.quick_pane_shortcut)?;

    Ok(preferences)
}

pub fn save_preferences_to_path(
    path: &Path,
    preferences: &PreferencesSnapshot,
) -> Result<(), String> {
    validate_theme(&preferences.theme)?;
    validate_language(&preferences.language)?;
    validate_quick_pane_shortcut(&preferences.quick_pane_shortcut)?;

    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|error| format!("failed to create preferences directory: {error}"))?;
    }

    let contents = serde_json::to_string_pretty(preferences)
        .map_err(|error| format!("failed to serialize preferences: {error}"))?;
    let temp_path = path.with_extension("tmp");

    std::fs::write(&temp_path, contents)
        .map_err(|error| format!("failed to write preferences temp file: {error}"))?;

    if let Err(error) = std::fs::rename(&temp_path, path) {
        let _ = std::fs::remove_file(&temp_path);
        return Err(format!("failed to finalize preferences file: {error}"));
    }

    Ok(())
}

pub fn load_quick_pane_shortcut(app: &AppHandle) -> Option<String> {
    let path = preferences_path(app).ok()?;
    load_preferences_from_path(&path)
        .ok()
        .and_then(|preferences| preferences.quick_pane_shortcut)
}

#[tauri::command]
pub fn load_preferences(app: AppHandle) -> Result<PreferencesSnapshot, String> {
    load_preferences_from_path(&preferences_path(&app)?)
}

#[tauri::command]
pub fn save_preferences(
    app: AppHandle,
    preferences: PreferencesSnapshot,
) -> Result<PreferencesSnapshot, String> {
    let path = preferences_path(&app)?;
    save_preferences_to_path(&path, &preferences)?;
    Ok(preferences)
}

#[cfg(test)]
mod tests {
    use super::{load_preferences_from_path, save_preferences_to_path, PreferencesSnapshot};
    use std::fs;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::{SystemTime, UNIX_EPOCH};

    static TEMP_PATH_COUNTER: AtomicU64 = AtomicU64::new(0);

    fn temp_preferences_path() -> PathBuf {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time should be valid")
            .as_nanos();
        let counter = TEMP_PATH_COUNTER.fetch_add(1, Ordering::Relaxed);
        std::env::temp_dir().join(format!(
            "tauri-creator-preferences-{}-{timestamp}-{counter}.json",
            std::process::id()
        ))
    }

    #[test]
    fn load_preferences_from_path_returns_default_when_file_is_missing() {
        let path = temp_preferences_path();

        let loaded =
            load_preferences_from_path(&path).expect("missing preferences should load defaults");

        assert_eq!(loaded, PreferencesSnapshot::default());
    }

    #[test]
    fn load_preferences_from_path_defaults_language_for_legacy_files() {
        let path = temp_preferences_path();
        fs::write(&path, r#"{"theme":"dark"}"#).expect("legacy preferences should write");

        let loaded = load_preferences_from_path(&path).expect("legacy preferences should load");

        assert_eq!(
            loaded,
            PreferencesSnapshot {
                theme: "dark".to_string(),
                language: "system".to_string(),
                quick_pane_shortcut: None,
            }
        );

        let _ = fs::remove_file(path);
    }

    #[test]
    fn save_preferences_to_path_persists_json_atomically() {
        let path = temp_preferences_path();
        let preferences = PreferencesSnapshot {
            theme: "dark".to_string(),
            language: "zh-CN".to_string(),
            quick_pane_shortcut: Some("CommandOrControl+Alt+Space".to_string()),
        };

        save_preferences_to_path(&path, &preferences).expect("preferences should save");
        let loaded = load_preferences_from_path(&path).expect("saved preferences should load");

        assert_eq!(loaded, preferences);
        assert!(!path.with_extension("tmp").exists());

        let _ = fs::remove_file(path);
    }

    #[test]
    fn save_preferences_to_path_rejects_invalid_theme() {
        let path = temp_preferences_path();
        let error = save_preferences_to_path(
            &path,
            &PreferencesSnapshot {
                theme: "neon".to_string(),
                language: "system".to_string(),
                quick_pane_shortcut: None,
            },
        )
        .expect_err("invalid theme should fail validation");

        assert!(error.contains("invalid theme"));
        assert!(!path.exists());
    }

    #[test]
    fn save_preferences_to_path_rejects_invalid_language() {
        let path = temp_preferences_path();
        let error = save_preferences_to_path(
            &path,
            &PreferencesSnapshot {
                theme: "system".to_string(),
                language: "fr".to_string(),
                quick_pane_shortcut: None,
            },
        )
        .expect_err("invalid language should fail validation");

        assert!(error.contains("invalid language"));
        assert!(!path.exists());
    }

    #[test]
    fn save_preferences_to_path_rejects_empty_quick_pane_shortcut() {
        let path = temp_preferences_path();
        let error = save_preferences_to_path(
            &path,
            &PreferencesSnapshot {
                theme: "system".to_string(),
                language: "system".to_string(),
                quick_pane_shortcut: Some("   ".to_string()),
            },
        )
        .expect_err("empty quick-pane shortcut should fail validation");

        assert!(error.contains("quick-pane shortcut cannot be empty"));
        assert!(!path.exists());
    }
}
