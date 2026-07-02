# Diagnostics

Adds a support diagnostics API for production troubleshooting.

## Frontend

- `collectDiagnostics()` invokes the Tauri `collect_diagnostics` command and returns runtime metadata, support paths, aggregate status, and individual checks.
- `exportDiagnostics()` invokes `export_diagnostics` and returns a pretty JSON string that can be attached to support requests.
- `DiagnosticsSnapshot.status` is `ok`, `warning`, or `error`. Missing app-data or log directories are reported as checks instead of throwing.

## Rust

- `src-tauri/src/features/diagnostics.rs` resolves Tauri app data and app log directories through `AppHandle`.
- The command returns package name, version, OS, architecture, app-data path, log path, and check details.
- Pure helpers accept explicit paths so the generated app can test diagnostics without launching the Tauri runtime.

## Logging Integration

When the `logging` feature is also enabled, `logDir` points to Tauri's application log directory. The directory may not exist until the first file log is written; diagnostics reports that as a `warning` instead of panicking.
