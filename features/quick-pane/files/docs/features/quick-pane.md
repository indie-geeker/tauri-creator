# Quick Pane

Adds a secondary quick-entry window and a Rust-owned global shortcut. On macOS, the secondary window is backed by `tauri-nspanel`.

## Frontend

- `QuickPanePanel` is available as an optional control surface, but this feature does not render it in the main window by default.
- `getQuickPaneState()` reads backend shortcut registration status.
- `getDefaultQuickPaneShortcut()` reads the backend default shortcut constant.
- `showQuickPane()`, `dismissQuickPane()`, `toggleQuickPane()`, and `updateQuickPaneShortcut()` call Rust commands.
- `updateQuickPaneShortcut(null)` restores the backend default shortcut.
- `quick-pane.html` and `src/quick-pane-main.tsx` provide the secondary quick-entry window.
- `QuickPaneWindow` emits `quick-pane-submit` on Enter and dismisses itself on Enter or Escape.

## Rust

- `src-tauri/src/features/quick_pane.rs` owns quick-pane window, visibility, and shortcut state.
- The feature registers `tauri_plugin_global_shortcut::Builder` during Tauri setup.
- Shortcut registration happens in Rust via `GlobalShortcutExt`.
- `init_quick_pane_window()` creates a hidden `quick-pane` NSPanel on macOS and a hidden webview window elsewhere.
- `show_quick_pane()` and `dismiss_quick_pane()` operate on the secondary window instead of only flipping in-memory state.
- Startup registers the saved `preferences.quick_pane_shortcut` value, falling back to `CommandOrControl+Shift+.`.
- The feature enables `macOSPrivateApi` and `tauri`'s `macos-private-api` feature because `tauri-nspanel` needs them.

## Permissions

The feature does not expose global shortcut registration to frontend JavaScript.
It only adds `core:event:default` so the UI can receive backend state changes.
