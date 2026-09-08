use super::{
    CreateNoteInput, ListNotesInput, Note, NoteCursor, NotePage, NoteSummary, UpdateNoteInput,
};
use rusqlite::{params, Connection, OptionalExtension, Row};

fn note_from_row(row: &Row<'_>) -> rusqlite::Result<Note> {
    Ok(Note {
        id: row.get::<_, i64>(0)?.to_string(),
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

pub fn list_notes(connection: &Connection, input: &ListNotesInput) -> Result<NotePage, String> {
    let limit = input.limit.unwrap_or(50);
    if limit == 0 || limit > 200 {
        return Err("page limit must be between 1 and 200".into());
    }
    let (sql, values) = match &input.cursor {
        Some(cursor) => (
            "SELECT id, title, created_at, updated_at FROM notes WHERE (updated_at, id) < (?1, ?2) ORDER BY updated_at DESC, id DESC LIMIT ?3",
            vec![rusqlite::types::Value::Text(cursor.updated_at.clone()), rusqlite::types::Value::Integer(parse_note_id(&cursor.id)?), rusqlite::types::Value::Integer(i64::from(limit + 1))],
        ),
        None => (
            "SELECT id, title, created_at, updated_at FROM notes ORDER BY updated_at DESC, id DESC LIMIT ?1",
            vec![rusqlite::types::Value::Integer(i64::from(limit + 1))],
        ),
    };
    let mut statement = connection.prepare(sql).map_err(|e| e.to_string())?;
    let mut items = statement
        .query_map(rusqlite::params_from_iter(values), |row| {
            Ok(NoteSummary {
                id: row.get::<_, i64>(0)?.to_string(),
                title: row.get(1)?,
                created_at: row.get(2)?,
                updated_at: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    let has_more = items.len() > limit as usize;
    items.truncate(limit as usize);
    let next_cursor = if has_more {
        items.last().map(|note| NoteCursor {
            updated_at: note.updated_at.clone(),
            id: note.id.clone(),
        })
    } else {
        None
    };
    Ok(NotePage { items, next_cursor })
}

pub fn get_note(connection: &Connection, id: &str) -> Result<Note, String> {
    get_note_by_id(connection, parse_note_id(id)?)
}

pub fn create_note(connection: &Connection, input: &CreateNoteInput) -> Result<Note, String> {
    validate_note_fields(&input.title)?;

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
    get_note_by_id(connection, id)
}

pub fn update_note(connection: &Connection, input: &UpdateNoteInput) -> Result<Note, String> {
    validate_note_fields(&input.title)?;
    let id = parse_note_id(&input.id)?;

    let changed = connection
        .execute(
            r#"
            UPDATE notes
            SET title = ?1,
                body = ?2,
                updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            WHERE id = ?3
            "#,
            params![input.title.trim(), input.body, id],
        )
        .map_err(|error| format!("failed to update note: {error}"))?;

    if changed == 0 {
        return Err(format!("note {} does not exist", input.id));
    }

    get_note_by_id(connection, id)
}

pub fn delete_note(connection: &Connection, id: &str) -> Result<(), String> {
    let id = parse_note_id(id)?;
    let changed = connection
        .execute("DELETE FROM notes WHERE id = ?1", params![id])
        .map_err(|error| format!("failed to delete note: {error}"))?;

    if changed == 0 {
        return Err(format!("note {id} does not exist"));
    }

    Ok(())
}

fn get_note_by_id(connection: &Connection, id: i64) -> Result<Note, String> {
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

/// Require canonical positive decimal i64 IDs before opening the database.
fn parse_note_id(value: &str) -> Result<i64, String> {
    if value.is_empty()
        || value.starts_with('0')
        || !value.bytes().all(|byte| byte.is_ascii_digit())
    {
        return Err("note id must be a positive decimal i64 string".into());
    }
    value
        .parse::<i64>()
        .map_err(|_| "note id is outside the positive i64 range".into())
}

#[cfg(test)]
mod id_tests {
    use super::*;

    #[test]
    fn ids_reject_noncanonical_or_out_of_range_input() {
        for id in [
            "",
            "0",
            "-1",
            "+1",
            "01",
            " 1",
            "1 ",
            "1.0",
            "9223372036854775808",
        ] {
            assert!(parse_note_id(id).is_err(), "accepted {id:?}");
        }
        assert_eq!(
            parse_note_id("9007199254740993").unwrap(),
            9_007_199_254_740_993
        );
        assert_eq!(parse_note_id("9223372036854775807").unwrap(), i64::MAX);
    }

    #[test]
    fn invalid_ids_are_rejected_before_database_io() {
        let connection = Connection::open_in_memory().unwrap();
        assert!(delete_note(&connection, "-1")
            .unwrap_err()
            .starts_with("note id"));
        let input = UpdateNoteInput {
            id: "0".into(),
            title: "test".into(),
            body: String::new(),
        };
        assert!(update_note(&connection, &input)
            .unwrap_err()
            .starts_with("note id"));
    }
}
