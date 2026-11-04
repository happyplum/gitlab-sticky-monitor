use crate::storage::{self, WatchedRepo};
use crate::gitlab::client::GitLabClient;
use super::{get_client, get_config};

#[derive(serde::Serialize)]
pub struct SettingsResponse {
    pub base_url: String,
    pub has_token: bool,
    pub polling_interval_secs: u64,
}

#[tauri::command]
pub async fn get_settings() -> Result<SettingsResponse, String> {
    let cfg = get_config().read().await;
    Ok(SettingsResponse {
        base_url: cfg.gitlab.base_url.clone(),
        has_token: !cfg.gitlab.token.is_empty(),
        polling_interval_secs: cfg.polling_interval_secs,
    })
}

#[tauri::command]
pub async fn save_settings(
    base_url: String,
    token: Option<String>,
    polling_interval_secs: Option<u64>,
) -> Result<(), String> {
    let mut cfg = get_config().write().await;
    cfg.gitlab.base_url = base_url.clone();
    if let Some(t) = token.as_ref() {
        cfg.gitlab.token = t.clone();
    }
    if let Some(p) = polling_interval_secs {
        cfg.polling_interval_secs = p;
    }
    storage::save_config(&cfg)?;

    // Update the client
    if let Some(t) = token {
        let mut c = get_client().write().await;
        *c = Some(GitLabClient::new(&base_url, &t));
    }

    Ok(())
}

#[tauri::command]
pub async fn get_watched_repos() -> Result<Vec<WatchedRepo>, String> {
    let cfg = get_config().read().await;
    Ok(cfg.watched_repos.clone())
}

#[tauri::command]
pub async fn add_watched_repo(
    project_id: u64,
    name: String,
    path: String,
    web_url: String,
) -> Result<(), String> {
    let mut cfg = get_config().write().await;
    // avoid duplicates
    if cfg.watched_repos.iter().any(|r| r.project_id == project_id) {
        return Err("Repository already watched".to_string());
    }
    cfg.watched_repos.push(WatchedRepo {
        project_id,
        name,
        path,
        web_url,
    });
    storage::save_config(&cfg)
}

#[tauri::command]
pub async fn remove_watched_repo(project_id: u64) -> Result<(), String> {
    let mut cfg = get_config().write().await;
    cfg.watched_repos.retain(|r| r.project_id != project_id);
    storage::save_config(&cfg)
}
