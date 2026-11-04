mod commands;
mod gitlab;
mod storage;
mod tray;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // Setup system tray
            tray::setup_tray(app)?;

            // Load config and start polling
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = commands::init_polling(app_handle).await {
                    log::error!("Failed to init polling: {}", e);
                }
            });

            // Hide manager window initially (start in tray)
            if let Some(window) = app.get_webview_window("manager") {
                let _ = window.hide();
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::gitlab::test_connection,
            commands::gitlab::get_current_user,
            commands::gitlab::get_projects,
            commands::gitlab::get_issues,
            commands::gitlab::get_merge_requests,
            commands::gitlab::get_todos,
            commands::gitlab::add_comment,
            commands::notes::create_note,
            commands::notes::remove_note,
            commands::notes::update_note_position,
            commands::notes::update_note_size,
            commands::notes::update_note_config,
            commands::notes::get_note_config,
            commands::notes::get_all_notes,
            commands::settings::get_settings,
            commands::settings::save_settings,
            commands::settings::get_watched_repos,
            commands::settings::add_watched_repo,
            commands::settings::remove_watched_repo,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
