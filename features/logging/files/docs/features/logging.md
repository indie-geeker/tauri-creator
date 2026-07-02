# Logging

Adds Rust and frontend logging through `tauri-plugin-log`.

## Frontend

- `src/lib/logger.ts` exports `logger` plus `trace`, `debug`, `info`, `warn`, and `error` helpers.
- Log calls accept an optional structured context object.
- Context values are converted to strings before being sent to the Tauri log guest binding.
- In development, logs also go to the browser console with an ISO timestamp and uppercase level.

## Rust

- `src-tauri/src/lib.rs` registers `tauri_plugin_log::Builder`.
- Logs always target stdout.
- macOS builds also target the OS log directory.
- Webview log forwarding is disabled on Linux to avoid unsafe setup-time webview logging.
- Debug builds use `log::LevelFilter::Debug`; release builds use `log::LevelFilter::Info`.

## Permissions

The feature adds `log:default` so frontend code can use `@tauri-apps/plugin-log`.
