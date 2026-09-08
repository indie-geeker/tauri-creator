use serde::{Deserialize, Serialize};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{
    atomic::{AtomicU64, Ordering},
    Mutex, OnceLock,
};
use tauri::{AppHandle, Emitter, Manager};

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ThemePreference {
    #[default]
    System,
    Light,
    Dark,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
pub enum LanguagePreference {
    #[default]
    #[serde(rename = "system")]
    System,
    #[serde(rename = "en")]
    En,
    #[serde(rename = "zh-CN")]
    ZhCn,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct PreferencesSnapshot {
    pub theme: ThemePreference,
    #[serde(default)]
    pub language: LanguagePreference,
    #[serde(default)]
    pub quick_pane_shortcut: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PreferencesPatch {
    #[serde(default)]
    pub theme: Option<ThemePreference>,
    #[serde(default)]
    pub language: Option<LanguagePreference>,
}

#[derive(Default)]
pub struct PreferencesStore {
    transaction: Mutex<()>,
}

pub fn preferences_store() -> &'static PreferencesStore {
    static STORE: OnceLock<PreferencesStore> = OnceLock::new();
    STORE.get_or_init(PreferencesStore::default)
}

pub(crate) fn preferences_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|dir| dir.join("preferences.json"))
        .map_err(|error| format!("failed to resolve app data directory: {error}"))
}

fn read_preferences(path: &Path) -> Result<PreferencesSnapshot, String> {
    let contents = match std::fs::read_to_string(path) {
        Ok(contents) => contents,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(PreferencesSnapshot::default())
        }
        Err(error) => return Err(format!("failed to read preferences file: {error}")),
    };
    let snapshot: PreferencesSnapshot = serde_json::from_str(&contents)
        .map_err(|error| format!("failed to parse preferences file: {error}"))?;
    validate_shortcut(&snapshot.quick_pane_shortcut)?;
    Ok(snapshot)
}

fn validate_shortcut(shortcut: &Option<String>) -> Result<(), String> {
    if shortcut
        .as_deref()
        .is_some_and(|value| value.trim().is_empty())
    {
        return Err("quick-pane shortcut cannot be empty".into());
    }
    Ok(())
}

fn write_preferences(path: &Path, snapshot: &PreferencesSnapshot) -> Result<(), String> {
    static NEXT_TEMP: AtomicU64 = AtomicU64::new(0);
    let parent = path.parent().ok_or("preferences path has no parent")?;
    std::fs::create_dir_all(parent)
        .map_err(|e| format!("failed to create preferences directory: {e}"))?;
    let contents = serde_json::to_vec_pretty(snapshot).map_err(|e| e.to_string())?;
    let mut temporary = None;
    for _ in 0..32 {
        let sequence = NEXT_TEMP.fetch_add(1, Ordering::Relaxed);
        let candidate = parent.join(format!(
            ".preferences-{}-{sequence}.tmp",
            std::process::id()
        ));
        match std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&candidate)
        {
            Ok(file) => {
                temporary = Some((candidate, file));
                break;
            }
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(format!("failed to create preferences temp file: {e}")),
        }
    }
    let (temp_path, mut file) = temporary.ok_or("failed to allocate preferences temp file")?;
    let result = file.write_all(&contents).and_then(|_| file.sync_all());
    drop(file);
    let result = result.and_then(|_| std::fs::rename(&temp_path, path));
    if let Err(error) = result {
        let _ = std::fs::remove_file(&temp_path);
        return Err(format!("failed to persist preferences: {error}"));
    }
    Ok(())
}

impl PreferencesStore {
    pub fn load(&self, path: &Path) -> Result<PreferencesSnapshot, String> {
        let _guard = self
            .transaction
            .lock()
            .map_err(|_| "preferences store lock poisoned")?;
        read_preferences(path)
    }
    pub fn patch(
        &self,
        path: &Path,
        patch: PreferencesPatch,
    ) -> Result<PreferencesSnapshot, String> {
        self.update(path, |snapshot| {
            if let Some(theme) = patch.theme {
                snapshot.theme = theme;
            }
            if let Some(language) = patch.language {
                snapshot.language = language;
            }
        })
    }
    pub fn set_shortcut(
        &self,
        path: &Path,
        shortcut: Option<String>,
    ) -> Result<PreferencesSnapshot, String> {
        validate_shortcut(&shortcut)?;
        self.update(path, |snapshot| snapshot.quick_pane_shortcut = shortcut)
    }
    fn update(
        &self,
        path: &Path,
        apply: impl FnOnce(&mut PreferencesSnapshot),
    ) -> Result<PreferencesSnapshot, String> {
        let _guard = self
            .transaction
            .lock()
            .map_err(|_| "preferences store lock poisoned")?;
        let mut snapshot = read_preferences(path)?;
        apply(&mut snapshot);
        write_preferences(path, &snapshot)?;
        Ok(snapshot)
    }
}

pub fn load_preferences_from_path(path: &Path) -> Result<PreferencesSnapshot, String> {
    preferences_store().load(path)
}

