// TAURI_CREATOR:RUST_IMPORTS

pub mod features {
    // TAURI_CREATOR:RUST_FEATURE_MODULES
}

pub mod infrastructure {
    // TAURI_CREATOR:RUST_INFRASTRUCTURE_MODULES
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {name}.")
}

pub fn run() {
    tauri::Builder::default()
        // TAURI_CREATOR:TAURI_PLUGINS
        .setup(|app| {
            // TAURI_CREATOR:TAURI_SETUP
            let _ = app;
            Ok(())
        })
        // TAURI_CREATOR:INVOKE_HANDLER
        .invoke_handler(tauri::generate_handler![
            greet,
            // TAURI_CREATOR:TAURI_COMMANDS
        ])
        .build(tauri::generate_context!())
        .expect("error while building Tauri application")
        .run(|app_handle, event| match &event {
            tauri::RunEvent::Exit => {
                // TAURI_CREATOR:TAURI_EXIT_CLEANUP
                let _ = app_handle;
            }
            // TAURI_CREATOR:TAURI_RUN_EVENT
            _ => {}
        });
}
