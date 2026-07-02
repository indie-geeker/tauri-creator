# SQLite

Adds file-backed SQLite persistence with a notes repository and frontend query hooks.

## Frontend

- `getDatabaseHealth()` invokes `get_database_health` and returns the SQLite driver, database path, and file-backed status.
- `listNotes()` invokes `list_notes`.
- `createNote(input)` invokes `create_note`.
- `updateNote(input)` invokes `update_note`.
- `deleteNote(id)` invokes `delete_note`.
- `useDatabaseHealth()`, `useNotes()`, `useCreateNote()`, `useUpdateNote()`, and `useDeleteNote()` wrap the commands with TanStack Query.

## Rust

- `src-tauri/src/infrastructure/database/mod.rs` owns the database entry point.
- `migrations.rs` creates the `notes` table and index.
- `notes.rs` implements file-backed create, list, update, and delete operations.
- Commands resolve `app.sqlite3` under Tauri's app data directory, create parent directories when needed, and run migrations idempotently before use.

## Data Model

`Note` records include `id`, `title`, `body`, `createdAt`, and `updatedAt`. Titles must not be empty.
