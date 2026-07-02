use super::{open_database, CreateNoteInput, Note, UpdateNoteInput};
use rusqlite::{params, Connection, OptionalExtension, Row};
use std::path::Path;

fn note_from_row(row: &Row<'_>) -> rusqlite::Result<Note> {
    Ok(Note {
        id: row.get(0)?,
        title: row.get(1)?,
        body: row.get(2)?,
        created_at: row.get(3)?,
        updated_at: row.get(4)?,
    })
}

fn validate_note_fields(title: &str) -> Result<(), String> {
    if title.trim().is_empty() {
        return Err("note title cannot be empty".to_string());
    }

    Ok(())
}

pub fn list_notes_at_path(path: &Path) -> Result<Vec<Note>, String> {
    let connection = open_database(path)?;
    let mut statement = connection
        .prepare(
            r#"
            SELECT id, title, body, created_at, updated_at
            FROM notes
            ORDER BY updated_at DESC, id DESC
            "#,
        )
        .map_err(|error| format!("failed to prepare notes query: {error}"))?;

    let notes = statement
        .query_map([], note_from_row)
        .map_err(|error| format!("failed to query notes: {error}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("failed to read notes: {error}"))?;

    Ok(notes)
}

pub fn create_note_at_path(path: &Path, input: &CreateNoteInput) -> Result<Note, String> {
    validate_note_fields(&input.title)?;

    let connection = open_database(path)?;
    connection
        .execute(
            r#"
            INSERT INTO notes (title, body)
            VALUES (?1, ?2)
            "#,
            params![input.title.trim(), input.body],
        )
        .map_err(|error| format!("failed to create note: {error}"))?;

    let id = connection.last_insert_rowid();
    get_note(&connection, id)
}

pub fn update_note_at_path(path: &Path, input: &UpdateNoteInput) -> Result<Note, String> {
    validate_note_fields(&input.title)?;

    let connection = open_database(path)?;
    let changed = connection
        .execute(
            r#"
            UPDATE notes
            SET title = ?1,
                body = ?2,
                updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            WHERE id = ?3
            "#,
            params![input.title.trim(), input.body, input.id],
        )
        .map_err(|error| format!("failed to update note: {error}"))?;

    if changed == 0 {
        return Err(format!("note {} does not exist", input.id));
    }

    get_note(&connection, input.id)
}

pub fn delete_note_at_path(path: &Path, id: i64) -> Result<(), String> {
    let connection = open_database(path)?;
    let changed = connection
        .execute("DELETE FROM notes WHERE id = ?1", params![id])
        .map_err(|error| format!("failed to delete note: {error}"))?;

    if changed == 0 {
        return Err(format!("note {id} does not exist"));
    }

    Ok(())
}

fn get_note(connection: &Connection, id: i64) -> Result<Note, String> {
    connection
        .query_row(
            r#"
            SELECT id, title, body, created_at, updated_at
            FROM notes
            WHERE id = ?1
            "#,
            params![id],
            note_from_row,
        )
        .optional()
        .map_err(|error| format!("failed to load note: {error}"))?
        .ok_or_else(|| format!("note {id} does not exist"))
}
