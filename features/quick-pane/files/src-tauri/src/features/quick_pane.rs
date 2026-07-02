use serde::{Deserialize, Serialize};
use std::sync::{LazyLock, Mutex};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl};

#[cfg(target_os = "macos")]
use tauri_nspanel::{
    tauri_panel, CollectionBehavior, ManagerExt, PanelBuilder, PanelLevel, StyleMask,
};

#[cfg(target_os = "macos")]
tauri_panel! {
    panel!(QuickPanePanel {
        config: {
            can_become_key_window: true,
            can_become_main_window: false,
            is_floating_panel: true
        }
    })
}

const DEFAULT_SHORTCUT: &str = "CommandOrControl+Shift+.";
const QUICK_PANE_LABEL: &str = "quick-pane";
const QUICK_PANE_STATE_CHANGED_EVENT: &str = "quick-pane-state-changed";
const QUICK_PANE_WIDTH: f64 = 560.0;
const QUICK_PANE_HEIGHT: f64 = 96.0;

static QUICK_PANE_STATE: LazyLock<Mutex<QuickPaneState>> =
    LazyLock::new(|| Mutex::new(QuickPaneState::default()));
static CURRENT_QUICK_PANE_SHORTCUT: LazyLock<Mutex<Option<String>>> =
    LazyLock::new(|| Mutex::new(None));

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuickPaneState {
    pub visible: bool,
    pub shortcut: String,
    pub shortcut_registered: bool,
    pub shortcut_error: Option<String>,
    pub window_error: Option<String>,
}

impl Default for QuickPaneState {
    fn default() -> Self {
        Self {
            visible: false,
            shortcut: DEFAULT_SHORTCUT.to_string(),
            shortcut_registered: false,
            shortcut_error: None,
            window_error: None,
        }
    }
}

#[tauri::command]
pub fn get_quick_pane_state() -> QuickPaneState {
    current_state()
}

#[tauri::command]
pub fn get_default_quick_pane_shortcut() -> String {
    DEFAULT_SHORTCUT.to_string()
}

#[tauri::command]
pub fn show_quick_pane(app: AppHandle) -> QuickPaneState {
    match show_quick_pane_window(&app) {
        Ok(()) => update_visibility(Some(&app), true),
        Err(error) => update_window_status(Some(&app), Some(error)),
    }
}

#[tauri::command]
pub fn dismiss_quick_pane(app: AppHandle) -> QuickPaneState {
    match hide_quick_pane_window(&app) {
        Ok(()) => update_visibility(Some(&app), false),
        Err(error) => update_window_status(Some(&app), Some(error)),
    }
}

#[tauri::command]
pub fn toggle_quick_pane(app: AppHandle) -> QuickPaneState {
    if is_quick_pane_window_visible(&app) {
        dismiss_quick_pane(app)
    } else {
        show_quick_pane(app)
    }
}

#[tauri::command]
pub fn update_quick_pane_shortcut(app: AppHandle, shortcut: Option<String>) -> QuickPaneState {
    let shortcut = shortcut.as_deref().unwrap_or(DEFAULT_SHORTCUT);
    register_quick_pane_shortcut(&app, shortcut)
}

pub fn register_default_quick_pane_shortcut(app: &AppHandle) -> QuickPaneState {
    register_quick_pane_shortcut(app, DEFAULT_SHORTCUT)
}

pub fn register_saved_or_default_quick_pane_shortcut(app: &AppHandle) -> QuickPaneState {
    let saved_shortcut = super::preferences::load_quick_pane_shortcut(app);
    let shortcut = saved_shortcut.as_deref().unwrap_or(DEFAULT_SHORTCUT);
    register_quick_pane_shortcut(app, shortcut)
}

pub fn init_quick_pane_window(app: &AppHandle) -> QuickPaneState {
    match ensure_quick_pane_window(app) {
        Ok(()) => update_window_status(Some(app), None),
        Err(error) => update_window_status(Some(app), Some(error)),
    }
}

pub fn register_quick_pane_shortcut(app: &AppHandle, shortcut: &str) -> QuickPaneState {
    let normalized = shortcut.trim();
    if normalized.is_empty() {
        return update_shortcut_status(
            Some(app),
            None,
            false,
            Some("quick-pane shortcut cannot be empty".to_string()),
        );
    }

    register_global_shortcut(app, normalized)
}

