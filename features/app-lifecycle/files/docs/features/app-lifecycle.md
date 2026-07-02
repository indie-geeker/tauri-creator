# App Lifecycle

Adds lifecycle behavior for desktop apps that should stay resident on macOS.

## Runtime

- The base app builds the Tauri application before calling `run`, which exposes run-event marker hooks for optional features.
- On macOS, closing the main window prevents the close and hides the window instead.
- On macOS dock reopen, the main window is shown and focused again.
- Actual process exit keeps an explicit cleanup hook marker so other features can add teardown behavior without rewriting the run loop.

## Rust

- `src-tauri/src/lib.rs` imports `tauri::Manager` for window lookup.
- The feature uses `tauri::RunEvent::WindowEvent`, `tauri::WindowEvent::CloseRequested`, `tauri::RunEvent::Reopen`, and `tauri::RunEvent::Exit`.
- Lifecycle events use the Rust `log` facade, so they are picked up when the `logging` feature is also enabled.

## Integration Notes

Features with resident windows, global shortcuts, tray entries, or background workers should use the base exit cleanup marker for teardown instead of adding a second `run` loop.
