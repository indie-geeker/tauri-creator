use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticsSnapshot {
    pub app_name: String,
    pub app_version: String,
    pub platform: String,
    pub arch: String,
    pub app_data_dir: Option<String>,
    pub log_dir: Option<String>,
    pub status: String,
    pub checks: Vec<DiagnosticsCheck>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticsCheck {
    pub name: String,
    pub status: String,
    pub detail: String,
}

fn path_to_string(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

fn path_check(name: &str, path: Option<&Path>, missing_status: &str) -> DiagnosticsCheck {
    match path {
        Some(path) if path.exists() => DiagnosticsCheck {
            name: name.to_string(),
            status: "ok".to_string(),
            detail: path_to_string(path),
        },
        Some(path) => DiagnosticsCheck {
            name: name.to_string(),
            status: missing_status.to_string(),
            detail: format!("Path does not exist: {}", path_to_string(path)),
        },
        None => DiagnosticsCheck {
            name: name.to_string(),
            status: missing_status.to_string(),
            detail: "Path could not be resolved.".to_string(),
        },
    }
}

fn aggregate_status(checks: &[DiagnosticsCheck]) -> String {
    if checks.iter().any(|check| check.status == "error") {
        return "error".to_string();
    }

    if checks.iter().any(|check| check.status == "warning") {
        return "warning".to_string();
    }

    "ok".to_string()
}

pub fn collect_diagnostics_from_paths(
    app_data_dir: Option<PathBuf>,
    log_dir: Option<PathBuf>,
) -> DiagnosticsSnapshot {
    let checks = vec![
        DiagnosticsCheck {
            name: "diagnostics-feature".to_string(),
            status: "ok".to_string(),
            detail: "Diagnostics feature is enabled.".to_string(),
        },
        path_check("app-data-dir", app_data_dir.as_deref(), "warning"),
        path_check("log-dir", log_dir.as_deref(), "warning"),
    ];

    DiagnosticsSnapshot {
        app_name: env!("CARGO_PKG_NAME").to_string(),
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        platform: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        app_data_dir: app_data_dir.as_deref().map(path_to_string),
        log_dir: log_dir.as_deref().map(path_to_string),
        status: aggregate_status(&checks),
        checks,
    }
}

pub fn export_diagnostics_snapshot(snapshot: &DiagnosticsSnapshot) -> Result<String, String> {
    serde_json::to_string_pretty(snapshot)
        .map_err(|error| format!("failed to serialize diagnostics: {error}"))
}

#[tauri::command]
pub fn collect_diagnostics(app: AppHandle) -> DiagnosticsSnapshot {
    collect_diagnostics_from_paths(
        app.path().app_data_dir().ok(),
        app.path().app_log_dir().ok(),
    )
}

#[tauri::command]
pub fn export_diagnostics(app: AppHandle) -> Result<String, String> {
    export_diagnostics_snapshot(&collect_diagnostics(app))
}

#[cfg(test)]
mod tests {
    use super::{collect_diagnostics_from_paths, export_diagnostics_snapshot};
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn unique_temp_dir(name: &str) -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time should be valid")
            .as_nanos();
        std::env::temp_dir().join(format!("tauri-creator-diagnostics-{name}-{unique}"))
    }

    #[test]
    fn collect_diagnostics_includes_runtime_and_paths() {
        let app_data_dir = unique_temp_dir("app-data");
        let log_dir = unique_temp_dir("logs");
        fs::create_dir_all(&app_data_dir).expect("app data dir should be created");
        fs::create_dir_all(&log_dir).expect("log dir should be created");

        let snapshot =
            collect_diagnostics_from_paths(Some(app_data_dir.clone()), Some(log_dir.clone()));

        assert_eq!(snapshot.app_name, env!("CARGO_PKG_NAME"));
        assert_eq!(snapshot.app_version, env!("CARGO_PKG_VERSION"));
        assert_eq!(snapshot.platform, std::env::consts::OS);
        assert_eq!(snapshot.arch, std::env::consts::ARCH);
        assert_eq!(
            snapshot.app_data_dir.as_deref(),
            Some(app_data_dir.to_string_lossy().as_ref())
        );
        assert_eq!(
            snapshot.log_dir.as_deref(),
            Some(log_dir.to_string_lossy().as_ref())
        );
        assert_eq!(snapshot.status, "ok");
        assert!(snapshot
            .checks
            .iter()
            .any(|check| check.name == "diagnostics-feature" && check.status == "ok"));
        assert!(snapshot
            .checks
            .iter()
            .any(|check| check.name == "app-data-dir" && check.status == "ok"));
        assert!(snapshot
            .checks
            .iter()
            .any(|check| check.name == "log-dir" && check.status == "ok"));

        let _ = fs::remove_dir_all(app_data_dir);
        let _ = fs::remove_dir_all(log_dir);
    }

    #[test]
    fn export_diagnostics_returns_pretty_json_with_support_fields() {
        let app_data_dir = unique_temp_dir("export-app-data");
        let log_dir = unique_temp_dir("export-logs");
        fs::create_dir_all(&app_data_dir).expect("app data dir should be created");
        fs::create_dir_all(&log_dir).expect("log dir should be created");

        let snapshot = collect_diagnostics_from_paths(Some(app_data_dir.clone()), Some(log_dir));
        let exported =
            export_diagnostics_snapshot(&snapshot).expect("diagnostics should serialize");

        assert!(exported.contains('\n'));
        assert!(exported.contains("\"appName\""));
        assert!(exported.contains("\"appVersion\""));
        assert!(exported.contains("\"appDataDir\""));
        assert!(exported.contains("\"logDir\""));
        assert!(exported.contains("\"checks\""));
        assert!(exported.contains("\"status\": \"ok\""));

        let parsed: serde_json::Value =
            serde_json::from_str(&exported).expect("export should be valid JSON");
        assert_eq!(parsed["appName"], env!("CARGO_PKG_NAME"));

        let _ = fs::remove_dir_all(app_data_dir);
    }

    #[test]
    fn collect_diagnostics_warns_when_log_directory_is_missing() {
        let app_data_dir = unique_temp_dir("missing-log-app-data");
        let missing_log_dir = unique_temp_dir("missing-logs");
        fs::create_dir_all(&app_data_dir).expect("app data dir should be created");

        let snapshot =
            collect_diagnostics_from_paths(Some(app_data_dir.clone()), Some(missing_log_dir));
        let log_check = snapshot
            .checks
            .iter()
            .find(|check| check.name == "log-dir")
            .expect("log-dir check should exist");

        assert_eq!(snapshot.status, "warning");
        assert_eq!(log_check.status, "warning");

        let _ = fs::remove_dir_all(app_data_dir);
    }
}
