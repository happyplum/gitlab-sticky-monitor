use tauri::{
    menu::MenuBuilder,
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
};

pub fn setup_tray(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let menu = MenuBuilder::new(app)
        .text("open_manager", "打开管理面板")
        .text("new_note", "新建便笺")
        .text("refresh", "立即刷新")
        .separator()
        .text("quit", "退出")
        .build()?;

    let mut builder = TrayIconBuilder::new()
        .menu(&menu)
        .show_menu_on_left_click(false)
        .tooltip("GitLab 便笺监控")
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("manager") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        })
        .on_menu_event(move |app, event| {
            match event.id.as_ref() {
                "open_manager" => {
                    if let Some(window) = app.get_webview_window("manager") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
                "new_note" => {
                    if let Some(window) = app.get_webview_window("manager") {
                        let _ = window.show();
                        let _ = window.set_focus();
                        let _ = window.emit("navigate", "new-note");
                    }
                }
                "refresh" => {
                    let _ = app.emit("force-refresh", ());
                }
                "quit" => {
                    crate::lifecycle::request_exit(app.clone());
                }
                _ => {}
            }
        });

    if let Some(icon) = app.default_window_icon().cloned() {
        builder = builder.icon(icon);
    }

    builder.build(app)?;

    Ok(())
}

