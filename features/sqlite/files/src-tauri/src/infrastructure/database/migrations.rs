use rusqlite::Connection;

const CURRENT_VERSION: i32 = 1;
const NOTES_SCHEMA: &str = r#"
CREATE TABLE notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
"#;
const PAGE_INDEX: &str = "DROP INDEX IF EXISTS idx_notes_updated_at; CREATE INDEX IF NOT EXISTS idx_notes_page ON notes(updated_at DESC, id DESC);";

fn known_notes_schema(connection: &Connection) -> Result<bool, String> {
    let views: i32 = connection
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='view'",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    if views != 0 {
        return Err("unrecognized database views".into());
    }
    let mut statement = connection.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").map_err(|e| e.to_string())?;
    let tables = statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    if tables.is_empty() {
        return Ok(false);
    }
    if tables != ["notes"] {
        return Err("unrecognized database schema: unexpected tables".into());
    }
    let mut statement = connection
        .prepare("PRAGMA table_info(notes)")
        .map_err(|e| e.to_string())?;
    let columns = statement
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, i32>(3)?,
                row.get::<_, Option<String>>(4)?,
                row.get::<_, i32>(5)?,
            ))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    let expected = [
        ("id", "INTEGER", 0, 1),
        ("title", "TEXT", 1, 0),
        ("body", "TEXT", 1, 0),
        ("created_at", "TEXT", 1, 0),
        ("updated_at", "TEXT", 1, 0),
    ];
    if columns.len() != expected.len()
        || columns.iter().zip(expected).any(|(actual, expected)| {
            (actual.0.as_str(), actual.1.as_str(), actual.2, actual.4) != expected
        })
    {
        return Err("unrecognized notes schema: unexpected columns".into());
    }
    for column in &columns[3..] {
        let default = column.3.as_deref().unwrap_or("").replace(' ', "");
        if default != "strftime('%Y-%m-%dT%H:%M:%fZ','now')" {
            return Err("unrecognized notes timestamp defaults".into());
        }
    }
    if columns[..3].iter().any(|column| column.3.is_some()) {
        return Err("unrecognized notes defaults".into());
    }
    let sql: String = connection
        .query_row(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name='notes'",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    let normalize = |value: &str| {
        value
            .chars()
            .filter(|character| !character.is_whitespace() && *character != ';')
            .collect::<String>()
            .to_uppercase()
            .replace("IFNOTEXISTS", "")
    };
    if normalize(&sql) != normalize(NOTES_SCHEMA) {
        return Err("unrecognized notes table definition".into());
    }
    let mut statement = connection
        .prepare("SELECT name, sql FROM sqlite_master WHERE type='index' AND tbl_name='notes'")
        .map_err(|e| e.to_string())?;
    let indexes = statement
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    for (name, sql) in indexes {
        let expected = match name.as_str() {
            "idx_notes_updated_at" => "CREATE INDEX idx_notes_updated_at ON notes(updated_at DESC)",
            "idx_notes_page" => "CREATE INDEX idx_notes_page ON notes(updated_at DESC, id DESC)",
            _ => return Err("unrecognized notes index".into()),
        };
        if sql.as_deref().map(normalize).as_deref() != Some(normalize(expected).as_str()) {
            return Err("unrecognized notes index definition".into());
        }
    }
    let triggers: i32 = connection
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='trigger'",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    if triggers != 0 {
        return Err("unrecognized database triggers".into());
    }
    Ok(true)
}

fn apply_migration(connection: &Connection, sql: &str) -> Result<(), String> {
    let transaction = connection
        .unchecked_transaction()
        .map_err(|e| e.to_string())?;
    transaction
        .execute_batch(sql)
        .map_err(|e| format!("database migration failed: {e}"))?;
    transaction
        .pragma_update(None, "user_version", CURRENT_VERSION)
        .map_err(|e| e.to_string())?;
    transaction.commit().map_err(|e| e.to_string())
}

pub fn run_migrations(connection: &Connection) -> Result<(), String> {
    let version: i32 = connection
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    if !(0..=CURRENT_VERSION).contains(&version) {
        return Err(format!("unsupported database schema version {version}"));
    }
    let existing = known_notes_schema(connection)?;
    if version == CURRENT_VERSION {
        let page_index: i32 = connection
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name='idx_notes_page'",
                [],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;
        if page_index != 1 {
            return Err("versioned database is missing its paging index".into());
        }
        return if existing {
            Ok(())
        } else {
            Err("versioned database is missing notes schema".into())
        };
    }
    let sql = if existing {
        PAGE_INDEX.to_string()
    } else {
        format!("{NOTES_SCHEMA}\n{PAGE_INDEX}")
    };
    apply_migration(connection, &sql)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn version(connection: &Connection) -> i32 {
        connection
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .unwrap()
    }
    #[test]
    fn initializes_schema_version_once() {
        let connection = Connection::open_in_memory().unwrap();
        run_migrations(&connection).unwrap();
        assert_eq!(version(&connection), 1);
        run_migrations(&connection).unwrap();
    }
    #[test]
    fn migrates_known_legacy_notes_without_losing_data() {
        let connection = Connection::open_in_memory().unwrap();
        connection.execute_batch(NOTES_SCHEMA).unwrap();
        connection
            .execute("INSERT INTO notes(title,body) VALUES('keep','body')", [])
            .unwrap();
        run_migrations(&connection).unwrap();
        assert_eq!(version(&connection), 1);
        let body: String = connection
            .query_row("SELECT body FROM notes", [], |row| row.get(0))
            .unwrap();
        assert_eq!(body, "body");
    }
    #[test]
    fn refuses_unknown_schema_and_future_versions_without_mutation() {
        let connection = Connection::open_in_memory().unwrap();
        connection
            .execute_batch(
                "CREATE TABLE notes (id TEXT PRIMARY KEY); INSERT INTO notes VALUES ('keep');",
            )
            .unwrap();
        assert!(run_migrations(&connection).is_err());
        assert_eq!(version(&connection), 0);
        let value: String = connection
            .query_row("SELECT id FROM notes", [], |row| row.get(0))
            .unwrap();
        assert_eq!(value, "keep");
        connection.pragma_update(None, "user_version", 99).unwrap();
        assert!(run_migrations(&connection).is_err());
        assert_eq!(version(&connection), 99);
    }
    #[test]
    fn failed_migration_rolls_back_data_schema_and_version() {
        let connection = Connection::open_in_memory().unwrap();
        connection.execute_batch(NOTES_SCHEMA).unwrap();
        connection
            .execute("INSERT INTO notes(title,body) VALUES('keep','body')", [])
            .unwrap();
        assert!(apply_migration(
            &connection,
            "DELETE FROM notes; CREATE TABLE partial(value TEXT); INVALID SQL;"
        )
        .is_err());
        assert_eq!(version(&connection), 0);
        assert_eq!(
            connection
                .query_row("SELECT COUNT(*) FROM notes", [], |row| row.get::<_, i32>(0))
                .unwrap(),
            1
        );
        assert_eq!(
            connection
                .query_row(
                    "SELECT COUNT(*) FROM sqlite_master WHERE name='partial'",
                    [],
                    |row| row.get::<_, i32>(0)
                )
                .unwrap(),
            0
        );
    }
}