fn register_global_shortcut(app: &AppHandle, shortcut: &str) -> QuickPaneState {
    use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

    let mut current_shortcut = CURRENT_QUICK_PANE_SHORTCUT
        .lock()
        .expect("quick-pane shortcut should not be poisoned");

    if let Some(old_shortcut) = current_shortcut.take() {
        if let Ok(parsed_shortcut) = old_shortcut.parse::<Shortcut>() {
            if let Err(error) = app.global_shortcut().unregister(parsed_shortcut) {
                eprintln!("Failed to unregister quick-pane shortcut '{old_shortcut}': {error}");
            }
        }
    }

    let app_handle = app.clone();
    match app
        .global_shortcut()
        .on_shortcut(shortcut, move |_app, _shortcut, event| {
            if event.state == ShortcutState::Pressed {
                toggle_quick_pane(app_handle.clone());
            }
        }) {
        Ok(()) => {
            *current_shortcut = Some(shortcut.to_string());
            update_shortcut_status(Some(app), Some(shortcut.to_string()), true, None)
        }
        Err(error) => update_shortcut_status(
            Some(app),
            Some(shortcut.to_string()),
            false,
            Some(error.to_string()),
        ),
    }
}

fn ensure_quick_pane_window(app: &AppHandle) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        ensure_quick_pane_panel(app)
    }

    #[cfg(not(target_os = "macos"))]
    {
        ensure_quick_pane_webview_window(app)
    }
}

#[cfg(target_os = "macos")]
fn ensure_quick_pane_panel(app: &AppHandle) -> Result<(), String> {
    use tauri::{LogicalSize, Size};

    if app.get_webview_panel(QUICK_PANE_LABEL).is_ok() {
        return Ok(());
    }

    let panel = PanelBuilder::<_, QuickPanePanel>::new(app, QUICK_PANE_LABEL)
        .url(WebviewUrl::App("quick-pane.html".into()))
        .title("Quick Pane")
        .size(Size::Logical(LogicalSize::new(
            QUICK_PANE_WIDTH,
            QUICK_PANE_HEIGHT,
        )))
        .level(PanelLevel::Status)
        .transparent(true)
        .has_shadow(true)
        .collection_behavior(
            CollectionBehavior::new()
                .full_screen_auxiliary()
                .can_join_all_spaces(),
        )
        .style_mask(StyleMask::empty().nonactivating_panel())
        .hides_on_deactivate(false)
        .works_when_modal(true)
        .with_window(|window| {
            window
                .decorations(false)
                .skip_taskbar(true)
                .resizable(false)
                .center()
        })
        .build()
        .map_err(|error| format!("failed to create quick-pane panel: {error}"))?;

    panel.hide();
    Ok(())
}

#[cfg(not(target_os = "macos"))]
fn ensure_quick_pane_webview_window(app: &AppHandle) -> Result<(), String> {
    use tauri::webview::WebviewWindowBuilder;

    if app.get_webview_window(QUICK_PANE_LABEL).is_some() {
        return Ok(());
    }

    WebviewWindowBuilder::new(
        app,
        QUICK_PANE_LABEL,
        WebviewUrl::App("quick-pane.html".into()),
    )
    .title("Quick Pane")
    .inner_size(QUICK_PANE_WIDTH, QUICK_PANE_HEIGHT)
    .always_on_top(true)
    .skip_taskbar(true)
    .decorations(false)
    .visible(false)
    .resizable(false)
    .center()
    .build()
    .map(|_| ())
    .map_err(|error| format!("failed to create quick-pane window: {error}"))
}

fn centered_quick_pane_position(
    monitor_position: tauri::PhysicalPosition<i32>,
    monitor_size: tauri::PhysicalSize<u32>,
    scale_factor: f64,
) -> tauri::PhysicalPosition<i32> {
    let scaled_width = (QUICK_PANE_WIDTH * scale_factor) as i32;
    let scaled_height = (QUICK_PANE_HEIGHT * scale_factor) as i32;

    tauri::PhysicalPosition::new(
        monitor_position.x + (monitor_size.width as i32 - scaled_width) / 2,
        monitor_position.y + (monitor_size.height as i32 - scaled_height) / 2,
    )
}

