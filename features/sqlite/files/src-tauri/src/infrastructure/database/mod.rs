use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager, State};
use worker::DatabaseWorker;

pub mod migrations;
pub mod notes;
pub mod worker;

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
    pub id: String,
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
    pub id: String,
    pub title: String,
    pub body: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteSummary {
    pub id: String,
    pub title: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteCursor {
    pub updated_at: String,
    pub id: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ListNotesInput {
    #[serde(default)]
    pub limit: Option<u32>,
    #[serde(default)]
    pub cursor: Option<NoteCursor>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NotePage {
    pub items: Vec<NoteSummary>,
    pub next_cursor: Option<NoteCursor>,
}

pub fn database_path_from_app_data_dir(directory: &Path) -> PathBuf {
    directory.join("app.sqlite3")
}

fn open_database(path: &Path) -> Result<Connection, String> {
    if let Some(parent) = path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
    {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("failed to create database directory: {e}"))?;
    }
    let connection = Connection::open(path).map_err(|e| format!("failed to open database: {e}"))?;
    connection
        .busy_timeout(std::time::Duration::from_secs(2))
        .map_err(|e| e.to_string())?;
    connection
        .execute_batch("PRAGMA foreign_keys = ON;")
        .map_err(|e| e.to_string())?;
    migrations::run_migrations(&connection)?;
    Ok(connection)
}

pub fn init_database(app: &tauri::App) -> Result<(), String> {
    let directory = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let worker = DatabaseWorker::open(
        database_path_from_app_data_dir(&directory),
        worker::QUEUE_CAPACITY,
    )?;
    if !app.manage(worker) {
        return Err("database worker was already initialized".into());
    }
    Ok(())
}

/// Called from the synchronous application Exit callback, outside the async executor.
pub fn shutdown_database(app: &AppHandle) {
    if let Some(worker) = app.try_state::<DatabaseWorker>() {
        if let Err(error) = worker.shutdown() {
            eprintln!("database shutdown failed: {error}");
        }
    }
}

#[tauri::command]
pub async fn get_database_health(
    database: State<'_, DatabaseWorker>,
) -> Result<DatabaseHealth, String> {
    let path = database.path.to_string_lossy().into_owned();
    database
        .request(move |connection| {
            connection
                .query_row("SELECT 1 FROM notes LIMIT 1", [], |_| Ok(()))
                .or_else(|e| {
                    if matches!(e, rusqlite::Error::QueryReturnedNoRows) {
                        Ok(())
                    } else {
                        Err(e)
                    }
                })
                .map_err(|e| e.to_string())?;
            Ok(DatabaseHealth {
                status: "ok".into(),
                driver: "sqlite".into(),
                path,
                file_backed: true,
            })
        })
        .await
}

#[tauri::command]
pub async fn list_notes(
    database: State<'_, DatabaseWorker>,
    input: ListNotesInput,
) -> Result<NotePage, String> {
    database
        .request(move |connection| notes::list_notes(connection, &input))
        .await
}

#[tauri::command]
pub async fn get_note(database: State<'_, DatabaseWorker>, id: String) -> Result<Note, String> {
    database
        .request(move |connection| notes::get_note(connection, &id))
        .await
}

#[tauri::command]
pub async fn create_note(
    database: State<'_, DatabaseWorker>,
    input: CreateNoteInput,
) -> Result<Note, String> {
    database
        .request(move |connection| notes::create_note(connection, &input))
        .await
}

#[tauri::command]
pub async fn update_note(
    database: State<'_, DatabaseWorker>,
    input: UpdateNoteInput,
) -> Result<Note, String> {
    database
        .request(move |connection| notes::update_note(connection, &input))
        .await
}

#[tauri::command]
pub async fn delete_note(database: State<'_, DatabaseWorker>, id: String) -> Result<(), String> {
    database
        .request(move |connection| notes::delete_note(connection, &id))
        .await
}

#[cfg(test)]
mod tests {
    use super::*;
    fn memory() -> Connection {
        let connection = Connection::open_in_memory().unwrap();
        migrations::run_migrations(&connection).unwrap();
        connection
    }
    #[test]
    fn note_id_serializes_as_an_exact_decimal_string() {
        let connection = memory();
        connection
            .execute(
                "INSERT INTO notes (id,title,body) VALUES(9007199254740993,'fixture','large body')",
                [],
            )
            .unwrap();
        let note = notes::get_note(&connection, "9007199254740993").unwrap();
        assert_eq!(
            serde_json::to_value(note).unwrap()["id"],
            "9007199254740993"
        );
    }
    #[test]
    fn notes_crud_preserves_body_and_deletes() {
        let connection = memory();
        let created = notes::create_note(
            &connection,
            &CreateNoteInput {
                title: "first".into(),
                body: "body".into(),
            },
        )
        .unwrap();
        let updated = notes::update_note(
            &connection,
            &UpdateNoteInput {
                id: created.id.clone(),
                title: "second".into(),
                body: "changed".into(),
            },
        )
        .unwrap();
        assert_eq!(notes::get_note(&connection, &created.id).unwrap(), updated);
        notes::delete_note(&connection, &created.id).unwrap();
        assert!(notes::get_note(&connection, &created.id).is_err());
        assert!(notes::delete_note(&connection, &created.id).is_err());
    }
    #[test]
    fn paging_ties_are_stable_and_list_does_not_export_body() {
        let connection = memory();
        for id in 1..=105 {
            connection.execute("INSERT INTO notes(id,title,body,updated_at) VALUES(?1,'title','private body','2026-01-01T00:00:00Z')", [id]).unwrap();
        }
        let mut input = ListNotesInput::default();
        let mut ids = Vec::new();
        loop {
            let page = notes::list_notes(&connection, &input).unwrap();
            assert!(page.items.len() <= 50);
            for note in &page.items {
                assert!(serde_json::to_value(note).unwrap().get("body").is_none());
            }
            ids.extend(
                page.items
                    .iter()
                    .map(|note| note.id.parse::<i32>().unwrap()),
            );
            input.cursor = page.next_cursor;
            if input.cursor.is_none() {
                break;
            }
        }
        assert_eq!(ids, (1..=105).rev().collect::<Vec<_>>());
        for limit in [0, 201] {
            assert!(notes::list_notes(
                &connection,
                &ListNotesInput {
                    limit: Some(limit),
                    cursor: None
                }
            )
            .is_err());
        }
    }
    #[test]
    fn worker_reopening_preserves_data_on_disk() {
        let directory = std::env::temp_dir().join(format!(
            "sqlite-worker-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let path = database_path_from_app_data_dir(&directory);
        let worker = DatabaseWorker::open(path.clone(), 2).unwrap();
        let note = tauri::async_runtime::block_on(worker.request(|connection| {
            notes::create_note(
                connection,
                &CreateNoteInput {
                    title: "persisted".into(),
                    body: "body".into(),
                },
            )
        }))
        .unwrap();
        worker.shutdown().unwrap();
        let worker = DatabaseWorker::open(path, 2).unwrap();
        let restored = tauri::async_runtime::block_on(
            worker.request(move |connection| notes::get_note(connection, &note.id)),
        )
        .unwrap();
        assert_eq!(restored.title, "persisted");
        worker.shutdown().unwrap();
        std::fs::remove_dir_all(directory).unwrap();
    }
}
