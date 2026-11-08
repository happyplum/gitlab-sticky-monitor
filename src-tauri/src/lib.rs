mod commands;
mod gitlab;
mod storage;
mod tray;
mod lifecycle;
mod updater;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            commands::init_config().map_err(std::io::Error::other)?;
            // Setup system tray
            tray::setup_tray(app)?;

            // Load config and start polling
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = commands::init_polling(app_handle).await {
                    log::error!("Failed to init polling: {}", e);
                }
            });

            // 自动检查更新：auto_check 默认开启；仅发事件供 UI 提示，不自动下载。
            let auto_check_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = updater::startup_auto_check(auto_check_handle).await {
                    log::warn!("Startup update check failed: {}", e);
                }
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "manager" {
                    // Minimize to tray instead of destroying window
                    let _ = window.hide();
                    api.prevent_close();
                } else if window.label().starts_with("note-") {
                    use tauri::Emitter;
                    api.prevent_close();
                    let _ = window.emit_to(window.label(), "request-note-close", ());
                }
            }
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
            commands::notes::create_custom_note,
            commands::notes::open_note,
            commands::notes::hide_note,
            commands::notes::save_note_document,
            lifecycle::acknowledge_exit,
            commands::notes::remove_note,
            commands::notes::update_note_position,
            commands::notes::update_note_size,
            commands::notes::update_note_config,
            commands::notes::get_note_config,
            commands::notes::get_all_notes,
            commands::settings::get_settings,
            commands::settings::save_settings,
            commands::settings::get_sources,
            commands::settings::save_source,
            commands::settings::delete_source,
            commands::settings::test_source_connection,
            commands::settings::get_watched_repos,
            commands::settings::add_watched_repo,
            commands::settings::remove_watched_repo,
            commands::updater_check,
            commands::updater_download_and_install,
            commands::updater_current_version,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if let tauri::RunEvent::ExitRequested { api, .. } = event {
                if !lifecycle::exit_allowed() {
                    api.prevent_exit();
                    lifecycle::request_exit(app.clone());
                }
            }
        });
}
