use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

pub mod migrations;
pub mod notes;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseHealth {
    pub status: String,
    pub driver: String,
    pub path: String,
    pub file_backed: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Note {
    pub id: i64,
    pub title: String,
    pub body: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateNoteInput {
    pub title: String,
    pub body: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateNoteInput {
    pub id: i64,
    pub title: String,
    pub body: String,
}

pub fn database_path_from_app_data_dir(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("app.sqlite3")
}

pub fn open_database(path: &Path) -> Result<Connection, String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|error| format!("failed to create database directory: {error}"))?;
    }

    let connection =
        Connection::open(path).map_err(|error| format!("failed to open database: {error}"))?;
    connection
        .execute_batch("PRAGMA foreign_keys = ON;")
        .map_err(|error| format!("failed to enable database pragmas: {error}"))?;
    migrations::run_migrations(&connection)?;

    Ok(connection)
}

fn app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|error| format!("failed to resolve app data directory: {error}"))
}

fn path_to_string(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

pub fn get_database_health_from_app_data_dir(
    app_data_dir: &Path,
) -> Result<DatabaseHealth, String> {
    let path = database_path_from_app_data_dir(app_data_dir);
    let connection = open_database(&path)?;
    let notes_table_count: i64 = connection
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'notes'",
            [],
            |row| row.get(0),
        )
        .map_err(|error| format!("failed to inspect database schema: {error}"))?;

    Ok(DatabaseHealth {
        status: if notes_table_count == 1 {
            "ok"
        } else {
            "error"
        }
        .to_string(),
        driver: "sqlite".to_string(),
        path: path_to_string(&path),
        file_backed: true,
    })
}

#[tauri::command]
pub fn get_database_health(app: AppHandle) -> Result<DatabaseHealth, String> {
    get_database_health_from_app_data_dir(&app_data_dir(&app)?)
}

#[tauri::command]
pub fn list_notes(app: AppHandle) -> Result<Vec<Note>, String> {
    notes::list_notes_at_path(&database_path_from_app_data_dir(&app_data_dir(&app)?))
}

#[tauri::command]
pub fn create_note(app: AppHandle, input: CreateNoteInput) -> Result<Note, String> {
    notes::create_note_at_path(
        &database_path_from_app_data_dir(&app_data_dir(&app)?),
        &input,
    )
}

#[tauri::command]
pub fn update_note(app: AppHandle, input: UpdateNoteInput) -> Result<Note, String> {
    notes::update_note_at_path(
        &database_path_from_app_data_dir(&app_data_dir(&app)?),
        &input,
    )
}

#[tauri::command]
pub fn delete_note(app: AppHandle, id: i64) -> Result<(), String> {
    notes::delete_note_at_path(&database_path_from_app_data_dir(&app_data_dir(&app)?), id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn unique_temp_dir(name: &str) -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time should be valid")
            .as_nanos();
        std::env::temp_dir().join(format!("tauri-creator-sqlite-{name}-{unique}"))
    }

    #[test]
    fn get_database_health_reports_sqlite_driver() {
        let app_data_dir = unique_temp_dir("driver");
        let health = get_database_health_from_app_data_dir(&app_data_dir)
            .expect("database health should be available");

        assert_eq!(health.status, "ok");
        assert_eq!(health.driver, "sqlite");

        let _ = fs::remove_dir_all(app_data_dir);
    }

    #[test]
    fn database_path_resolves_under_app_data_dir() {
        let app_data_dir = unique_temp_dir("path");
        let database_path = database_path_from_app_data_dir(&app_data_dir);

        assert!(database_path.starts_with(&app_data_dir));
        assert_eq!(
            database_path.file_name().and_then(|name| name.to_str()),
            Some("app.sqlite3")
        );
    }

    #[test]
    fn migrations_create_notes_table() {
        let app_data_dir = unique_temp_dir("migrations");
        let database_path = database_path_from_app_data_dir(&app_data_dir);
        let connection = open_database(&database_path).expect("database should open");

        migrations::run_migrations(&connection).expect("migrations should run");

        let table_count: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'notes'",
                [],
                |row| row.get(0),
            )
            .expect("notes table query should work");
        assert_eq!(table_count, 1);

        let _ = fs::remove_dir_all(app_data_dir);
    }

    #[test]
    fn notes_repository_persists_across_connections() {
        let app_data_dir = unique_temp_dir("notes");
        let database_path = database_path_from_app_data_dir(&app_data_dir);

        let created = notes::create_note_at_path(
            &database_path,
            &CreateNoteInput {
                title: "First note".to_string(),
                body: "Created from a generated app.".to_string(),
            },
        )
        .expect("note should be created");

        let listed = notes::list_notes_at_path(&database_path).expect("notes should list");
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].title, "First note");

        let updated = notes::update_note_at_path(
            &database_path,
            &UpdateNoteInput {
                id: created.id,
                title: "Updated note".to_string(),
                body: "Updated across connections.".to_string(),
            },
        )
        .expect("note should update");
        assert_eq!(updated.title, "Updated note");

        notes::delete_note_at_path(&database_path, created.id).expect("note should delete");
        let after_delete = notes::list_notes_at_path(&database_path).expect("notes should list");
        assert!(after_delete.is_empty());

        let _ = fs::remove_dir_all(app_data_dir);
    }

    #[test]
    fn database_health_reports_file_backed_database_path() {
        let app_data_dir = unique_temp_dir("health");
        let health = get_database_health_from_app_data_dir(&app_data_dir)
            .expect("database health should be available");

        assert_eq!(health.status, "ok");
        assert_eq!(health.driver, "sqlite");
        assert!(health.file_backed);
        assert!(health.path.ends_with("app.sqlite3"));

        let _ = fs::remove_dir_all(app_data_dir);
    }
}