pub fn load_quick_pane_shortcut(app: &AppHandle) -> Option<String> {
    preferences_path(app)
        .ok()
        .and_then(|path| preferences_store().load(&path).ok())
        .and_then(|snapshot| snapshot.quick_pane_shortcut)
}

#[tauri::command]
pub async fn load_preferences(app: AppHandle) -> Result<PreferencesSnapshot, String> {
    let path = preferences_path(&app)?;
    tauri::async_runtime::spawn_blocking(move || preferences_store().load(&path))
        .await
        .map_err(|e| format!("preferences worker failed: {e}"))?
}

#[tauri::command]
pub async fn patch_preferences(
    app: AppHandle,
    patch: PreferencesPatch,
) -> Result<PreferencesSnapshot, String> {
    let path = preferences_path(&app)?;
    let snapshot =
        tauri::async_runtime::spawn_blocking(move || preferences_store().patch(&path, patch))
            .await
            .map_err(|e| format!("preferences worker failed: {e}"))??;
    // Persistence has committed. Event delivery failure must not masquerade as a failed save.
    if let Err(error) = app.emit("preferences-changed", ()) {
        eprintln!("preferences event failed: {error}");
    }
    Ok(snapshot)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> PathBuf {
        static NEXT: AtomicU64 = AtomicU64::new(0);
        std::env::temp_dir()
            .join(format!(
                "preferences-store-{}-{}-{}",
                std::process::id(),
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_nanos(),
                NEXT.fetch_add(1, Ordering::Relaxed)
            ))
            .join("preferences.json")
    }
    #[test]
    fn missing_and_legacy_preferences_remain_compatible() {
        let path = fixture();
        let store = PreferencesStore::default();
        assert_eq!(store.load(&path).unwrap(), PreferencesSnapshot::default());
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(&path, r#"{"theme":"dark"}"#).unwrap();
        let snapshot = store.load(&path).unwrap();
        assert_eq!(snapshot.theme, ThemePreference::Dark);
        assert_eq!(snapshot.language, LanguagePreference::System);
        std::fs::remove_dir_all(path.parent().unwrap()).unwrap();
    }
    #[test]
    fn corrupt_file_is_never_overwritten_by_patch_or_shortcut() {
        let path = fixture();
        let store = PreferencesStore::default();
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(&path, "corrupted preferences").unwrap();
        assert!(store.load(&path).is_err());
        assert!(store.patch(&path, PreferencesPatch::default()).is_err());
        assert!(store.set_shortcut(&path, None).is_err());
        assert_eq!(
            std::fs::read_to_string(&path).unwrap(),
            "corrupted preferences"
        );
        std::fs::remove_dir_all(path.parent().unwrap()).unwrap();
    }
    #[test]
    fn patch_rejects_unknown_fields_and_invalid_enums() {
        for value in [
            r#"{"quick_pane_shortcut":"Alt+X"}"#,
            r#"{"theme":"neon"}"#,
            r#"{"language":"fr"}"#,
        ] {
            assert!(serde_json::from_str::<PreferencesPatch>(value).is_err());
        }
    }
    #[test]
    fn concurrent_field_updates_preserve_all_fields() {
        let path = fixture();
        let store = PreferencesStore::default();
        std::thread::scope(|scope| {
            scope.spawn(|| {
                store
                    .patch(
                        &path,
                        PreferencesPatch {
                            theme: Some(ThemePreference::Dark),
                            ..Default::default()
                        },
                    )
                    .unwrap()
            });
            scope.spawn(|| {
                store
                    .patch(
                        &path,
                        PreferencesPatch {
                            language: Some(LanguagePreference::ZhCn),
                            ..Default::default()
                        },
                    )
                    .unwrap()
            });
            scope.spawn(|| store.set_shortcut(&path, Some("Alt+X".into())).unwrap());
        });
        let snapshot = store.load(&path).unwrap();
        assert_eq!(snapshot.theme, ThemePreference::Dark);
        assert_eq!(snapshot.language, LanguagePreference::ZhCn);
        assert_eq!(snapshot.quick_pane_shortcut.as_deref(), Some("Alt+X"));
        assert_eq!(
            std::fs::read_dir(path.parent().unwrap()).unwrap().count(),
            1
        );
        std::fs::remove_dir_all(path.parent().unwrap()).unwrap();
    }
    #[test]
    fn write_failure_and_invalid_shortcut_leave_prior_data_intact() {
        let path = fixture();
        let store = PreferencesStore::default();
        store.patch(&path, PreferencesPatch::default()).unwrap();
        let before = std::fs::read(&path).unwrap();
        assert!(store.set_shortcut(&path, Some(" ".into())).is_err());
        assert_eq!(std::fs::read(&path).unwrap(), before);
        let blocked = path.join("child.json");
        assert!(store.patch(&blocked, PreferencesPatch::default()).is_err());
        assert_eq!(std::fs::read(&path).unwrap(), before);
        std::fs::remove_dir_all(path.parent().unwrap()).unwrap();
    }
}
