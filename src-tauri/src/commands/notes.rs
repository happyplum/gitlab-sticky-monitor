use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};
use crate::storage::{self, NoteConfig, NoteFilters, Position, Size};
use super::get_config;

#[tauri::command]
pub async fn create_note(
    app: AppHandle,
    source_id: Option<String>,
    repo_id: u64,
    repo_name: String,
    color: String,
) -> Result<String, String> {
    let resolved_source_id = {
        let cfg = get_config().read().await;
        source_id
            .filter(|s| !s.is_empty())
            .or_else(|| cfg.sources.first().map(|s| s.id.clone()))
            .unwrap_or_else(|| "default".to_string())
    };

    let note_id = format!("note-{}", uuid::Uuid::new_v4().to_string().split('-').next().unwrap());
    let url = format!(
        "index.html?window=note&sourceId={}&repo={}&name={}&color={}&noteId={}",
        urlencoding_simple(&resolved_source_id),
        repo_id,
        urlencoding_simple(&repo_name),
        urlencoding_simple(&color),
        &note_id,
    );

    WebviewWindowBuilder::new(
        &app,
        &note_id,
        WebviewUrl::App(std::path::PathBuf::from(url)),
    )
    .title(&repo_name)
    .inner_size(340.0, 450.0)
    .decorations(false)
    .transparent(true)
    .always_on_top(true)
    .skip_taskbar(true)
    .resizable(true)
    .build()
    .map_err(|e| e.to_string())?;

    // Save note config
    let note_config = NoteConfig {
        id: note_id.clone(),
        source_id: resolved_source_id,
        repo_id,
        repo_name,
        color,
        position: Position { x: 100.0, y: 100.0 },
        size: Size { w: 340.0, h: 450.0 },
        always_on_top: true,
        filters: NoteFilters::default(),
    };

    {
        let mut cfg = get_config().write().await;
        cfg.notes.push(note_config);
        storage::save_config(&cfg)?;
    }

    Ok(note_id)
}

pub fn restore_note_window(app: &AppHandle, note: &NoteConfig) -> Result<(), String> {
    let url = format!(
        "index.html?window=note&sourceId={}&repo={}&name={}&color={}&noteId={}",
        urlencoding_simple(&note.source_id),
        note.repo_id,
        urlencoding_simple(&note.repo_name),
        urlencoding_simple(&note.color),
        &note.id,
    );

    WebviewWindowBuilder::new(
        app,
        &note.id,
        WebviewUrl::App(std::path::PathBuf::from(url)),
    )
    .title(&note.repo_name)
    .inner_size(note.size.w, note.size.h)
    .position(note.position.x, note.position.y)
    .decorations(false)
    .transparent(true)
    .always_on_top(note.always_on_top)
    .skip_taskbar(true)
    .resizable(true)
    .build()
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn remove_note(app: AppHandle, note_id: String) -> Result<(), String> {
    // Close the window
    if let Some(window) = app.get_webview_window(&note_id) {
        let _ = window.close();
    }

    // Remove from config
    {
        let mut cfg = get_config().write().await;
        cfg.notes.retain(|n| n.id != note_id);
        storage::save_config(&cfg)?;
    }

    Ok(())
}

#[tauri::command]
pub async fn update_note_position(note_id: String, x: f64, y: f64) -> Result<(), String> {
    let mut cfg = get_config().write().await;
    if let Some(note) = cfg.notes.iter_mut().find(|n| n.id == note_id) {
        note.position = Position { x, y };
        storage::save_config(&cfg)?;
    }
    Ok(())
}

#[tauri::command]
pub async fn update_note_size(note_id: String, w: f64, h: f64) -> Result<(), String> {
    let mut cfg = get_config().write().await;
    if let Some(note) = cfg.notes.iter_mut().find(|n| n.id == note_id) {
        note.size = Size { w, h };
        storage::save_config(&cfg)?;
    }
    Ok(())
}

#[tauri::command]
pub async fn get_note_config(note_id: String) -> Result<Option<NoteConfig>, String> {
    let cfg = get_config().read().await;
    Ok(cfg.notes.iter().find(|n| n.id == note_id).cloned())
}

#[tauri::command]
pub async fn update_note_config(
    note_id: String,
    color: Option<String>,
    always_on_top: Option<bool>,
    show_issues: Option<bool>,
    show_mrs: Option<bool>,
    only_assigned_to_me: Option<bool>,
    labels: Option<Vec<String>>,
) -> Result<(), String> {
    let mut cfg = get_config().write().await;
    if let Some(note) = cfg.notes.iter_mut().find(|n| n.id == note_id) {
        if let Some(c) = color {
            note.color = c;
        }
        if let Some(aot) = always_on_top {
            note.always_on_top = aot;
        }
        if let Some(si) = show_issues {
            note.filters.show_issues = si;
        }
        if let Some(sm) = show_mrs {
            note.filters.show_mrs = sm;
        }
        if let Some(oam) = only_assigned_to_me {
            note.filters.only_assigned_to_me = oam;
        }
        if let Some(lbls) = labels {
            note.filters.labels = lbls;
        }
        storage::save_config(&cfg)?;
    }
    Ok(())
}

#[tauri::command]
pub async fn get_all_notes() -> Result<Vec<NoteConfig>, String> {
    let cfg = get_config().read().await;
    Ok(cfg.notes.clone())
}

fn urlencoding_simple(s: &str) -> String {
    let mut encoded = String::with_capacity(s.len() * 3);
    for b in s.bytes() {
        if b.is_ascii_alphanumeric() || b == b'-' || b == b'_' || b == b'.' || b == b'~' {
            encoded.push(b as char);
        } else {
            encoded.push_str(&format!("%{:02X}", b));
        }
    }
    encoded
}
