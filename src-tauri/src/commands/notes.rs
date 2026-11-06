use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};
use crate::storage::{self, NoteConfig, NoteContent, NoteFeed, NoteFilters, Position, Size};
use super::get_config;

fn changed(app: &AppHandle) { let _ = app.emit("notes-changed", ()); }

#[tauri::command]
pub async fn create_note(app: AppHandle, source_id: String, repo_id: u64, feed: NoteFeed, color: String) -> Result<String, String> {
    let content = {
        let cfg = get_config().read().await;
        let repo = cfg.watched_repos.iter().find(|repo| repo.source_id == source_id && repo.project_id == repo_id)
            .ok_or("请先监听该源下的仓库")?;
        NoteContent::Gitlab { source_id, repo_id, repo_name: repo.name.clone(), feed, filters: NoteFilters::default() }
    };
    create(app, color, content).await
}

#[tauri::command]
pub async fn create_custom_note(app: AppHandle, color: String) -> Result<String, String> {
    create(app, color, NoteContent::Custom { document: storage::empty_document() }).await
}

async fn create(app: AppHandle, color: String, content: NoteContent) -> Result<String, String> {
    let note = NoteConfig {
        id: format!("note-{}", uuid::Uuid::new_v4()), color, content,
        position: Position { x: 100.0, y: 100.0 }, size: Size { w: 340.0, h: 450.0 },
        always_on_top: true, is_open: true,
    };
    {
        let mut cfg = get_config().write().await;
        storage::update_config(&mut cfg, |cfg| { cfg.notes.push(note.clone()); Ok(()) })?;
    }
    changed(&app);
    restore_note_window(&app, &note)?;
    Ok(note.id)
}

pub fn restore_note_window(app: &AppHandle, note: &NoteConfig) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(&note.id) {
        window.show().map_err(|e| e.to_string())?;
        return window.set_focus().map_err(|e| e.to_string());
    }
    // Position events contain physical pixels, including negative coordinates on secondary displays.
    let window = WebviewWindowBuilder::new(app, &note.id,
        WebviewUrl::App(format!("index.html?window=note&noteId={}", note.id).into()))
        .title(note.title()).inner_size(note.size.w, note.size.h).min_inner_size(200.0, 120.0)
        .decorations(false).transparent(true).always_on_top(note.always_on_top)
        .skip_taskbar(true).resizable(true).visible(false)
        .build().map_err(|e| e.to_string())?;
    window.set_position(tauri::PhysicalPosition::new(note.position.x as i32, note.position.y as i32)).map_err(|e| e.to_string())?;
    window.show().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn open_note(app: AppHandle, note_id: String) -> Result<(), String> {
    let note = {
        let mut cfg = get_config().write().await;
        storage::update_config(&mut cfg, |cfg| {
            let note = cfg.notes.iter_mut().find(|n| n.id == note_id).ok_or("便笺不存在")?;
            note.is_open = true;
            Ok(note.clone())
        })?
    };
    changed(&app);
    restore_note_window(&app, &note)
}

#[tauri::command]
pub async fn hide_note(app: AppHandle, note_id: String) -> Result<(), String> {
    {
        let mut cfg = get_config().write().await;
        storage::update_config(&mut cfg, |cfg| {
            cfg.notes.iter_mut().find(|n| n.id == note_id).ok_or("便笺不存在")?.is_open = false;
            Ok(())
        })?;
    }
    changed(&app);
    if let Some(window) = app.get_webview_window(&note_id) { window.hide().map_err(|e| e.to_string())?; }
    Ok(())
}

#[tauri::command]
pub async fn remove_note(app: AppHandle, note_id: String) -> Result<(), String> {
    {
        let mut cfg = get_config().write().await;
        storage::update_config(&mut cfg, |cfg| {
            if !cfg.notes.iter().any(|n| n.id == note_id) { return Err("便笺不存在".into()); }
            cfg.notes.retain(|n| n.id != note_id);
            Ok(())
        })?;
    }
    changed(&app);
    if let Some(window) = app.get_webview_window(&note_id) { window.destroy().map_err(|e| e.to_string())?; }
    Ok(())
}

#[tauri::command]
pub async fn save_note_document(note_id: String, document: serde_json::Value) -> Result<(), String> {
    storage::validate_document(&document)?;
    let mut cfg = get_config().write().await;
    storage::update_config(&mut cfg, |cfg| {
        let note = cfg.notes.iter_mut().find(|n| n.id == note_id).ok_or("便笺不存在")?;
        match &mut note.content {
            NoteContent::Custom { document: saved } => { *saved = document; Ok(()) },
            _ => Err("只有自定义便笺可以编辑正文".into()),
        }
    })
}

#[tauri::command]
pub async fn update_note_position(note_id: String, x: f64, y: f64) -> Result<(), String> {
    if !x.is_finite() || !y.is_finite() { return Err("便笺坐标无效".into()); }
    let mut cfg = get_config().write().await;
    storage::update_config(&mut cfg, |cfg| {
        cfg.notes.iter_mut().find(|n| n.id == note_id).ok_or("便笺不存在")?.position = Position { x, y };
        Ok(())
    })
}

#[tauri::command]
pub async fn update_note_size(note_id: String, w: f64, h: f64) -> Result<(), String> {
    if !w.is_finite() || !h.is_finite() || w <= 0.0 || h <= 0.0 { return Err("便笺尺寸无效".into()); }
    let mut cfg = get_config().write().await;
    storage::update_config(&mut cfg, |cfg| {
        cfg.notes.iter_mut().find(|n| n.id == note_id).ok_or("便笺不存在")?.size = Size { w, h };
        Ok(())
    })
}

#[tauri::command]
pub async fn get_note_config(note_id: String) -> Result<Option<NoteConfig>, String> {
    Ok(get_config().read().await.notes.iter().find(|n| n.id == note_id).cloned())
}

#[tauri::command]
pub async fn update_note_config(app: AppHandle, note_id: String, color: Option<String>, always_on_top: Option<bool>,
    only_assigned_to_me: Option<bool>, labels: Option<Vec<String>>) -> Result<(), String> {
    {
        let mut cfg = get_config().write().await;
        storage::update_config(&mut cfg, |cfg| {
            let note = cfg.notes.iter_mut().find(|n| n.id == note_id).ok_or("便笺不存在")?;
            if let Some(color) = color { note.color = color; }
            if let Some(pinned) = always_on_top { note.always_on_top = pinned; }
            if let NoteContent::Gitlab { filters, .. } = &mut note.content {
                if let Some(assigned) = only_assigned_to_me { filters.only_assigned_to_me = assigned; }
                if let Some(labels) = labels { filters.labels = labels; }
            }
            Ok(())
        })?;
    }
    changed(&app);
    if let (Some(pinned), Some(window)) = (always_on_top, app.get_webview_window(&note_id)) {
        window.set_always_on_top(pinned).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn get_all_notes() -> Result<Vec<NoteConfig>, String> { Ok(get_config().read().await.notes.clone()) }
