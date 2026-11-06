use std::collections::HashSet;
use std::sync::{atomic::{AtomicBool, Ordering}, Mutex};
use tauri::{AppHandle, Emitter, Manager, WebviewWindow};

struct ExitRequest { id: String, waiting: HashSet<String> }
static PENDING: Mutex<Option<ExitRequest>> = Mutex::new(None);
static ALLOWED: AtomicBool = AtomicBool::new(false);

pub fn exit_allowed() -> bool { ALLOWED.load(Ordering::SeqCst) }

fn cancel(app: &AppHandle, error: &str) {
    let _ = app.emit("exit-cancelled", error);
    if let Some(manager) = app.get_webview_window("manager") { let _ = manager.show(); let _ = manager.set_focus(); }
}

pub fn request_exit(app: AppHandle) {
    let id = uuid::Uuid::new_v4().to_string();
    let windows: Vec<_> = app.webview_windows().into_values().filter(|w| w.label().starts_with("note-")).collect();
    {
        let mut pending = PENDING.lock().unwrap();
        if pending.is_some() { return; }
        if windows.is_empty() { ALLOWED.store(true, Ordering::SeqCst); app.exit(0); return; }
        *pending = Some(ExitRequest { id: id.clone(), waiting: windows.iter().map(|w| w.label().to_string()).collect() });
    }
    for window in windows {
        if window.emit_to(window.label(), "prepare-exit", &id).is_err() {
            *PENDING.lock().unwrap() = None;
            cancel(&app, "便笺未能响应保存请求，请稍后重试退出");
            return;
        }
    }
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_secs(10)).await;
        let timed_out = {
            let mut pending = PENDING.lock().unwrap();
            if pending.as_ref().is_some_and(|p| p.id == id) { *pending = None; true } else { false }
        };
        if timed_out { cancel(&app, "等待便笺保存超时，尚未退出，请重试"); }
    });
}

#[tauri::command]
pub fn acknowledge_exit(app: AppHandle, window: WebviewWindow, request_id: String, error: Option<String>) {
    let ready = {
        let mut pending = PENDING.lock().unwrap();
        let Some(request) = pending.as_mut() else { return; };
        if request.id != request_id || !request.waiting.remove(window.label()) { return; }
        if error.is_some() { *pending = None; false }
        else if request.waiting.is_empty() { *pending = None; true }
        else { false }
    };
    if let Some(error) = error { cancel(&app, &error); }
    else if ready { ALLOWED.store(true, Ordering::SeqCst); app.exit(0); }
}