fn monitor_for_cursor(
    app: &AppHandle,
    cursor_pos: tauri::PhysicalPosition<f64>,
) -> Option<tauri::Monitor> {
    match app.monitor_from_point(cursor_pos.x, cursor_pos.y) {
        Ok(Some(monitor)) => Some(monitor),
        Ok(None) => app.primary_monitor().ok().flatten(),
        Err(error) => {
            eprintln!("Failed to get monitor for quick-pane cursor position: {error}");
            app.primary_monitor().ok().flatten()
        }
    }
}

fn centered_position_on_cursor_monitor(
    app: &AppHandle,
) -> Result<Option<tauri::PhysicalPosition<i32>>, String> {
    let monitor = match app.cursor_position() {
        Ok(cursor_pos) => monitor_for_cursor(app, cursor_pos),
        Err(error) => {
            eprintln!("Failed to get quick-pane cursor position: {error}");
            app.primary_monitor()
                .map_err(|error| format!("failed to read primary monitor: {error}"))?
        }
    };

    Ok(monitor.map(|monitor| {
        centered_quick_pane_position(*monitor.position(), *monitor.size(), monitor.scale_factor())
    }))
}

fn position_quick_pane_on_cursor_monitor(app: &AppHandle) -> Result<(), String> {
    let Some(position) = centered_position_on_cursor_monitor(app)? else {
        return Ok(());
    };

    let Some(window) = app.get_webview_window(QUICK_PANE_LABEL) else {
        return Ok(());
    };

    window
        .set_position(position)
        .map_err(|error| format!("failed to position quick-pane window: {error}"))
}

fn show_quick_pane_window(app: &AppHandle) -> Result<(), String> {
    ensure_quick_pane_window(app)?;
    position_quick_pane_on_cursor_monitor(app)?;

    #[cfg(target_os = "macos")]
    {
        let panel = app
            .get_webview_panel(QUICK_PANE_LABEL)
            .map_err(|error| format!("quick-pane panel not found: {error:?}"))?;

        panel.show_and_make_key();
        Ok(())
    }

    #[cfg(not(target_os = "macos"))]
    {
        let window = app
            .get_webview_window(QUICK_PANE_LABEL)
            .ok_or_else(|| "quick-pane window was not created".to_string())?;

        window
            .show()
            .map_err(|error| format!("failed to show quick-pane window: {error}"))?;
        window
            .set_focus()
            .map_err(|error| format!("failed to focus quick-pane window: {error}"))?;

        Ok(())
    }
}

fn hide_quick_pane_window(app: &AppHandle) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let Ok(panel) = app.get_webview_panel(QUICK_PANE_LABEL) else {
            return Ok(());
        };

        if !panel.is_visible() {
            return Ok(());
        }

        panel.resign_key_window();
        panel.hide();
        Ok(())
    }

    #[cfg(not(target_os = "macos"))]
    {
        let Some(window) = app.get_webview_window(QUICK_PANE_LABEL) else {
            return Ok(());
        };

        if !window.is_visible().unwrap_or(false) {
            return Ok(());
        }

        window
            .hide()
            .map_err(|error| format!("failed to hide quick-pane window: {error}"))
    }
}

fn is_quick_pane_window_visible(app: &AppHandle) -> bool {
    #[cfg(target_os = "macos")]
    {
        app.get_webview_panel(QUICK_PANE_LABEL)
            .map(|panel| panel.is_visible())
            .unwrap_or(false)
    }

    #[cfg(not(target_os = "macos"))]
    {
        app.get_webview_window(QUICK_PANE_LABEL)
            .and_then(|window| window.is_visible().ok())
            .unwrap_or(false)
    }
}

#[cfg(test)]
fn toggle_state(app: Option<&AppHandle>) -> QuickPaneState {
    let mut store = QUICK_PANE_STATE
        .lock()
        .expect("quick-pane state should not be poisoned");

    store.visible = !store.visible;
    emit_state(app, store.clone())
}

