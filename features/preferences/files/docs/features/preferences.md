# Preferences

Adds typed app preferences backed by Rust commands and an app data JSON file.

## Frontend

- `loadPreferences()` invokes the Tauri `load_preferences` command.
- `savePreferences(preferences)` invokes `save_preferences` and returns the saved snapshot.
- The v1 snapshot shape is `{ theme: 'system' | 'light' | 'dark', language: 'system' | 'en' | 'zh-CN', quick_pane_shortcut: string | null }`.

## Rust

- `src-tauri/src/features/preferences.rs` stores `preferences.json` in Tauri's app data directory.
- Missing preferences load as `{ theme: "system", language: "system", quick_pane_shortcut: null }`.
- Saves validate the theme, language, and optional quick-pane shortcut before writing.
- Writes use a temporary file and rename it over the final file so partial JSON is not left behind on normal failures.
- Commands return `Result<T, String>` so frontend calls receive normal Tauri command errors when load, parse, validation, or write operations fail.