fn update_shortcut_status(
    app: Option<&AppHandle>,
    shortcut: Option<String>,
    registered: bool,
    error: Option<String>,
) -> QuickPaneState {
    let mut store = QUICK_PANE_STATE
        .lock()
        .expect("quick-pane state should not be poisoned");

    if let Some(shortcut) = shortcut {
        store.shortcut = shortcut;
    }
    store.shortcut_registered = registered;
    store.shortcut_error = error;

    emit_state(app, store.clone())
}

fn update_window_status(app: Option<&AppHandle>, error: Option<String>) -> QuickPaneState {
    let mut store = QUICK_PANE_STATE
        .lock()
        .expect("quick-pane state should not be poisoned");

    store.window_error = error;

    emit_state(app, store.clone())
}

fn update_visibility(app: Option<&AppHandle>, visible: bool) -> QuickPaneState {
    let mut store = QUICK_PANE_STATE
        .lock()
        .expect("quick-pane state should not be poisoned");

    store.visible = visible;
    store.window_error = None;
    emit_state(app, store.clone())
}

fn current_state() -> QuickPaneState {
    QUICK_PANE_STATE
        .lock()
        .expect("quick-pane state should not be poisoned")
        .clone()
}

fn emit_state(app: Option<&AppHandle>, state: QuickPaneState) -> QuickPaneState {
    if let Some(app) = app {
        if let Err(error) = app.emit(QUICK_PANE_STATE_CHANGED_EVENT, state.clone()) {
            eprintln!("Failed to emit quick-pane state: {error}");
        }
    }

    state
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    static TEST_LOCK: Mutex<()> = Mutex::new(());

    fn reset_state() {
        let mut store = QUICK_PANE_STATE
            .lock()
            .expect("quick-pane state should not be poisoned");
        *store = QuickPaneState::default();
    }

    #[test]
    fn toggle_quick_pane_flips_visibility() {
        let _guard = TEST_LOCK.lock().expect("test lock should not be poisoned");
        reset_state();

        update_visibility(None, false);

        let opened = toggle_state(None);
        assert!(opened.visible);

        let closed = toggle_state(None);
        assert!(!closed.visible);
    }

    #[test]
    fn update_shortcut_status_records_errors() {
        let _guard = TEST_LOCK.lock().expect("test lock should not be poisoned");
        reset_state();

        let state = update_shortcut_status(
            None,
            None,
            false,
            Some("quick-pane shortcut cannot be empty".to_string()),
        );

        assert_eq!(
            state.shortcut_error,
            Some("quick-pane shortcut cannot be empty".to_string())
        );
        assert!(!state.shortcut_registered);
        assert_eq!(state.window_error, None);
    }

    #[test]
    fn update_shortcut_status_records_success() {
        let _guard = TEST_LOCK.lock().expect("test lock should not be poisoned");
        reset_state();

        let state = update_shortcut_status(
            None,
            Some("CommandOrControl+Alt+Space".to_string()),
            true,
            None,
        );

        assert_eq!(state.shortcut, "CommandOrControl+Alt+Space");
        assert!(state.shortcut_registered);
        assert_eq!(state.shortcut_error, None);
    }

    #[test]
    fn get_default_quick_pane_shortcut_returns_default_shortcut() {
        assert_eq!(get_default_quick_pane_shortcut(), DEFAULT_SHORTCUT);
    }

    #[test]
    fn update_window_status_records_errors() {
        let _guard = TEST_LOCK.lock().expect("test lock should not be poisoned");
        reset_state();

        let state =
            update_window_status(None, Some("failed to create quick-pane window".to_string()));

        assert_eq!(
            state.window_error,
            Some("failed to create quick-pane window".to_string())
        );
    }

    #[test]
    fn update_visibility_clears_window_errors() {
        let _guard = TEST_LOCK.lock().expect("test lock should not be poisoned");
        reset_state();

        update_window_status(None, Some("failed to show quick-pane window".to_string()));
        let state = update_visibility(None, true);

        assert!(state.visible);
        assert_eq!(state.window_error, None);
    }

    #[test]
    fn centered_quick_pane_position_accounts_for_monitor_scale() {
        let position = centered_quick_pane_position(
            tauri::PhysicalPosition::new(100, 200),
            tauri::PhysicalSize::new(2560, 1440),
            2.0,
        );

        assert_eq!(position.x, 820);
        assert_eq!(position.y, 824);
    }
}
